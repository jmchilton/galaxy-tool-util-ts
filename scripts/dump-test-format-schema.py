"""Dump galaxy.tool_util_models.Tests JSON Schema to stdout.

Run with ``GALAXY_ROOT/lib`` on ``PYTHONPATH`` and a venv that has pydantic.
The Makefile target ``sync-test-format-schema`` wires this up.
"""

import json
import sys

from galaxy.tool_util_models import Tests

schema = Tests.model_json_schema()
json.dump(schema, sys.stdout, indent=2, sort_keys=True)
sys.stdout.write("\n")
