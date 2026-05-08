"""Dump the ``DynamicToolSources`` JSON Schema (UserToolSource | YamlToolSource).

Run with ``GALAXY_ROOT/lib`` on ``PYTHONPATH`` and a venv with pydantic.
The Makefile target ``sync-user-tool-source-schema`` wires this up.
"""

import json
import sys

from pydantic import TypeAdapter

from galaxy.tool_util_models import DynamicToolSources

schema = TypeAdapter(DynamicToolSources).json_schema()
json.dump(schema, sys.stdout, indent=2, sort_keys=True)
sys.stdout.write("\n")
