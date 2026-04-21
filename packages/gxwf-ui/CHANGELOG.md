# @galaxy-tool-util/gxwf-ui

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
