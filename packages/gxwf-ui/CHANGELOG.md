# @galaxy-tool-util/gxwf-ui

## 0.3.2

### Patch Changes

- Updated dependencies []:
  - @galaxy-tool-util/gxwf-client@1.4.0

## 0.3.1

### Patch Changes

- Updated dependencies []:
  - @galaxy-tool-util/gxwf-client@1.3.0

## 0.3.0

### Minor Changes

- [#84](https://github.com/jmchilton/galaxy-tool-util-ts/pull/84) [`da95cb0`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/da95cb08da77ada269ca690339cdba04d1de1343) Thanks [@jmchilton](https://github.com/jmchilton)! - Auto-dispatch + hybrid endpoint for workflow edge annotations.

  `gxwf-ui` `WorkflowDiagram` now drives annotations through the new
  `useEdgeAnnotationsAuto` composable: probes `GET /healthz` for the
  `edge-annotations` feature on the first build, caches the decision in
  `sessionStorage` (`gxwf-ui:annotations-mode`), and falls back to the
  client-side composable on probe failure or post-decision server failure
  (network / 5xx / CORS). `VITE_GXWF_EDGE_ANNOTATIONS_MODE=server|client`
  pins the transport for static deploys that know the answer up front.

  `gxwf-web` `POST /workflows/{path}/edge-annotations` now returns
  `{ annotations, tool_specs }`; `tool_specs` is keyed by
  `${tool_id}@${tool_version}` and carries the `ParsedTool` specs the
  validator consumed. Co-resident browsers write these into the IndexedDB
  cache via `useToolInfoService.addTool`, so the next workflow load —
  whether server-routed or client-side — hits a warm cache and avoids a
  second cold-start fanout to ToolShed. Older `gxwf-web` builds that return
  the bare `Record<edgeKey, EdgeAnnotation>` are still consumed correctly;
  the UI detects the envelope shape and ignores legacy responses.

  `@galaxy-tool-util/cli` exports `resolveEdgeAnnotationsAndSpecsWithCache`
  - `ResolvedToolSpec` to support the hybrid response. `gxwf-web`'s
    existing `operateEdgeAnnotations` now uses it; the original
    `resolveEdgeAnnotationsWithCache` is unchanged.

- [#84](https://github.com/jmchilton/galaxy-tool-util-ts/pull/84) [`05638e6`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/05638e619bc7446a7e2106cf845c25c0d5bbf198) Thanks [@jmchilton](https://github.com/jmchilton)! - Browser-side `useClientEdgeAnnotations` composable — peer of
  `useEdgeAnnotations` (server route) that runs the connection validator and
  edge-annotation builder locally against the IndexedDB-backed
  `useToolInfoService`. Lights up map/reduce annotations in deployments
  without `gxwf-web` (static / embed / offline previews).

  Surfaces `{ annotations, loading, error, misses, progress, build, clear }`
  — `annotations`/`loading`/`error`/`build`/`clear` are shape-compatible with
  `useEdgeAnnotations`, so renderers can swap with a one-line import change.
  The additive `misses` and `progress` refs feed cold-start UX: progress
  ticks once per tool ref while preloading at concurrency 6, and tools that
  fail to resolve land in `misses` with `{toolId, toolVersion, reason}`
  instead of throwing — annotations on edges into unresolved tools simply
  don't appear.

  Note: `misses` is collected but not yet surfaced in the diagram toolbar;
  the cold-start progress pill + miss dialog + retry-via-`refetch` UI are a
  follow-up. Until then, partial annotations render silently.

- [#84](https://github.com/jmchilton/galaxy-tool-util-ts/pull/84) [`a78ae67`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/a78ae67ef86dce2d5d48c39fc4e2e04a52108530) Thanks [@jmchilton](https://github.com/jmchilton)! - `useClientToolCache` composable — browser-side peer of `useToolCache` that
  mirrors the same reactive surface (`{ entries, stats, loading, error,
refresh, loadRaw, del, clear, refetch, add }`) but talks directly to the
  singleton `useToolInfoService()` cache instead of the `gxwf-web`
  `/api/tool-cache` REST surface. Existing `ToolCacheTable`, `ToolCacheStats`,
  and `ToolCacheRawDialog` components render unchanged against either
  backend.

  The `/cache` view gains a transport selector — Server / Client / Both —
  persisted per-origin in `localStorage`. "Both" stacks two panels so the
  server-side and IndexedDB caches can be inspected side by side without
  leaving the page.

  Docs: new `docs/packages/gxwf-ui.md` (IndexedDB schema, transport matrix,
  configuration, CSP gotcha) and `docs/packages/gxwf-web.md` (`/healthz`,
  hybrid `tool_specs` envelope, tool-cache REST surface).

- [#84](https://github.com/jmchilton/galaxy-tool-util-ts/pull/84) [`673948b`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/673948b7629bbe8a698b3eb1b49c44177415eeab) Thanks [@jmchilton](https://github.com/jmchilton)! - Workflow diagram view now supports a runtime renderer swap between Mermaid
  and Cytoscape, plus a "Map/reduce" toggle that threads connection-validation
  edge annotations into both renderers.

  The Cytoscape view dynamic-imports `cytoscape` + `cytoscape-dagre` (so it
  costs nothing for users staying on Mermaid), auto-detects whether to use
  the workflow's editor positions (`preset`) or auto-layout (`dagre`), and
  ships a theme-aware stylesheet that updates when the document toggles
  dark/light. Both choices persist across sessions in `localStorage`.

  Edge annotations run client-side via the connection validator with a no-op
  tool-info lookup — annotations land for whatever the workflow declares
  structurally; richer fidelity (full tool input/output specs) can be wired
  later via a `gxwf-web` tool-info endpoint without touching this surface.

- [#84](https://github.com/jmchilton/galaxy-tool-util-ts/pull/84) [`c930b72`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/c930b7267f5ae5224a0229e33d904471add49d54) Thanks [@jmchilton](https://github.com/jmchilton)! - Browser-side `useToolInfoService` composable — singleton `ToolInfoService`
  backed by `IndexedDBCacheStorage`. Sources default to the public Galaxy
  ToolShed and (optionally) a co-resident `gxwf-web` / tool-cache-proxy origin
  when `VITE_GXWF_TOOL_CACHE_PROXY_URL` is set; the proxy comes first when
  present so we get lower-latency, same-origin hits before falling back to
  the public shed. `VITE_GXWF_TOOLSHED_URL` and `VITE_GXWF_CACHE_DB_NAME`
  override the defaults.

  Foundation for `useClientEdgeAnnotations` (next phase) — exposes the same
  `getToolInfo` surface as the Node-side service so the connection validator
  can drive map/reduce annotations in deployments without `gxwf-web`.

  Deployers overriding the default ToolShed must extend the page CSP
  `connect-src` to include the override origin (gxwf-web's
  `--csp-connect-src` flag); the composable logs an info-level warning to
  make this visible during development.

- [#81](https://github.com/jmchilton/galaxy-tool-util-ts/pull/81) [`86af88e`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/86af88e0162bbff6d1941f6556e2edd0070a0321) Thanks [@jmchilton](https://github.com/jmchilton)! - Tool Cache debugging panel.
  - `ToolCache.statCached(key)` — per-entry size/mtime (passthrough to `CacheStorage.stat`).
  - `ToolInfoService.refetch(toolId, version?, {force?})` — idempotent populate (short-circuits on cache hit) / forced re-fetch. Returns `{cacheKey, fetched, alreadyCached}`. Backs the new web routes and any future inspector surfaces.
  - `gxwf-web`: new `/api/tool-cache` routes — list (with `?decode=1` opt-in decode probe), stats, raw read, single + prefix delete, refetch, add. `AppState` now carries the full `ToolInfoService` (not just its cache) so refetch/add can drive the existing source-fallback logic.
  - `gxwf-client` regenerated to expose the new schemas.
  - `gxwf-ui`: new "Tool Cache" navbar tab with stats strip, filterable table (search / source dropdown / undecodable-only), per-row view-raw / refetch / open-toolshed / delete, and overflow menu (Add tool…, Clear by prefix…, Clear all). Decode-probe flags malformed payloads.

### Patch Changes

- Updated dependencies [[`0826f95`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/0826f95e1c05005860c0e45a9794d8bad068d51d), [`6fec560`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/6fec560edbc19b1ba4d535bd64610efcc3d904b0), [`8261f8d`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/8261f8d95040ad76a053ce3bf5048de53c41dda9), [`0124600`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/0124600f0cd42210f20989c6626ece034d13dfe5), [`016385b`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/016385bb0e40a9cbe1f6c55d9d18829917914df0), [`8cfbe32`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/8cfbe327f69ce09578ac49c3eff39282ba66c7fc), [`cc00008`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/cc00008fc42d637fc8a76eeb41eab038a7b0408a), [`505fefa`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/505fefaead84dcf632695de678ce35d728cd58fa), [`86af88e`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/86af88e0162bbff6d1941f6556e2edd0070a0321), [`ee543b5`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/ee543b522c9181f0920969746e271e986fea3249)]:
  - @galaxy-tool-util/core@1.2.0
  - @galaxy-tool-util/schema@1.2.0
  - @galaxy-tool-util/connection-validation@1.2.0
  - @galaxy-tool-util/gxwf-client@1.2.0
  - @galaxy-tool-util/gxwf-report-shell@1.2.0

## 0.2.3

### Patch Changes

- [#68](https://github.com/jmchilton/galaxy-tool-util-ts/pull/68) [`de7fb91`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/de7fb9117717184cb9e42ac566ff7bf51f43e916) Thanks [@jmchilton](https://github.com/jmchilton)! - Set `activeEditor`, `resourceLangId`, and `editorIsOpen` context keys on Monaco mount so extension commands gated on those `when` clauses (Galaxy Workflows: Clean / Convert / Export / Insert Tool Step…) appear in the command palette.

- Updated dependencies [[`3b97a0f`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/3b97a0f41c2358aa663df4e6490488e89c9ba9e5), [`11a6625`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/11a66254a6c1c2640954ab4fbc41c59b0add0617)]:
  - @galaxy-tool-util/schema@1.1.0
  - @galaxy-tool-util/gxwf-report-shell@1.1.0
  - @galaxy-tool-util/gxwf-client@1.1.0

## 0.2.2

### Patch Changes

- Updated dependencies [[`afcd804`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/afcd804e03dacffd03821c3f75e2cae4a0340400), [`7b835d2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/7b835d298c4863ac0573e9091f4b1b8c72c34fef), [`9cca5f2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/9cca5f288e3504f3c03c9c3e5b04414379050941), [`9cca5f2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/9cca5f288e3504f3c03c9c3e5b04414379050941)]:
  - @galaxy-tool-util/schema@1.0.0
  - @galaxy-tool-util/gxwf-report-shell@1.0.0
  - @galaxy-tool-util/gxwf-client@1.0.0

## 0.2.1

### Patch Changes

- Updated dependencies [[`8404313`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/8404313159eb3950fefbb4c6c2ad2c7ddc79eef5), [`f4ea125`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/f4ea12548ffe1a69f33970cd8de18b76cbe2e744)]:
  - @galaxy-tool-util/schema@0.4.0
  - @galaxy-tool-util/gxwf-report-shell@0.4.0
  - @galaxy-tool-util/gxwf-client@0.4.0

## 0.2.0

### Minor Changes

- [#57](https://github.com/jmchilton/galaxy-tool-util-ts/pull/57) [`0186fb4`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/0186fb4ef0cfbaa04384737ded084093bdf4ed3e) Thanks [@jmchilton](https://github.com/jmchilton)! - Brand the embedded Monaco editor with first-class `gxwf-dark` and
  `gxwf-light` color themes, contributed through a synthetic VS Code
  extension. The active theme tracks the app's dark-mode toggle in real time
  via the workbench configuration service — no page reload, no flash of the
  default theme. Replaces the prior decorative `workbench.colorCustomizations`
  layering with full theme JSON files (chrome + TextMate token rules) and
  drops the `theme` prop from `MonacoEditor.vue`; the dark class on `<html>`
  is the single source of truth.

- [#57](https://github.com/jmchilton/galaxy-tool-util-ts/pull/57) [`ada6a15`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/ada6a1565690ef3b774fe64f6683542fbdf8409a) Thanks [@jmchilton](https://github.com/jmchilton)! - Add an editor toolbar next to the embedded Monaco editor surfacing Save,
  Undo/Redo, Format Document (when a formatter is registered), Find, Command
  Palette, and an LSP Problems badge that jumps to the next diagnostic and
  turns red on errors. `MonacoEditor.vue` now exposes `editor` + `model` to
  its parent via `defineExpose`, which `FileView.vue` forwards into the new
  toolbar. EditorShell (textarea) fallback chrome is unchanged.

- [#57](https://github.com/jmchilton/galaxy-tool-util-ts/pull/57) [`b9600b3`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/b9600b372d8367c4e88bfd62311a335a80e0117f) Thanks [@jmchilton](https://github.com/jmchilton)! - Wire Ctrl+S / Cmd+S to the gxwf-ui save handler inside the embedded Monaco
  editor. Overrides the workbench `workbench.action.files.save` command via
  `CommandsRegistry` so the built-in keybinding routes into `FileView.onSave`
  — the same handler the toolbar Save button invokes. EditorShell (textarea)
  fallback path is unaffected.

- [#41](https://github.com/jmchilton/galaxy-tool-util-ts/pull/41) [`ead01c6`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/ead01c695830847c8cb2a3ebc745cc18b044e82c) Thanks [@jmchilton](https://github.com/jmchilton)! - Style gxwf-ui with Galaxy/IWC brand identity: Galaxy navy dark mode palette, hokey-pokey gold borders on workflow list and operation panel, class-based dark mode toggle with localStorage persistence, and raw JSON view respecting light/dark mode via PrimeVue content tokens. Drop category column and tag from UI.

- [#49](https://github.com/jmchilton/galaxy-tool-util-ts/pull/49) [`1af1f7d`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/1af1f7dc3a84297c3d81bcf195781e7c010a6a0e) Thanks [@jmchilton](https://github.com/jmchilton)! - Mutating workflow ops + export/convert UI. Schema adds `ExportResult` / `ConvertResult` / `WorkflowSourceFormat`. Report shell adds `ExportReport.vue` and routes `"export"`/`"convert"` report types. UI switches workflow ops to POST, adds dry_run toggle on Clean, Export and Convert tabs with destructive-op confirmation and post-mutation workflow list refresh; Convert navigates back to the dashboard after removing the source. gxwf-client tests exercise POST export/convert and dry_run semantics.

### Patch Changes

- [#37](https://github.com/jmchilton/galaxy-tool-util-ts/pull/37) [`62ec18a`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/62ec18a96314a88217a7bf55e59d84852610de75) Thanks [@jmchilton](https://github.com/jmchilton)! - Add @galaxy-tool-util/gxwf-report-shell package: pre-built IIFE bundle of Vue 3 workflow report components for CDN delivery. Python can generate standalone HTML reports by injecting serialized Pydantic report JSON. gxwf-ui now imports report components from the new package.

- [#37](https://github.com/jmchilton/galaxy-tool-util-ts/pull/37) [`3826da3`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/3826da31ccfc8c24ec9ebee85306e4b8fffb15dd) Thanks [@jmchilton](https://github.com/jmchilton)! - Integrate gxwf-report-shell with CLI report output (Phases 1–4).

  **gxwf-report-shell**: Fix dep direction — switch from `@galaxy-tool-util/gxwf-client` to `@galaxy-tool-util/schema` for all `Single*Report` types. Add four tree-level report components (`TreeValidationReport`, `TreeLintReport`, `TreeCleanReport`, `TreeRoundtripReport`). Extend `ReportShell.vue` and `shell.ts` to dispatch on `validate-tree`, `lint-tree`, `clean-tree`, `roundtrip-tree` types. The same CDN IIFE bundle now renders both single-workflow and tree reports.

  **cli**: Add `--report-html [file]` to `validate`, `lint`, and `clean` single-workflow commands. Add CDN-based HTML output (`buildReportHtml` / `writeReportHtml`) to all four tree commands (`validate-tree`, `lint-tree`, `clean-tree`, `roundtrip-tree`). Tree `--report-html` now uses the Vue shell; `--report-markdown` keeps Nunjucks. Rename `SingleReportType` → `ReportType`, `buildSingleReportHtml` → `buildReportHtml`, `writeSingleReportHtml` → `writeReportHtml`. Remove dead Nunjucks HTML path (`getHtmlEnv`, `_macros.html.j2`).

  **gxwf-ui**: Switch `useOperation.ts` from `gxwf-client` OpenAPI types to `@galaxy-tool-util/schema` types at API response boundaries.

- [#57](https://github.com/jmchilton/galaxy-tool-util-ts/pull/57) [`b5a6e57`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/b5a6e57b26aa926ca5bf18b36f63d80bad9e90df) Thanks [@jmchilton](https://github.com/jmchilton)! - Unblock Monaco editor boot against the vsix fixture:
  - `gxwf-web`: add a Monaco-specific CSP header for `/monaco/*` (extension host iframe + workers need `unsafe-inline`/`unsafe-eval`); add `blob:`/`data:` to the main CSP's `connect-src` so the vsix loader can fetch packaged extension files.
  - `gxwf-ui`: switch the in-memory file provider from `registerCustomProvider` (pre-init only in monaco-vscode-api 30.x) to `registerFileSystemOverlay`, fixing the "Services are already initialized" crash on editor mount; patch the staged extension-host iframe's meta CSP to allow `blob:` fetches; honor the `:path` route param in `FileView` so deep links land on the selected file.

- [#57](https://github.com/jmchilton/galaxy-tool-util-ts/pull/57) [`3e4c06e`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/3e4c06e5f026391a17ab725fee611f2919c4e377) Thanks [@jmchilton](https://github.com/jmchilton)! - Fix the toolbar Command Palette button — the previous
  `editor.trigger(..., "editor.action.quickCommand")` call was a no-op under
  monaco-vscode-api because `editor.action.quickCommand` is not an
  editor-level action in this embed; the palette is owned by the workbench's
  `workbench.action.showCommands`. The button now invokes that command via
  `ICommandService`. Also moves the Ctrl+S / Cmd+S save-handler registration
  into `MonacoEditor.vue`'s mount hook so the override is in place before the
  editor's ready marker is set (previously raced against the keybinding on a
  fast save).

- [#41](https://github.com/jmchilton/galaxy-tool-util-ts/pull/41) [`066a4ac`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/066a4ac6f487da1cf3f767676724ee0ba459a02d) Thanks [@jmchilton](https://github.com/jmchilton)! - Add raw JSON view toggle to operation reports. Each operation tab (Validate/Lint/Clean/Roundtrip) now has a Formatted/Raw JSON toggle button that appears after a run, allowing inspection of the full API response.

- [#54](https://github.com/jmchilton/galaxy-tool-util-ts/pull/54) [`70f39f2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/70f39f295a8e73da73766c1773c2fddd2e1871f1) Thanks [@jmchilton](https://github.com/jmchilton)! - Upgrade Vite 6 → 8 and @vitejs/plugin-vue 5 → 6. Rename `rollupOptions` to `rolldownOptions` in report-shell config (Vite 8 uses Rolldown).

- Updated dependencies [[`005adf3`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/005adf3c61b088904f9b665985bba51b5eabf04e), [`7d7e93d`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/7d7e93d254b8ab440504fcb3ae7b5667505bf0dc), [`62ec18a`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/62ec18a96314a88217a7bf55e59d84852610de75), [`3826da3`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/3826da31ccfc8c24ec9ebee85306e4b8fffb15dd), [`ead01c6`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/ead01c695830847c8cb2a3ebc745cc18b044e82c), [`1af1f7d`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/1af1f7dc3a84297c3d81bcf195781e7c010a6a0e), [`d0c9888`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/d0c9888891e236e233c271c8788c9055ae69506b), [`54fc8f2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/54fc8f20720030cdbf690fd6e72066d7958fc9b5), [`a57f021`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/a57f021dbdbe6117a28add2b2e2f7520f09b068c), [`e54a513`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/e54a51342e3930b61bae3b27ce46925f186cc93c), [`066a4ac`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/066a4ac6f487da1cf3f767676724ee0ba459a02d), [`8f8c0e1`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/8f8c0e1f79d2da3b3db59a5136156a0878cfefe4), [`16652a9`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/16652a94c21402a3ee9108a0cd118d8af18c4708), [`b3b1b52`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/b3b1b52d9bccd6fdd7e713281be076ecfd74ee34), [`e5352d1`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/e5352d1dee68d0396ccc5227ec931d83a95793d2), [`85194f8`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/85194f8e710bc586939bc31b0cf20fc2d1329680), [`70f39f2`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/70f39f295a8e73da73766c1773c2fddd2e1871f1), [`20f6943`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/20f694303d2f6b71dcb4689d79107306de5bf5aa), [`7786c6f`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/7786c6f3a250dba31ba27be9ca0b4431bc0b0065), [`fe80b5f`](https://github.com/jmchilton/galaxy-tool-util-ts/commit/fe80b5fe44c7f67a51fc9b8483e182edb6038c04)]:
  - @galaxy-tool-util/schema@0.3.0
  - @galaxy-tool-util/gxwf-client@0.3.0
  - @galaxy-tool-util/gxwf-report-shell@0.3.0
