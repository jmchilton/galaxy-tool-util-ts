"""Dump galaxy.tool_util_models.Tests JSON Schema to stdout.

Run with ``GALAXY_ROOT/lib`` on ``PYTHONPATH`` and a venv that has pydantic.
The Makefile target ``sync-test-format-schema`` wires this up.

Post-processing: the ``Tests`` model uses callable ``Discriminator`` functions
(``_discriminate_output``, ``_discriminate_collection_element``) for its
class-tagged unions. Pydantic cannot serialize a callable discriminator into
JSON Schema, so ``model_json_schema()`` degrades those unions to a plain
``oneOf`` of the members. ajv then matches structurally and accepts inputs the
runtime model rejects (e.g. a class-less collection assertion routed to the
strict File model). We rewrite those two unions into ``if/then/else`` keyed on
``class`` so the vendored schema dispatches the way the model does.
"""

import json
import sys
from typing import (
    Any,
    Optional,
)

from galaxy.tool_util_models import Tests

# Members of the two callable-discriminator unions (by $defs name). Mirrors
# _discriminate_output / _discriminate_collection_element in
# galaxy.tool_util_models: a dict with class == "Collection" picks the
# Collection model, any other dict picks the File model, non-dicts (output
# union only) pick the scalar branch.
_OUTPUT_COLLECTION = "TestCollectionOutputAssertions"
_OUTPUT_FILE = "TestDataOutputAssertions"
_ELEMENT_COLLECTION = "TestCollectionCollectionElementAssertions"
_ELEMENT_FILE = "TestCollectionDatasetElementAssertions"


def _ref(name: str) -> dict:
    return {"$ref": f"#/$defs/{name}"}


def _class_is(const: str) -> dict:
    """An ``if`` schema matching an object whose ``class`` equals ``const``."""
    return {"type": "object", "required": ["class"], "properties": {"class": {"const": const}}}


def _member_names(one_of: list) -> set:
    return {m["$ref"].split("/")[-1] for m in one_of if isinstance(m, dict) and "$ref" in m}


def _scalar_branch(one_of: list) -> Optional[dict]:
    return next((m for m in one_of if isinstance(m, dict) and "anyOf" in m), None)


def _rewrite_discriminated(node: dict) -> dict:
    """If ``node`` carries one of the two callable-discriminator ``oneOf``
    unions, return a copy that dispatches via ``if/then/else`` on ``class``.
    Sibling keys (description, title) are preserved; ``oneOf`` is dropped."""
    one_of = node.get("oneOf")
    if not isinstance(one_of, list):
        return node
    names = _member_names(one_of)

    if {_OUTPUT_COLLECTION, _OUTPUT_FILE} <= names:
        # class == "Collection" -> Collection; other object -> File; else scalar.
        otherwise: dict[str, Any] = {"if": {"type": "object"}, "then": _ref(_OUTPUT_FILE)}
        scalar = _scalar_branch(one_of)
        if scalar is not None:
            otherwise["else"] = scalar
        rewritten = {"if": _class_is("Collection"), "then": _ref(_OUTPUT_COLLECTION), "else": otherwise}
    elif {_ELEMENT_COLLECTION, _ELEMENT_FILE} == names:
        # Collection elements are always objects: class == "Collection" -> Collection, else File.
        rewritten = {
            "if": _class_is("Collection"),
            "then": _ref(_ELEMENT_COLLECTION),
            "else": _ref(_ELEMENT_FILE),
        }
    else:
        return node

    merged = {k: v for k, v in node.items() if k != "oneOf"}
    merged.update(rewritten)
    return merged


def _transform(node: Any) -> Any:
    if isinstance(node, dict):
        node = {k: _transform(v) for k, v in node.items()}
        return _rewrite_discriminated(node)
    if isinstance(node, list):
        return [_transform(v) for v in node]
    return node


schema = _transform(Tests.model_json_schema())
json.dump(schema, sys.stdout, indent=2, sort_keys=True)
sys.stdout.write("\n")
