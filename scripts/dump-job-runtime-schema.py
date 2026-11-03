"""Dump the JSON Schema of the job runtime models a user-defined tool's ``inputs`` holds.

``data`` inputs become ``DataInternalJson``; collections become a
``DataCollectionInternalJsonBase`` subclass whose leaf elements are
``DataCollectionElementInternalJson`` (``paired`` elements are
``DataCollectionPairedElements``). The expression-path check reads the field
names from this schema.

Run with ``GALAXY_ROOT/lib`` on ``PYTHONPATH`` and a venv with pydantic.
The Makefile target ``sync-job-runtime-schema`` wires this up.
"""

import json
import sys

from pydantic.json_schema import models_json_schema

from galaxy.tool_util_models.parameters import (
    DataCollectionElementInternalJson,
    DataCollectionInternalJsonBase,
    DataCollectionPairedElements,
    DataInternalJson,
)

MODELS = (
    DataInternalJson,
    DataCollectionElementInternalJson,
    DataCollectionInternalJsonBase,
    DataCollectionPairedElements,
)

# Runtime values are produced with ``model_dump(by_alias=True)``: serialization mode.
_, schema = models_json_schema([(model, "serialization") for model in MODELS])
json.dump(schema, sys.stdout, indent=2, sort_keys=True)
sys.stdout.write("\n")
