#!/usr/bin/env python3

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
POINTGUARD_JS = ROOT / "src" / "pointguard" / "pointguard.js"
FIXTURE_PATH = ROOT / "src" / "pointguard" / "fixtures" / "regression-cases.json"


def build_harness_script(fixtures: list[dict]) -> str:
    fixture_json = json.dumps(fixtures)
    pointguard_path = str(POINTGUARD_JS)
    return f"""
ObjC.import('Foundation');

function readFile(path) {{
  const ns = $.NSString.stringWithContentsOfFileEncodingError($(path), $.NSUTF8StringEncoding, null);
  return ObjC.unwrap(ns);
}}

function makeElement(id, tagName) {{
  const element = {{
    id: id || '',
    tagName: String(tagName || 'div').toUpperCase(),
    value: '',
    textContent: '',
    innerHTML: '',
    disabled: false,
    className: '',
    dataset: {{}},
    type: tagName === 'input' ? 'text' : '',
    children: [],
    listeners: {{}},
    appendChild: function (child) {{ this.children.push(child); return child; }},
    addEventListener: function (type, cb) {{ (this.listeners[type] = this.listeners[type] || []).push(cb); }},
    dispatch: function (type, event) {{
      const evt = event || {{ target: this, preventDefault: function(){{}}, defaultPrevented: false }};
      (this.listeners[type] || []).forEach(function (cb) {{ cb(evt); }});
    }},
    classList: {{
      toggle: function () {{}},
      add: function () {{}},
      remove: function () {{}},
    }},
    focus: function () {{ document.activeElement = this; }},
    setSelectionRange: function () {{}},
    setAttribute: function () {{}},
    removeAttribute: function () {{}},
  }};
  return element;
}}

const ids = [
  'dictation-toggle-button','stop-dictation-button','analyze-button','clear-transcript-button',
  'sample-select','load-sample-button','status-pill','exam-type-select','manual-indication-input',
  'manual-presentation-select','manual-calcium-score-input','manual-heart-rate-input',
  'cad-rads-confidence','cad-rads-badge','cad-rads-summary','study-type-readout',
  'presentation-readout','plaque-burden-readout','modifier-readout','dominance-readout',
  'quality-readout','recommendation-readout','missing-info-list','dictation-availability',
  'dictation-engine','transcript-input','interim-transcript','exam-readout','exam-note',
  'quality-card-readout','quality-card-note','pattern-readout','pattern-note','coverage-readout',
  'coverage-note','technique-table-body','ancillary-table-body','vessel-table-body',
  'compose-report-button','copy-report-button','section-indication','section-technique',
  'section-quality','section-coronary','section-cardiac','section-extracardiac',
  'section-impression','section-recommendations','final-report-output'
];

const elements = {{}};
ids.forEach(function (id) {{
  let tag = 'div';
  if (/button/.test(id)) tag = 'button';
  else if (/select/.test(id)) tag = 'select';
  else if (/input/.test(id)) tag = 'input';
  else if (/section-|transcript-input|final-report-output/.test(id)) tag = 'textarea';
  else if (/tbody|table-body/.test(id)) tag = 'tbody';
  elements[id] = makeElement(id, tag);
}});

[
  'section-indication','section-technique','section-quality','section-coronary',
  'section-cardiac','section-extracardiac','section-impression','section-recommendations'
].forEach(function(id) {{
  elements[id].dataset.sectionField = id.replace('section-', '');
}});

globalThis.document = {{
  listeners: {{}},
  activeElement: null,
  addEventListener: function (type, cb) {{ (this.listeners[type] = this.listeners[type] || []).push(cb); }},
  getElementById: function (id) {{ return elements[id] || null; }},
  querySelectorAll: function (selector) {{
    if (selector === '[data-section-field]') {{
      return [
        'section-indication','section-technique','section-quality','section-coronary',
        'section-cardiac','section-extracardiac','section-impression','section-recommendations'
      ].map(function(id) {{ return elements[id]; }});
    }}
    return [];
  }},
  createElement: function (tag) {{ return makeElement('', tag); }},
}};

globalThis.window = {{
  setTimeout: function (cb) {{ cb(); return 1; }},
  clearTimeout: function () {{}},
  RTCPeerConnection: undefined,
  MediaRecorder: undefined,
  SpeechRecognition: undefined,
  webkitSpeechRecognition: undefined,
}};
globalThis.navigator = {{
  mediaDevices: null,
  clipboard: {{
    writeText: function() {{ return Promise.resolve(); }},
  }},
}};
globalThis.fetch = function () {{
  return Promise.resolve({{
    ok: false,
    json: function () {{ return Promise.resolve({{}}); }},
  }});
}};

const source = readFile({json.dumps(pointguard_path)});
eval(source);
(document.listeners['DOMContentLoaded'] || []).forEach(function (cb) {{ cb(); }});

const fixtures = {fixture_json};
const results = fixtures.map(function (fixture) {{
  return {{
    id: fixture.id,
    snapshot: window.__POINTGUARD_DEV__.analyzeCase(fixture.input || {{}})
  }};
}});

JSON.stringify(results, null, 2);
"""


def get_by_path(payload: dict, path: str):
    current = payload
    for segment in path.split("."):
        if isinstance(current, dict) and segment in current:
            current = current[segment]
        else:
            raise KeyError(path)
    return current


def main() -> int:
    fixtures = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    harness = build_harness_script(fixtures)
    completed = subprocess.run(
        ["osascript", "-l", "JavaScript"],
        input=harness,
        text=True,
        capture_output=True,
        check=False,
    )

    if completed.returncode != 0:
      print(completed.stderr.strip() or completed.stdout.strip() or "PointGuard regression harness failed to launch.")
      return completed.returncode or 1

    try:
        snapshots = json.loads(completed.stdout)
    except json.JSONDecodeError:
        print("Could not parse PointGuard regression harness output.")
        print(completed.stdout.strip())
        return 1

    snapshots_by_id = {entry["id"]: entry["snapshot"] for entry in snapshots}
    failures: list[str] = []

    for fixture in fixtures:
        snapshot = snapshots_by_id.get(fixture["id"])
        if snapshot is None:
            failures.append(f"{fixture['id']}: missing snapshot output")
            continue

        for rule in fixture.get("expect", []):
            path = str(rule["path"])
            try:
                actual_value = get_by_path(snapshot, path)
            except KeyError:
                failures.append(f"{fixture['id']}: missing path {path}")
                continue

            actual_text = "" if actual_value is None else str(actual_value)
            if "equals" in rule and actual_text != str(rule["equals"]):
                failures.append(
                    f"{fixture['id']}: expected {path} == {rule['equals']!r}, got {actual_text!r}"
                )
            if "contains" in rule and str(rule["contains"]) not in actual_text:
                failures.append(
                    f"{fixture['id']}: expected {path} to contain {rule['contains']!r}, got {actual_text!r}"
                )
            if "notContains" in rule and str(rule["notContains"]) in actual_text:
                failures.append(
                    f"{fixture['id']}: expected {path} not to contain {rule['notContains']!r}, got {actual_text!r}"
                )

    if failures:
        print("PointGuard regression check failed.")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print(f"PointGuard regression check passed for {len(fixtures)} cases.")
    for fixture in fixtures:
        snapshot = snapshots_by_id[fixture["id"]]
        print(f"- {fixture['id']}: {snapshot['cadRads']} | {snapshot['plaqueBurden']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
