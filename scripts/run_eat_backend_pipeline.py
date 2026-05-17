#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import math
import os
import pathlib
import subprocess
import time

import nibabel as nib
import numpy as np
import pydicom
from scipy import ndimage


ANGLE_SAMPLES = 96
RAY_STEP_PX = 0.75
MIN_SLICE_PIXELS = 24
MIN_EXPAND_MM = 8.0
MAX_EXPAND_MM = 18.0
MAX_LEARNED_MARGIN_MM = 36.0
MAX_PROFILE_BLEND_WEIGHT = 0.78
FULL_PROFILE_BLEND_SLICE_COUNT = 72

TOTALSEG_TOTAL_ROIS = [
    "heart",
    "aorta",
    "pulmonary_vein",
    "atrial_appendage_left",
    "superior_vena_cava",
    "inferior_vena_cava",
]

TOTALSEG_HIGHRES_ROIS = [
    "heart_myocardium",
    "heart_atrium_left",
    "heart_ventricle_left",
    "heart_atrium_right",
    "heart_ventricle_right",
    "aorta",
    "pulmonary_artery",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the EAT backend AI-assisted contour pipeline.")
    parser.add_argument("--mode", choices=("segment", "feedback"), default="segment")
    parser.add_argument("--input-dir", type=pathlib.Path, required=True, help="Input DICOM directory.")
    parser.add_argument("--output-dir", type=pathlib.Path, required=True, help="Output artifact directory.")
    parser.add_argument("--result-json", type=pathlib.Path, required=True, help="Result payload path.")
    parser.add_argument("--annotations-json", type=pathlib.Path, help="Reference-standard contour payload path.")
    parser.add_argument("--profile-json", type=pathlib.Path, help="Learned contour profile path.")
    parser.add_argument("--totalsegmentator-command", type=str, default="TotalSegmentator")
    parser.add_argument(
        "--provider",
        choices=("auto", "totalsegmentator_total_roi", "totalsegmentator_heartchambers_highres"),
        default="auto",
    )
    parser.add_argument("--top-slice-index", type=int, default=0)
    parser.add_argument("--bottom-slice-index", type=int, default=-1)
    parser.add_argument("--threshold-min-hu", type=float, default=-190.0)
    parser.add_argument("--threshold-max-hu", type=float, default=-30.0)
    return parser.parse_args()


def ensure_parent(path: pathlib.Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def write_json(path: pathlib.Path, payload: dict) -> None:
    ensure_parent(path)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def read_json(path: pathlib.Path | None) -> dict | None:
    if not path or not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def clip_number(value, minimum: float, maximum: float, fallback: float | None = None) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback if fallback is not None else minimum
    return min(maximum, max(minimum, number))


def default_training_profile() -> dict:
    return {
        "version": 1,
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
        "learnedCaseCount": 0,
        "confirmedSliceCount": 0,
        "angleSamples": ANGLE_SAMPLES,
        "angleMarginSumMm": [0.0] * ANGLE_SAMPLES,
        "angleMarginMeanMm": [0.0] * ANGLE_SAMPLES,
        "globalMarginMmMean": None,
        "blendWeight": 0.0,
        "providerCounts": {},
    }


def load_training_profile(path: pathlib.Path | None) -> dict | None:
    payload = read_json(path)
    if not isinstance(payload, dict):
        return None
    return payload


def summarize_training_profile(profile: dict | None) -> dict:
    payload = profile or {}
    return {
        "learnedCaseCount": int(payload.get("learnedCaseCount") or 0),
        "confirmedSliceCount": int(payload.get("confirmedSliceCount") or 0),
        "globalMarginMmMean": payload.get("globalMarginMmMean"),
        "blendWeight": payload.get("blendWeight") or 0.0,
        "providerCounts": payload.get("providerCounts") or {},
        "updatedAt": payload.get("updatedAt") or "",
    }


def compute_profile_blend_weight(confirmed_slice_count: int) -> float:
    if confirmed_slice_count <= 0:
        return 0.0
    ratio = min(1.0, confirmed_slice_count / FULL_PROFILE_BLEND_SLICE_COUNT)
    return round(ratio * MAX_PROFILE_BLEND_WEIGHT, 4)


def build_env() -> dict[str, str]:
    return {
        **os.environ,
        "PYTHONUNBUFFERED": "1",
        "OMP_NUM_THREADS": "1",
        "OPENBLAS_NUM_THREADS": "1",
        "MKL_NUM_THREADS": "1",
        "KMP_USE_SHM": "0",
    }


def safe_float_list(value) -> list[float]:
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        items = value
    else:
        items = str(value).split("\\")
    floats = []
    for item in items:
        try:
            floats.append(float(item))
        except (TypeError, ValueError):
            continue
    return floats


def normalize(vector: np.ndarray) -> np.ndarray:
    length = float(np.linalg.norm(vector))
    if length <= 0:
        return np.zeros(3, dtype=np.float64)
    return vector.astype(np.float64) / length


def header_has_geometry(dataset: pydicom.Dataset) -> bool:
    return bool(
        getattr(dataset, "ImagePositionPatient", None)
        and getattr(dataset, "ImageOrientationPatient", None)
        and getattr(dataset, "PixelSpacing", None)
    )


def load_dicom_headers(input_dir: pathlib.Path) -> list[dict]:
    headers = []
    for path in sorted(input_dir.rglob("*")):
        if not path.is_file():
            continue
        try:
            dataset = pydicom.dcmread(str(path), stop_before_pixels=True, force=True)
        except Exception:
            continue
        if not header_has_geometry(dataset):
            continue
        rows = int(getattr(dataset, "Rows", 0) or 0)
        columns = int(getattr(dataset, "Columns", 0) or 0)
        if rows <= 0 or columns <= 0:
            continue
        orientation = safe_float_list(getattr(dataset, "ImageOrientationPatient", None))
        if len(orientation) != 6:
            continue
        row_direction = normalize(np.asarray(orientation[:3], dtype=np.float64))
        column_direction = normalize(np.asarray(orientation[3:], dtype=np.float64))
        normal_vector = normalize(np.cross(row_direction, column_direction))
        position = safe_float_list(getattr(dataset, "ImagePositionPatient", None))
        if len(position) != 3:
            continue
        spacing = safe_float_list(getattr(dataset, "PixelSpacing", None))
        if len(spacing) < 2:
            continue
        instance_number = getattr(dataset, "InstanceNumber", None)
        headers.append(
            {
                "path": path,
                "rows": rows,
                "columns": columns,
                "row_spacing": float(spacing[0]),
                "column_spacing": float(spacing[1]),
                "row_direction": row_direction,
                "column_direction": column_direction,
                "normal_vector": normal_vector,
                "position": np.asarray(position, dtype=np.float64),
                "instance_number": int(instance_number) if instance_number is not None else None,
            }
        )

    if not headers:
        raise RuntimeError("No DICOM slices with axial geometry were found for AI auto segmentation.")

    reference_normal = headers[0]["normal_vector"]
    headers.sort(
        key=lambda item: (
            float(np.dot(item["position"], reference_normal)),
            item["instance_number"] if item["instance_number"] is not None else 0,
            str(item["path"]),
        )
    )
    return headers


def convert_lps_to_ras(points: np.ndarray) -> np.ndarray:
    converted = points.copy()
    converted[..., 0] *= -1.0
    converted[..., 1] *= -1.0
    return converted


def build_slice_world_coordinates(header: dict) -> np.ndarray:
    x_coords = np.arange(header["columns"], dtype=np.float64) * header["column_spacing"]
    y_coords = np.arange(header["rows"], dtype=np.float64) * header["row_spacing"]
    x_component = x_coords[None, :, None] * header["row_direction"][None, None, :]
    y_component = y_coords[:, None, None] * header["column_direction"][None, None, :]
    return header["position"][None, None, :] + x_component + y_component


def sample_mask_on_slice(mask_data: np.ndarray, affine_inverse: np.ndarray, header: dict) -> np.ndarray:
    world_lps = build_slice_world_coordinates(header)
    world_ras = convert_lps_to_ras(world_lps)
    voxel_xyz = np.tensordot(world_ras, affine_inverse[:3, :3].T, axes=1) + affine_inverse[:3, 3]
    coordinates = [
        voxel_xyz[..., 0],
        voxel_xyz[..., 1],
        voxel_xyz[..., 2],
    ]
    sampled = ndimage.map_coordinates(
        mask_data.astype(np.float32),
        coordinates,
        order=0,
        mode="constant",
        cval=0.0,
        prefilter=False,
    )
    return sampled > 0.5


def keep_largest_component(mask: np.ndarray) -> np.ndarray:
    if not mask.any():
        return mask
    labeled, count = ndimage.label(mask)
    if count <= 1:
        return mask
    component_sizes = ndimage.sum(mask, labeled, index=np.arange(1, count + 1))
    largest_index = int(np.argmax(component_sizes)) + 1
    return labeled == largest_index


def smooth_circular_values(values: list[float], window_radius: int, passes: int) -> list[float]:
    smoothed = values[:]
    radius = max(1, int(window_radius))
    for _ in range(max(0, int(passes))):
        next_values = []
        for index in range(len(smoothed)):
            samples = [
                smoothed[(index + offset) % len(smoothed)]
                for offset in range(-radius, radius + 1)
            ]
            next_values.append(sum(samples) / len(samples))
        smoothed = next_values
    return smoothed


def radial_mask_radii(mask: np.ndarray, center: tuple[float, float], max_radius_px: float) -> list[float]:
    rows, columns = mask.shape
    radii = []
    for angle_index in range(ANGLE_SAMPLES):
        angle = (angle_index / ANGLE_SAMPLES) * math.tau - math.pi
        furthest = None
        radius = 0.0
        while radius <= max_radius_px:
            x = center[0] + math.cos(angle) * radius
            y = center[1] + math.sin(angle) * radius
            ix = int(round(x))
            iy = int(round(y))
            if ix < 0 or iy < 0 or ix >= columns or iy >= rows:
                break
            if mask[iy, ix]:
                furthest = radius
            radius += RAY_STEP_PX
        radii.append(furthest if furthest is not None else 0.0)
    return radii


def resolve_mask_center(core_mask: np.ndarray, previous_center: tuple[float, float] | None) -> tuple[float, float]:
    coordinates = np.argwhere(core_mask)
    center_y = float(coordinates[:, 0].mean())
    center_x = float(coordinates[:, 1].mean())
    if previous_center is not None:
        center_x = center_x * 0.72 + previous_center[0] * 0.28
        center_y = center_y * 0.72 + previous_center[1] * 0.28
    return center_x, center_y


def resolve_profile_angle_margins(profile: dict | None) -> list[float] | None:
    if not profile:
        return None
    values = profile.get("angleMarginMeanMm")
    if isinstance(values, list) and len(values) == ANGLE_SAMPLES:
        return [clip_number(value, 0.0, MAX_LEARNED_MARGIN_MM, 0.0) for value in values]
    global_margin = profile.get("globalMarginMmMean")
    if isinstance(global_margin, (int, float)):
        clipped = clip_number(global_margin, 0.0, MAX_LEARNED_MARGIN_MM, 0.0)
        return [clipped] * ANGLE_SAMPLES
    return None


def apply_learned_profile_to_radii(
    core_radii: list[float],
    support_radii: list[float],
    spacing_mm: tuple[float, float],
    learned_profile: dict | None,
) -> list[float]:
    if not learned_profile:
        return support_radii

    blend_weight = clip_number(learned_profile.get("blendWeight"), 0.0, MAX_PROFILE_BLEND_WEIGHT, 0.0)
    angle_margins = resolve_profile_angle_margins(learned_profile)
    if blend_weight <= 0.0 or not angle_margins:
        return support_radii

    average_spacing_mm = max(0.01, (float(spacing_mm[0]) + float(spacing_mm[1])) / 2.0)
    learned_target_radii = []
    for index in range(ANGLE_SAMPLES):
        learned_target = max(core_radii[index], core_radii[index] + angle_margins[index] / average_spacing_mm)
        learned_target_radii.append(learned_target)

    return [
        max(
            core_radii[index],
            support_radii[index] * (1.0 - blend_weight) + learned_target_radii[index] * blend_weight,
        )
        for index in range(ANGLE_SAMPLES)
    ]


def build_contour_for_slice(
    core_mask: np.ndarray,
    spacing_mm: tuple[float, float],
    previous_center: tuple[float, float] | None,
    learned_profile: dict | None = None,
) -> tuple[list[dict], tuple[float, float]] | tuple[None, None]:
    core_mask = keep_largest_component(core_mask.astype(bool))
    if int(core_mask.sum()) < MIN_SLICE_PIXELS:
        return None, None

    row_spacing, column_spacing = spacing_mm
    center = resolve_mask_center(core_mask, previous_center)

    pixel_area_mm2 = row_spacing * column_spacing
    equivalent_radius_mm = math.sqrt((float(core_mask.sum()) * pixel_area_mm2) / math.pi)
    expand_mm = min(MAX_EXPAND_MM, max(MIN_EXPAND_MM, equivalent_radius_mm * 0.42))
    distance_mm = ndimage.distance_transform_edt(~core_mask, sampling=(row_spacing, column_spacing))
    support_mask = distance_mm <= expand_mm
    support_mask = ndimage.binary_fill_holes(support_mask)
    support_mask = ndimage.binary_closing(support_mask, structure=np.ones((3, 3), dtype=bool))
    support_mask = keep_largest_component(support_mask)

    max_radius_px = max(core_mask.shape) * 0.6
    core_radii = radial_mask_radii(core_mask, center, max_radius_px)
    radii = radial_mask_radii(support_mask, center, max_radius_px)
    radii = apply_learned_profile_to_radii(core_radii, radii, spacing_mm, learned_profile)
    if max(radii, default=0.0) <= 0.0:
        return None, None

    smoothed_radii = smooth_circular_values(radii, 2, 2)
    points = []
    for angle_index, radius in enumerate(smoothed_radii):
        angle = (angle_index / ANGLE_SAMPLES) * math.tau - math.pi
        x = center[0] + math.cos(angle) * radius
        y = center[1] + math.sin(angle) * radius
        points.append({"x": max(0.0, x), "y": max(0.0, y)})
    return points, center


def interpolate_points(left_points: list[dict], right_points: list[dict], ratio: float) -> list[dict]:
    return [
        {
            "x": left_point["x"] + (right_point["x"] - left_point["x"]) * ratio,
            "y": left_point["y"] + (right_point["y"] - left_point["y"]) * ratio,
        }
        for left_point, right_point in zip(left_points, right_points)
    ]


def fill_missing_slice_contours(contours_by_slice: dict[int, list[dict]], start_slice: int, end_slice: int) -> int:
    if not contours_by_slice:
        return 0

    fallback_count = 0
    existing = sorted(contours_by_slice)

    first_slice = existing[0]
    for slice_index in range(start_slice, first_slice):
        contours_by_slice[slice_index] = [dict(point) for point in contours_by_slice[first_slice]]
        fallback_count += 1

    last_slice = existing[-1]
    for slice_index in range(last_slice + 1, end_slice + 1):
        contours_by_slice[slice_index] = [dict(point) for point in contours_by_slice[last_slice]]
        fallback_count += 1

    existing = sorted(contours_by_slice)
    for left_slice, right_slice in zip(existing[:-1], existing[1:]):
        gap = right_slice - left_slice
        if gap <= 1:
            continue
        left_points = contours_by_slice[left_slice]
        right_points = contours_by_slice[right_slice]
        for slice_index in range(left_slice + 1, right_slice):
            ratio = (slice_index - left_slice) / gap
            contours_by_slice[slice_index] = interpolate_points(left_points, right_points, ratio)
            fallback_count += 1

    return fallback_count


def resolve_provider(requested_provider: str, license_ready: bool) -> tuple[str, list[str], str]:
    if requested_provider == "totalsegmentator_heartchambers_highres" and license_ready:
        return (
            "totalsegmentator_heartchambers_highres",
            TOTALSEG_HIGHRES_ROIS,
            "Licensed high-resolution heart model",
        )
    if requested_provider == "totalsegmentator_heartchambers_highres":
        return (
            "totalsegmentator_total_roi",
            TOTALSEG_TOTAL_ROIS,
            "TotalSegmentator cardiac ROI model",
        )
    if requested_provider == "totalsegmentator_total_roi":
        return (
            "totalsegmentator_total_roi",
            TOTALSEG_TOTAL_ROIS,
            "TotalSegmentator cardiac ROI model",
        )
    if license_ready:
        return (
            "totalsegmentator_heartchambers_highres",
            TOTALSEG_HIGHRES_ROIS,
            "Licensed high-resolution heart model",
        )
    return (
        "totalsegmentator_total_roi",
        TOTALSEG_TOTAL_ROIS,
        "TotalSegmentator cardiac ROI model",
    )


def load_totalseg_config() -> dict:
    config_path = pathlib.Path(os.environ.get("TOTALSEG_HOME_DIR", "")) / "config.json"
    if not config_path.exists():
        return {}
    try:
        return json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def run_totalsegmentator(input_path: pathlib.Path, output_dir: pathlib.Path, command: str, provider: str) -> tuple[subprocess.CompletedProcess[str], list[str], str]:
    config = load_totalseg_config()
    license_ready = isinstance(config.get("license_number"), str) and len(config.get("license_number").strip()) == 18
    resolved_provider, rois, provider_label = resolve_provider(provider, license_ready)

    command_parts = [
        command,
        "-i",
        str(input_path),
        "-o",
        str(output_dir),
        "-d",
        "cpu",
    ]

    if resolved_provider == "totalsegmentator_heartchambers_highres":
        command_parts.extend(["-ta", "heartchambers_highres"])
    else:
        command_parts.extend(["-ta", "total", "-rs", *rois])

    completed = subprocess.run(
        command_parts,
        capture_output=True,
        text=True,
        check=False,
        env=build_env(),
    )
    return completed, rois, provider_label


def load_mask_union(mask_dir: pathlib.Path, rois: list[str]) -> tuple[np.ndarray, nib.Nifti1Image]:
    combined = None
    reference_image = None
    for roi in rois:
        mask_path = mask_dir / f"{roi}.nii.gz"
        if not mask_path.exists():
            continue
        image = nib.load(str(mask_path))
        data = np.asarray(image.dataobj) > 0.5
        if combined is None:
            combined = np.zeros(data.shape, dtype=bool)
            reference_image = image
        combined |= data

    if combined is None or reference_image is None:
        raise RuntimeError("The AI backend completed, but no heart-region masks were produced.")
    return combined, reference_image


def pipeline_name_from_label(provider_label: str) -> str:
    return (
        "totalsegmentator_heartchambers_highres"
        if "high-resolution" in provider_label.lower()
        else "totalsegmentator_total_roi"
    )


def normalize_annotation_points(points: list[dict] | None) -> list[tuple[float, float]]:
    normalized: list[tuple[float, float]] = []
    for point in points or []:
        try:
            x = float(point.get("x"))
            y = float(point.get("y"))
        except (AttributeError, TypeError, ValueError):
            continue
        if math.isfinite(x) and math.isfinite(y):
            normalized.append((x, y))
    return normalized


def contour_points_to_mask(points: list[dict] | None, shape: tuple[int, int]) -> np.ndarray:
    normalized = normalize_annotation_points(points)
    if len(normalized) < 3:
        return np.zeros(shape, dtype=bool)

    rows, columns = shape
    coords = np.asarray(normalized, dtype=np.float64)
    xs = coords[:, 0]
    ys = coords[:, 1]
    min_x = max(0, int(math.floor(float(xs.min()))))
    max_x = min(columns - 1, int(math.ceil(float(xs.max()))))
    min_y = max(0, int(math.floor(float(ys.min()))))
    max_y = min(rows - 1, int(math.ceil(float(ys.max()))))
    if min_x > max_x or min_y > max_y:
        return np.zeros(shape, dtype=bool)

    grid_x, grid_y = np.meshgrid(
        np.arange(min_x, max_x + 1, dtype=np.float64) + 0.5,
        np.arange(min_y, max_y + 1, dtype=np.float64) + 0.5,
    )
    inside = np.zeros(grid_x.shape, dtype=bool)
    rolled_x = np.roll(xs, -1)
    rolled_y = np.roll(ys, -1)

    for index in range(len(xs)):
        y1 = ys[index]
        y2 = rolled_y[index]
        if abs(y2 - y1) <= 1e-6:
            continue
        x1 = xs[index]
        x2 = rolled_x[index]
        x_intersection = ((x2 - x1) * (grid_y - y1)) / (y2 - y1) + x1
        intersects = ((y1 > grid_y) != (y2 > grid_y)) & (grid_x < x_intersection)
        inside ^= intersects

    mask = np.zeros(shape, dtype=bool)
    mask[min_y : max_y + 1, min_x : max_x + 1] = inside
    return ndimage.binary_fill_holes(mask)


def update_training_profile(
    profile_path: pathlib.Path,
    provider_key: str,
    margin_rows_mm: np.ndarray,
) -> dict:
    profile = load_training_profile(profile_path) or default_training_profile()
    existing_sum = np.asarray(profile.get("angleMarginSumMm") or [0.0] * ANGLE_SAMPLES, dtype=np.float64)
    if existing_sum.shape != (ANGLE_SAMPLES,):
        existing_sum = np.zeros(ANGLE_SAMPLES, dtype=np.float64)

    updated_sum = existing_sum + margin_rows_mm.sum(axis=0)
    confirmed_slice_count = int(profile.get("confirmedSliceCount") or 0) + int(margin_rows_mm.shape[0])
    mean_margins = updated_sum / max(1, confirmed_slice_count)
    provider_counts = profile.get("providerCounts") or {}
    provider_counts[provider_key] = int(provider_counts.get(provider_key) or 0) + 1

    profile["updatedAt"] = now_iso()
    profile["createdAt"] = str(profile.get("createdAt") or now_iso())
    profile["learnedCaseCount"] = int(profile.get("learnedCaseCount") or 0) + 1
    profile["confirmedSliceCount"] = confirmed_slice_count
    profile["angleSamples"] = ANGLE_SAMPLES
    profile["angleMarginSumMm"] = np.round(updated_sum, 5).tolist()
    profile["angleMarginMeanMm"] = np.round(mean_margins, 5).tolist()
    profile["globalMarginMmMean"] = round(float(mean_margins.mean()), 5)
    profile["blendWeight"] = compute_profile_blend_weight(confirmed_slice_count)
    profile["providerCounts"] = provider_counts
    write_json(profile_path, profile)
    return profile


def build_payload(args: argparse.Namespace) -> dict:
    started_at = time.perf_counter()
    headers = load_dicom_headers(args.input_dir)
    max_slice_index = len(headers) - 1
    start_slice = max(0, int(args.top_slice_index))
    end_slice = max_slice_index if args.bottom_slice_index < 0 else min(max_slice_index, int(args.bottom_slice_index))
    if end_slice < start_slice:
        start_slice, end_slice = end_slice, start_slice

    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    masks_dir = output_dir / "masks"
    masks_dir.mkdir(parents=True, exist_ok=True)
    learned_profile = load_training_profile(args.profile_json)

    completed, rois, provider_label = run_totalsegmentator(
        args.input_dir,
        masks_dir,
        args.totalsegmentator_command,
        args.provider,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or completed.stdout.strip() or "TotalSegmentator did not finish successfully.")

    combined_mask_xyz, reference_image = load_mask_union(masks_dir, rois)
    combined_mask_zyx = np.transpose(combined_mask_xyz.astype(bool), (2, 1, 0))
    affine_inverse = np.linalg.inv(np.asarray(reference_image.affine, dtype=np.float64))

    contours_by_slice: dict[int, list[dict]] = {}
    previous_center = None
    generated_slices = 0

    for slice_index in range(start_slice, end_slice + 1):
        sampled_mask = sample_mask_on_slice(combined_mask_xyz, affine_inverse, headers[slice_index])
        if sampled_mask.shape != (headers[slice_index]["rows"], headers[slice_index]["columns"]):
            continue

        points, previous_center = build_contour_for_slice(
            sampled_mask,
            (headers[slice_index]["row_spacing"], headers[slice_index]["column_spacing"]),
            previous_center,
            learned_profile,
        )
        if not points:
            continue
        contours_by_slice[slice_index] = points
        generated_slices += 1

    if not contours_by_slice:
        raise RuntimeError("The AI heart model ran, but it did not produce a usable pericardial starting contour on this slab.")

    fallback_slices = fill_missing_slice_contours(contours_by_slice, start_slice, end_slice)
    elapsed_seconds = time.perf_counter() - started_at

    return {
        "ok": True,
        "pipeline": pipeline_name_from_label(provider_label),
        "providerLabel": provider_label,
        "message": f"AI auto segmentation generated {generated_slices} slice contour{'s' if generated_slices != 1 else ''} and filled {fallback_slices} additional slice{'s' if fallback_slices != 1 else ''}.",
        "summary": {
            "generatedSlices": generated_slices,
            "interpolatedSlices": fallback_slices,
            "rangeStartSliceIndex": start_slice,
            "rangeEndSliceIndex": end_slice,
            "processingSeconds": round(elapsed_seconds, 2),
            "thresholdMinHu": args.threshold_min_hu,
            "thresholdMaxHu": args.threshold_max_hu,
            "maskShapeZYX": list(combined_mask_zyx.shape),
            "learnedProfileUsed": bool(learned_profile and int(learned_profile.get("confirmedSliceCount") or 0)),
            "learningBlendWeight": float(learned_profile.get("blendWeight") or 0.0) if learned_profile else 0.0,
        },
        "contours": [
            {
                "sliceIndex": slice_index,
                "points": contours_by_slice[slice_index],
                "sourceLabel": provider_label,
            }
            for slice_index in sorted(contours_by_slice)
        ],
        "logs": {
            "stdout": completed.stdout[-8000:],
            "stderr": completed.stderr[-8000:],
        },
    }


def build_feedback_payload(args: argparse.Namespace) -> dict:
    if not args.annotations_json:
        raise RuntimeError("Training feedback mode requires --annotations-json.")
    if not args.profile_json:
        raise RuntimeError("Training feedback mode requires --profile-json.")

    annotations = read_json(args.annotations_json)
    if not isinstance(annotations, dict):
        raise RuntimeError("The training annotation payload could not be read.")

    started_at = time.perf_counter()
    headers = load_dicom_headers(args.input_dir)
    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    masks_dir = output_dir / "masks"
    masks_dir.mkdir(parents=True, exist_ok=True)

    completed, rois, provider_label = run_totalsegmentator(
        args.input_dir,
        masks_dir,
        args.totalsegmentator_command,
        args.provider,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or completed.stdout.strip() or "TotalSegmentator did not finish successfully.")

    combined_mask_xyz, reference_image = load_mask_union(masks_dir, rois)
    affine_inverse = np.linalg.inv(np.asarray(reference_image.affine, dtype=np.float64))

    confirmed_rows = [
        item
        for item in (annotations.get("contours") or [])
        if isinstance(item, dict) and bool(item.get("confirmedForTraining"))
    ]
    margin_rows: list[list[float]] = []
    used_slice_rows: list[dict] = []
    previous_center = None

    for item in sorted(confirmed_rows, key=lambda row: int(row.get("sliceIndex") or 0)):
        slice_index = int(item.get("sliceIndex") or 0)
        if slice_index < 0 or slice_index >= len(headers):
            continue

        header = headers[slice_index]
        sampled_mask = sample_mask_on_slice(combined_mask_xyz, affine_inverse, header)
        core_mask = keep_largest_component(sampled_mask.astype(bool))
        if int(core_mask.sum()) < MIN_SLICE_PIXELS:
            continue

        manual_mask = contour_points_to_mask(item.get("points"), (header["rows"], header["columns"]))
        if int(manual_mask.sum()) < MIN_SLICE_PIXELS:
            continue

        center = resolve_mask_center(core_mask, previous_center)
        previous_center = center
        max_radius_px = max(core_mask.shape) * 0.6
        core_radii = radial_mask_radii(core_mask, center, max_radius_px)
        manual_radii = radial_mask_radii(manual_mask, center, max_radius_px)
        if max(manual_radii, default=0.0) <= 0.0:
            continue

        average_spacing_mm = max(0.01, (header["row_spacing"] + header["column_spacing"]) / 2.0)
        margin_row = [
            clip_number((manual_radii[index] - core_radii[index]) * average_spacing_mm, 0.0, MAX_LEARNED_MARGIN_MM, 0.0)
            for index in range(ANGLE_SAMPLES)
        ]
        if max(margin_row, default=0.0) <= 0.0:
            continue

        margin_rows.append(margin_row)
        used_slice_rows.append(
            {
                "sliceIndex": slice_index,
                "meanMarginMm": round(float(np.mean(margin_row)), 4),
                "maxMarginMm": round(float(np.max(margin_row)), 4),
            }
        )

    elapsed_seconds = time.perf_counter() - started_at
    if not margin_rows:
        return {
            "ok": True,
            "profileUpdated": False,
            "pipeline": pipeline_name_from_label(provider_label),
            "providerLabel": provider_label,
            "message": "Stored the reference-standard case, but no usable learned contour slices could be derived from it for profile tuning.",
            "summary": {
                "submittedContours": len(annotations.get("contours") or []),
                "confirmedSliceCount": len(confirmed_rows),
                "usedSliceCount": 0,
                "processingSeconds": round(elapsed_seconds, 2),
            },
            "profile": summarize_training_profile(load_training_profile(args.profile_json)),
            "usedSlices": used_slice_rows,
            "logs": {
                "stdout": completed.stdout[-8000:],
                "stderr": completed.stderr[-8000:],
            },
        }

    margin_matrix = np.asarray(margin_rows, dtype=np.float64)
    profile = update_training_profile(args.profile_json, pipeline_name_from_label(provider_label), margin_matrix)
    return {
        "ok": True,
        "profileUpdated": True,
        "pipeline": pipeline_name_from_label(provider_label),
        "providerLabel": provider_label,
        "message": f"Stored the reference-standard case and updated the local AI contour profile from {margin_matrix.shape[0]} confirmed slice{'s' if margin_matrix.shape[0] != 1 else ''}. Future AI Auto Segment runs will use this learned envelope.",
        "summary": {
            "submittedContours": len(annotations.get("contours") or []),
            "confirmedSliceCount": len(confirmed_rows),
            "usedSliceCount": int(margin_matrix.shape[0]),
            "processingSeconds": round(elapsed_seconds, 2),
        },
        "profile": summarize_training_profile(profile),
        "usedSlices": used_slice_rows,
        "logs": {
            "stdout": completed.stdout[-8000:],
            "stderr": completed.stderr[-8000:],
        },
    }


def main() -> None:
    args = parse_args()
    payload = build_feedback_payload(args) if args.mode == "feedback" else build_payload(args)
    write_json(args.result_json, payload)


if __name__ == "__main__":
    main()
