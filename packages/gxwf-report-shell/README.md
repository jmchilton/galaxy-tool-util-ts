# @galaxy-tool-util/gxwf-report-shell

Pre-built Vue 3 + PrimeVue workflow report components as a self-contained IIFE bundle for CDN delivery.

## Usage — standalone HTML report (Python)

```python
import json

_CDN_VERSION = "0.1.0"
_CDN_BASE = f"https://cdn.jsdelivr.net/npm/@galaxy-tool-util/gxwf-report-shell@{_CDN_VERSION}/dist"

def report_to_html(report_type: str, report_data: dict, *, title: str = "gxwf Report") -> str:
    payload = json.dumps({"type": report_type, "data": report_data})
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>{title}</title>
  <link rel="stylesheet" href="{_CDN_BASE}/shell.css">
</head>
<body>
  <div id="gxwf-report"></div>
  <script>window.__GXWF_REPORT__ = {payload};</script>
  <script src="{_CDN_BASE}/shell.iife.js"></script>
</body>
</html>"""
```

`report_type` is one of `"validate"`, `"lint"`, `"clean"`, `"roundtrip"`. `report_data` is `report.model_dump(mode="json")` from a `Single{Validation,Lint,Clean,RoundTrip}Report` Pydantic model.

## Usage — VSCode webview

Load `dist/shell.iife.js` and `dist/shell.css` from the extension's bundled assets, then send:

```javascript
panel.webview.postMessage({ command: "render", type: "validate", data: reportData });
```

## Usage — gxwf-ui (workspace)

```typescript
import { ValidationReport, LintReport, CleanReport, RoundtripReport } from "@galaxy-tool-util/gxwf-report-shell";
```

## Local smoke test

After `pnpm build`, open `smoke-test.html` in a browser to verify all four report types render.

## CDN URLs

```
https://cdn.jsdelivr.net/npm/@galaxy-tool-util/gxwf-report-shell@{version}/dist/shell.iife.js
https://cdn.jsdelivr.net/npm/@galaxy-tool-util/gxwf-report-shell@{version}/dist/shell.css
```
