#!/usr/bin/env python3

from __future__ import annotations

import json
import pathlib
import tempfile

import serve_https


def assert_true(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="eat_backend_cache_") as temp_dir:
        root = pathlib.Path(temp_dir)
        serve_https.EAT_STUDY_CACHE_ROOT = root / "study_cache"
        serve_https.EAT_STUDY_CACHE_ROOT.mkdir(parents=True, exist_ok=True)

        sample_files = [
            {
                "filename": "series/slice_001.dcm",
                "payload": b"dicom-a",
            },
            {
                "filename": "series/slice_002.dcm",
                "payload": b"dicom-b",
            },
        ]
        metadata = {
            "patientId": "ABC123",
            "studyInstanceUID": "1.2.3",
            "seriesInstanceUID": "4.5.6",
            "reconstructionLabel": "VMI 40 keV",
        }

        input_dir, saved_files, cache_info = serve_https.resolve_eat_study_input(
            root / "job_one" / "input",
            sample_files,
            "eat_cache_case",
            metadata,
        )
        assert_true(cache_info["stored"] is True, "First cache write should store uploaded files.")
        assert_true(cache_info["hit"] is False, "First cache write should not be a cache hit.")
        assert_true(input_dir == serve_https.eat_study_cache_input_dir("eat_cache_case"), "Cache input dir mismatch.")
        assert_true(saved_files == ["series/slice_001.dcm", "series/slice_002.dcm"], "Unexpected saved files.")

        manifest = serve_https.read_eat_study_cache_manifest("eat_cache_case")
        assert_true(manifest is not None, "Cache manifest should exist after storing.")
        assert_true(manifest["fileCount"] == 2, "Cache manifest file count should match uploaded files.")
        assert_true(manifest["metadata"]["seriesInstanceUID"] == "4.5.6", "Cache metadata should be preserved.")

        cached_input_dir, cached_files, cached_info = serve_https.resolve_eat_study_input(
            root / "job_two" / "input",
            [],
            "eat_cache_case",
            {"reconstructionLabel": "VMI 40 keV"},
        )
        assert_true(cached_info["hit"] is True, "Second cache resolution should reuse the cached study.")
        assert_true(cached_info["stored"] is False, "Cache reuse should not rewrite files.")
        assert_true(cached_input_dir == input_dir, "Cache reuse should point to the same input dir.")
        assert_true(cached_files == saved_files, "Cache reuse should expose the same saved files.")

        summary = serve_https.summarize_eat_study_cache()
        assert_true(summary["entryCount"] == 1, "Cache summary should report one cached study.")
        assert_true(summary["fileCount"] == 2, "Cache summary should report the cached file count.")

        print(
            json.dumps(
                {
                    "ok": True,
                    "cacheKey": cached_info["cacheKey"],
                    "fileCount": cached_info["fileCount"],
                    "cacheRoot": summary["root"],
                },
                indent=2,
            )
        )


if __name__ == "__main__":
    main()
