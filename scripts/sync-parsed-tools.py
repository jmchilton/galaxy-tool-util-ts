"""Sync ParsedTool JSON fixtures for connection-workflow tests.

Walks synced .gxwf.yml fixtures, collects every tool_id referenced, resolves
each to a Galaxy functional test tool, parses it, and writes one JSON file per
tool plus a SHA256 manifest. Runs under a Galaxy venv with PYTHONPATH pointing
at GALAXY_ROOT/lib (wired by the ``sync-parsed-tools`` Makefile target).

Loud failure on any unresolved tool_id — no silent skips.
"""

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

import yaml

from galaxy.tool_util.model_factory import parse_tool
from galaxy.tool_util.parser.factory import get_tool_source
from galaxy.tool_util.unittest_utils import (
    functional_test_tool_directory,
    functional_test_tool_source,
)


def find_tool_source(tool_id: str):
    try:
        return functional_test_tool_source(tool_id)
    except (FileNotFoundError, OSError):
        pass
    root = functional_test_tool_directory()
    for dirpath, _dirnames, filenames in os.walk(root):
        for ext in (".xml", ".yml"):
            candidate = f"{tool_id}{ext}"
            if candidate in filenames:
                return get_tool_source(os.path.join(dirpath, candidate))
    raise FileNotFoundError(f"No functional test tool source found for {tool_id!r}")


def collect_tool_ids(fixtures_dir: Path) -> set[str]:
    tool_ids: set[str] = set()
    for wf_path in sorted(fixtures_dir.glob("*.gxwf.yml")):
        doc = yaml.safe_load(wf_path.read_text())
        steps = doc.get("steps") or {}
        iterable = steps.values() if isinstance(steps, dict) else steps
        for step in iterable:
            if isinstance(step, dict) and step.get("tool_id"):
                tool_ids.add(step["tool_id"])
    return tool_ids


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixtures", required=True, type=Path,
                        help="Directory with synced *.gxwf.yml fixtures")
    parser.add_argument("--out", required=True, type=Path,
                        help="Output directory for per-tool JSON + manifest")
    parser.add_argument("--galaxy-root", required=True, type=Path,
                        help="Galaxy checkout root (for diagnostics)")
    args = parser.parse_args()

    if not args.fixtures.is_dir():
        print(f"ERROR: fixtures dir not found: {args.fixtures}", file=sys.stderr)
        return 2

    tool_ids = collect_tool_ids(args.fixtures)
    if not tool_ids:
        print(f"ERROR: no tool_id references found in {args.fixtures}", file=sys.stderr)
        return 2

    args.out.mkdir(parents=True, exist_ok=True)
    for stale in args.out.glob("*.json"):
        stale.unlink()
    sha_path = args.out / "parsed_tools.sha256"
    if sha_path.exists():
        sha_path.unlink()

    unresolved: list[str] = []
    checksums: dict[str, str] = {}

    for tool_id in sorted(tool_ids):
        try:
            source = find_tool_source(tool_id)
            parsed = parse_tool(source)
        except Exception as exc:
            unresolved.append(f"  {tool_id}: {exc}")
            continue

        payload = parsed.model_dump_json(indent=2, by_alias=True)
        dest = args.out / f"{tool_id}.json"
        dest.write_text(payload + "\n")
        checksums[f"{tool_id}.json"] = hashlib.sha256(dest.read_bytes()).hexdigest()

    if unresolved:
        print("ERROR: failed to resolve tool_id(s):", file=sys.stderr)
        for line in unresolved:
            print(line, file=sys.stderr)
        return 1

    manifest_lines = [f"{sha}  {name}" for name, sha in sorted(checksums.items())]
    sha_path.write_text("\n".join(manifest_lines) + "\n")

    print(f"Wrote {len(checksums)} ParsedTool JSON files to {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
