#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import math
import os
import pathlib
import random
import subprocess
import uuid

import nibabel as nib
import numpy as np
import vtk
from vtk.util import numpy_support
from vmtk import vmtkcenterlinesnetwork, vmtknetworkextraction, vmtksurfacecapper


MIN_COMPONENT_POINTS = 60
MIN_COMPONENT_CELLS = 40
MIN_BRANCH_POINTS = 4
MIN_BRANCH_LENGTH_MM = 4.0
RESAMPLE_STEP_MM = 0.9
SMOOTH_ITERATIONS = 12


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the coronary backend prototype pipeline.")
    parser.add_argument("--input-dir", type=pathlib.Path, help="Input DICOM directory.")
    parser.add_argument("--output-dir", type=pathlib.Path, required=True, help="Output artifact directory.")
    parser.add_argument("--result-json", type=pathlib.Path, required=True, help="Structured result payload path.")
    parser.add_argument("--totalsegmentator-command", type=str, default="TotalSegmentator")
    parser.add_argument("--task", type=str, default="coronary_arteries")
    parser.add_argument(
        "--mask-path",
        type=pathlib.Path,
        default=None,
        help="Optional precomputed mask. If provided with --skip-totalsegmentator, the script only runs the VMTK stage.",
    )
    parser.add_argument("--skip-totalsegmentator", action="store_true")
    parser.add_argument(
        "--input-coordinate-system",
        choices=("las", "lps", "ras"),
        default="las",
        help="Coordinate frame used by the incoming NIfTI affine before conversion to the viewer's DICOM-LPS space.",
    )
    return parser.parse_args()


def ensure_parent(path: pathlib.Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def write_json(path: pathlib.Path, payload: dict) -> None:
    ensure_parent(path)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def build_env() -> dict[str, str]:
    env_bin = pathlib.Path(__file__).resolve().parent.parent / ".tooling" / "envs" / "coronary-tools" / "bin"
    existing_path = os.environ.get("PATH", "")
    merged_path = os.pathsep.join([str(env_bin), existing_path]) if env_bin.exists() else existing_path
    return {
        **os.environ,
        "PATH": merged_path,
        "PYTHONUNBUFFERED": "1",
        "OMP_NUM_THREADS": "1",
        "OPENBLAS_NUM_THREADS": "1",
        "MKL_NUM_THREADS": "1",
    }


def ensure_totalseg_config(totalseg_home_dir: pathlib.Path) -> pathlib.Path:
    totalseg_home_dir.mkdir(parents=True, exist_ok=True)
    config_path = totalseg_home_dir / "config.json"
    if config_path.exists():
        return config_path
    config = {
        "totalseg_id": f"totalseg_{uuid.uuid4().hex[:8].upper()}",
        "send_usage_stats": False,
        "prediction_counter": 0,
    }
    write_json(config_path, config)
    return config_path


def run_totalsegmentator(args: argparse.Namespace) -> tuple[subprocess.CompletedProcess[str], list[str]]:
    if not args.input_dir:
        raise ValueError("--input-dir is required unless --skip-totalsegmentator is used with --mask-path.")

    env = build_env()
    totalseg_home_dir = pathlib.Path(env.get("TOTALSEG_HOME_DIR", ""))
    if totalseg_home_dir:
        ensure_totalseg_config(totalseg_home_dir)

    command = [
        args.totalsegmentator_command,
        "-i",
        str(args.input_dir),
        "-o",
        str(args.output_dir),
        "-ta",
        args.task,
        "-d",
        "cpu",
    ]
    completed = subprocess.run(
        command,
        capture_output=True,
        text=True,
        check=False,
        env=env,
    )
    return completed, command


def locate_mask_path(output_dir: pathlib.Path, task: str, explicit_mask: pathlib.Path | None) -> pathlib.Path:
    if explicit_mask:
        if not explicit_mask.exists():
            raise FileNotFoundError(f"Mask file not found: {explicit_mask}")
        return explicit_mask

    expected = output_dir / f"{task}.nii.gz"
    if expected.exists():
        return expected

    candidates = sorted(output_dir.glob("*.nii.gz"))
    if not candidates:
        raise FileNotFoundError(f"No NIfTI mask was produced in {output_dir}")
    return candidates[0]


def mask_image_to_surface(mask_image: nib.Nifti1Image) -> tuple[vtk.vtkPolyData, int]:
    mask_data = np.asarray(mask_image.dataobj)
    binary_mask = (mask_data > 0).astype(np.uint8)
    voxel_count = int(binary_mask.sum())
    if voxel_count <= 0:
        raise ValueError("The coronary mask is empty.")

    dims = tuple(int(value) for value in binary_mask.shape)
    vtk_image = vtk.vtkImageData()
    vtk_image.SetDimensions(*dims)
    vtk_image.SetExtent(0, dims[0] - 1, 0, dims[1] - 1, 0, dims[2] - 1)
    vtk_scalars = numpy_support.numpy_to_vtk(
        binary_mask.ravel(order="F"),
        deep=True,
        array_type=vtk.VTK_UNSIGNED_CHAR,
    )
    vtk_scalars.SetName("Mask")
    vtk_image.GetPointData().SetScalars(vtk_scalars)

    marching_cubes = vtk.vtkMarchingCubes()
    marching_cubes.SetInputData(vtk_image)
    marching_cubes.SetValue(0, 0.5)
    marching_cubes.Update()

    affine = np.asarray(mask_image.affine, dtype=float)
    matrix = vtk.vtkMatrix4x4()
    for row in range(4):
        for column in range(4):
            matrix.SetElement(row, column, float(affine[row, column]))

    transform = vtk.vtkTransform()
    transform.SetMatrix(matrix)

    transformed = vtk.vtkTransformPolyDataFilter()
    transformed.SetInputConnection(marching_cubes.GetOutputPort())
    transformed.SetTransform(transform)
    transformed.Update()

    triangle = vtk.vtkTriangleFilter()
    triangle.SetInputConnection(transformed.GetOutputPort())
    triangle.Update()

    clean = vtk.vtkCleanPolyData()
    clean.SetInputConnection(triangle.GetOutputPort())
    clean.Update()

    smooth = vtk.vtkWindowedSincPolyDataFilter()
    smooth.SetInputConnection(clean.GetOutputPort())
    smooth.SetNumberOfIterations(SMOOTH_ITERATIONS)
    smooth.BoundarySmoothingOff()
    smooth.FeatureEdgeSmoothingOff()
    smooth.NonManifoldSmoothingOn()
    smooth.NormalizeCoordinatesOn()
    smooth.Update()

    surface = vtk.vtkPolyData()
    surface.DeepCopy(smooth.GetOutput())
    return surface, voxel_count


def extract_connected_components(surface: vtk.vtkPolyData) -> list[vtk.vtkPolyData]:
    connectivity = vtk.vtkPolyDataConnectivityFilter()
    connectivity.SetInputData(surface)
    connectivity.SetExtractionModeToAllRegions()
    connectivity.ColorRegionsOn()
    connectivity.Update()
    region_count = connectivity.GetNumberOfExtractedRegions()

    components: list[vtk.vtkPolyData] = []
    for region_index in range(region_count):
        extractor = vtk.vtkPolyDataConnectivityFilter()
        extractor.SetInputData(surface)
        extractor.SetExtractionModeToSpecifiedRegions()
        extractor.AddSpecifiedRegion(region_index)
        extractor.Update()

        component = vtk.vtkPolyData()
        component.DeepCopy(extractor.GetOutput())
        if component.GetNumberOfPoints() < MIN_COMPONENT_POINTS:
            continue
        if component.GetNumberOfCells() < MIN_COMPONENT_CELLS:
            continue
        components.append(component)
    return components


def append_polydata(parts: list[vtk.vtkPolyData]) -> vtk.vtkPolyData:
    appender = vtk.vtkAppendPolyData()
    for part in parts:
        appender.AddInputData(part)
    appender.Update()
    combined = vtk.vtkPolyData()
    combined.DeepCopy(appender.GetOutput())
    return combined


def write_polydata(path: pathlib.Path, polydata: vtk.vtkPolyData) -> None:
    ensure_parent(path)
    writer = vtk.vtkXMLPolyDataWriter()
    writer.SetFileName(str(path))
    writer.SetInputData(polydata)
    writer.Write()


def convert_point_to_dicom_lps(point: tuple[float, float, float], coordinate_system: str) -> list[float]:
    x, y, z = float(point[0]), float(point[1]), float(point[2])
    if coordinate_system == "las":
        return [x, -y, z]
    if coordinate_system == "ras":
        return [-x, -y, z]
    return [x, y, z]


def polyline_length(points: list[list[float]]) -> float:
    if len(points) < 2:
        return 0.0
    total = 0.0
    for start, end in zip(points[:-1], points[1:]):
        total += math.dist(start, end)
    return total


def resample_polyline(points: list[list[float]], step_mm: float) -> list[list[float]]:
    if len(points) < 2:
        return points

    data = np.asarray(points, dtype=float)
    segment_lengths = np.linalg.norm(np.diff(data, axis=0), axis=1)
    cumulative = np.concatenate(([0.0], np.cumsum(segment_lengths)))
    total_length = float(cumulative[-1])
    if total_length <= 0:
        return [list(point) for point in data]

    sample_distances = np.arange(0.0, total_length, step_mm, dtype=float)
    if not np.isclose(sample_distances[-1] if sample_distances.size else 0.0, total_length):
        sample_distances = np.append(sample_distances, total_length)

    resampled = np.column_stack(
        [
            np.interp(sample_distances, cumulative, data[:, axis_index])
            for axis_index in range(data.shape[1])
        ]
    )
    return resampled.tolist()


def compute_reference_center(surface: vtk.vtkPolyData, coordinate_system: str) -> list[float]:
    bounds = surface.GetBounds()
    center = [
        (float(bounds[0]) + float(bounds[1])) / 2.0,
        (float(bounds[2]) + float(bounds[3])) / 2.0,
        (float(bounds[4]) + float(bounds[5])) / 2.0,
    ]
    return convert_point_to_dicom_lps(tuple(center), coordinate_system)


def prepare_network_surface(component: vtk.vtkPolyData, random_seed: int) -> vtk.vtkPolyData:
    working_surface = vtk.vtkPolyData()
    working_surface.DeepCopy(component)

    feature_edges = vtk.vtkFeatureEdges()
    feature_edges.BoundaryEdgesOn()
    feature_edges.FeatureEdgesOff()
    feature_edges.ManifoldEdgesOff()
    feature_edges.SetInputData(working_surface)
    feature_edges.Update()

    if feature_edges.GetOutput().GetNumberOfPoints() != 0:
        capper = vmtksurfacecapper.vmtkSurfaceCapper()
        capper.Surface = working_surface
        capper.Interactive = 0
        capper.Execute()
        working_surface = vtk.vtkPolyData()
        working_surface.DeepCopy(capper.Surface)

    cell_count = working_surface.GetNumberOfCells()
    if cell_count <= 1:
        raise ValueError("The coronary surface component is too small for network extraction.")

    delete_index = random.Random(random_seed).randrange(0, cell_count - 1)
    working_surface.BuildLinks()
    working_surface.DeleteCell(delete_index)
    working_surface.RemoveDeletedCells()
    return working_surface


def extract_component_centerlines(component: vtk.vtkPolyData, random_seed: int) -> tuple[vtk.vtkPolyData, str]:
    extractor = vmtkcenterlinesnetwork.vmtkCenterlinesNetwork()
    extractor.Surface = component
    extractor.UseJoblib = False
    extractor.RandomSeed = random_seed
    try:
        extractor.Execute()
        centerlines = vtk.vtkPolyData()
        centerlines.DeepCopy(extractor.Centerlines)
        if centerlines.GetNumberOfCells() > 0:
            return centerlines, "centerlines_network"
    except Exception:
        pass

    network_surface = prepare_network_surface(component, random_seed)
    network_extractor = vmtknetworkextraction.vmtkNetworkExtraction()
    network_extractor.Surface = network_surface
    network_extractor.AdvancementRatio = 1.001
    network_extractor.Execute()

    centerlines = vtk.vtkPolyData()
    centerlines.DeepCopy(network_extractor.Network)
    if centerlines.GetNumberOfCells() <= 0:
        raise ValueError("VMTK returned no usable coronary network branches.")
    return centerlines, "network_extraction"


def centerlines_to_branches(
    centerlines: vtk.vtkPolyData,
    component_index: int,
    reference_center_lps: list[float],
    coordinate_system: str,
) -> list[dict]:
    radius_array = centerlines.GetPointData().GetArray("MaximumInscribedSphereRadius")
    if radius_array is None:
        radius_array = centerlines.GetPointData().GetArray("Radius")

    branches: list[dict] = []
    for cell_index in range(centerlines.GetNumberOfCells()):
        cell = centerlines.GetCell(cell_index)
        point_ids = cell.GetPointIds()
        if point_ids is None or point_ids.GetNumberOfIds() < MIN_BRANCH_POINTS:
            continue

        original_points = [
            convert_point_to_dicom_lps(centerlines.GetPoint(point_ids.GetId(point_index)), coordinate_system)
            for point_index in range(point_ids.GetNumberOfIds())
        ]
        if math.dist(original_points[-1], reference_center_lps) < math.dist(original_points[0], reference_center_lps):
            original_points.reverse()

        length_mm = polyline_length(original_points)
        if length_mm < MIN_BRANCH_LENGTH_MM:
            continue

        resampled_points = resample_polyline(original_points, RESAMPLE_STEP_MM)
        mean_radius_mm = None
        if radius_array is not None:
            radii = [float(radius_array.GetTuple1(point_ids.GetId(point_index))) for point_index in range(point_ids.GetNumberOfIds())]
            finite_radii = [value for value in radii if math.isfinite(value)]
            if finite_radii:
                mean_radius_mm = float(sum(finite_radii) / len(finite_radii))

        branches.append(
            {
                "id": f"component_{component_index + 1}_branch_{len(branches) + 1}",
                "label": "Auto",
                "points": [[round(value, 4) for value in point] for point in resampled_points],
                "lengthMm": round(length_mm, 3),
                "pointCount": len(resampled_points),
                "meanRadiusMm": round(mean_radius_mm, 3) if mean_radius_mm is not None else None,
            }
        )

    branches.sort(key=lambda branch: branch["lengthMm"], reverse=True)
    return branches


def build_result_payload(
    args: argparse.Namespace,
    mask_path: pathlib.Path,
    voxel_count: int,
    surface: vtk.vtkPolyData,
    centerline_surfaces: list[vtk.vtkPolyData],
    vessels: list[dict],
    warnings: list[str],
) -> dict:
    surface_path = args.output_dir / "coronary-surface.vtp"
    write_polydata(surface_path, surface)

    centerline_path = args.output_dir / "coronary-centerlines.vtp"
    if centerline_surfaces:
        write_polydata(centerline_path, append_polydata(centerline_surfaces))

    result_path = args.output_dir / "coronary-tree.json"
    payload = {
        "status": "completed" if vessels else "partial",
        "message": (
            f"Automatic coronary tree extraction produced {len(vessels)} branch centerline"
            f"{'' if len(vessels) == 1 else 's'} from the segmented coronary mask."
            if vessels
            else "The coronary mask was generated, but no branch centerlines could be extracted automatically."
        ),
        "pipeline": "totalsegmentator_vmtk",
        "mask": {
            "path": str(mask_path),
            "voxelCount": voxel_count,
        },
        "metrics": {
            "componentCount": len(centerline_surfaces),
            "vesselCount": len(vessels),
        },
        "vessels": vessels,
    }
    if warnings:
        payload["warnings"] = warnings
    write_json(result_path, payload)
    return payload


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    warnings: list[str] = []
    command: list[str] | None = None

    try:
        if args.skip_totalsegmentator:
            completed = None
        else:
            completed, command = run_totalsegmentator(args)
            if completed.returncode != 0:
                payload = {
                    "status": "failed",
                    "message": "TotalSegmentator did not finish successfully for the uploaded coronary CTA series.",
                    "pipeline": "totalsegmentator_vmtk",
                    "command": command,
                    "stdout": completed.stdout[-8000:],
                    "stderr": completed.stderr[-8000:],
                    "vessels": [],
                }
                write_json(args.result_json, payload)
                return

        mask_path = locate_mask_path(args.output_dir, args.task, args.mask_path)
        mask_image = nib.load(str(mask_path))
        surface, voxel_count = mask_image_to_surface(mask_image)
        components = extract_connected_components(surface)
        if not components:
            warnings.append("No sufficiently large connected coronary mask component was found for centerline extraction.")

        reference_center_lps = compute_reference_center(surface, args.input_coordinate_system)
        centerline_surfaces: list[vtk.vtkPolyData] = []
        vessels: list[dict] = []
        for component_index, component in enumerate(components):
            try:
                centerlines, method = extract_component_centerlines(component, random_seed=17 + component_index)
            except Exception as error:  # pragma: no cover - VMTK runtime varies with input geometry
                warnings.append(f"VMTK centerline extraction failed for component {component_index + 1}: {error}")
                continue

            if centerlines.GetNumberOfCells() <= 0:
                warnings.append(f"VMTK returned no centerline cells for component {component_index + 1}.")
                continue

            if method != "centerlines_network":
                warnings.append(
                    f"Component {component_index + 1} used the VMTK network-extraction fallback instead of the stricter centerline refinement step."
                )

            centerline_surfaces.append(centerlines)
            vessels.extend(
                centerlines_to_branches(
                    centerlines,
                    component_index=component_index,
                    reference_center_lps=reference_center_lps,
                    coordinate_system=args.input_coordinate_system,
                )
            )

        payload = build_result_payload(
            args=args,
            mask_path=mask_path,
            voxel_count=voxel_count,
            surface=surface,
            centerline_surfaces=centerline_surfaces,
            vessels=vessels,
            warnings=warnings,
        )
        if command:
            payload["command"] = command
        write_json(args.result_json, payload)
    except Exception as error:  # pragma: no cover - top-level defensive path
        payload = {
            "status": "failed",
            "message": f"Coronary backend pipeline failed: {error}",
            "pipeline": "totalsegmentator_vmtk",
            "vessels": [],
        }
        if command:
            payload["command"] = command
        write_json(args.result_json, payload)


if __name__ == "__main__":
    main()
