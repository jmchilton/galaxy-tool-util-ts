#!/usr/bin/env python3
"""
Generate test fixture data from Galaxy's parameter specification infrastructure.

Usage:
    # From the Galaxy repo root with Galaxy's environment:
    PYTHONPATH=lib python /path/to/galaxy-tool-util/scripts/generate_fixtures.py

    # Or from this repo, if GALAXY_ROOT is set:
    GALAXY_ROOT=~/projects/repositories/galaxy ./scripts/generate_fixtures.py

Outputs:
    test/fixtures/parameter_specification.yml  (copied from Galaxy)
    test/fixtures/parameter_models/{tool_name}.json  (per-tool bundles)
"""
import json
import os
import shutil
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
FIXTURES_DIR = PROJECT_ROOT / "test" / "fixtures"
MODELS_DIR = FIXTURES_DIR / "parameter_models"

# Try to find Galaxy
galaxy_root = os.environ.get("GALAXY_ROOT")
if galaxy_root:
    sys.path.insert(0, os.path.join(galaxy_root, "lib"))
elif not any("galaxy" in p for p in sys.path):
    # Try common location
    default_galaxy = Path.home() / "projects" / "repositories" / "galaxy"
    if (default_galaxy / "lib" / "galaxy").exists():
        sys.path.insert(0, str(default_galaxy / "lib"))
        galaxy_root = str(default_galaxy)

try:
    import yaml
    from galaxy.tool_util.unittest_utils.parameters import parameter_bundle_for_file
    from galaxy.util.resources import resource_string
except ImportError as e:
    print(f"Error: Cannot import Galaxy modules: {e}")
    print("Set GALAXY_ROOT or run with PYTHONPATH=lib from Galaxy repo root.")
    sys.exit(1)


def load_specification():
    spec_path = os.path.join(
        galaxy_root or str(Path.home() / "projects" / "repositories" / "galaxy"),
        "test", "unit", "tool_util", "parameter_specification.yml"
    )
    with open(spec_path) as f:
        return yaml.safe_load(f.read()), spec_path


def main():
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    spec, spec_path = load_specification()

    # Copy the specification YAML
    dest_spec = FIXTURES_DIR / "parameter_specification.yml"
    shutil.copy2(spec_path, dest_spec)
    print(f"Copied {spec_path} -> {dest_spec}")

    # Generate per-tool JSON bundles
    success = 0
    failed = 0
    for tool_name in spec.keys():
        try:
            bundle = parameter_bundle_for_file(tool_name)
            bundle_json = bundle.model_dump(mode="json")
            out_path = MODELS_DIR / f"{tool_name}.json"
            with open(out_path, "w") as f:
                json.dump(bundle_json, f, indent=2)
            success += 1
        except Exception as e:
            print(f"  FAILED {tool_name}: {e}")
            failed += 1

    print(f"\nGenerated {success} fixture files, {failed} failures.")
    print(f"Output: {MODELS_DIR}")


if __name__ == "__main__":
    main()
