---
"@galaxy-tool-util/schema": patch
"@galaxy-tool-util/cli": patch
---

fix(roundtrip): match steps by label+type so reverse-pass renumbering doesn't misalign diffs

`roundtripValidate` matched original and reimported steps by numeric `id`. But
format2 stores inputs separately from `steps`, so the reverse (format2→native)
pass front-loads input steps and renumbers tools — a native step's id is not
stable across a roundtrip. When inputs were interleaved with tools, the diff
compared unrelated steps, producing phantom "step missing after roundtrip" and
value-mismatch errors (e.g. a tool's state diffed against an input, or two
same-tool steps diffed against each other).

Port Python's `_build_step_id_mapping` (`roundtrip.py`): match by label+type,
then same-id when the type matches, then a unique tool_id+type fallback for
unlabeled steps that shifted position, scoped per nesting level. Fixes #117
(clinicalmp-discovery's apparent peptideshaker step drop + dbbuilder `source`
mis-selection were both artifacts of this misalignment, not conversion bugs).
