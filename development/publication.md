# Publication

## How It Works

Releases are fully automated via the [changesets/action](https://github.com/changesets/action) GitHub Action on every push to `main`.

### Flow

1. During development, each PR that touches published package source includes a changeset file (created with `pnpm changeset`).
2. On merge to `main`, the Action collects all pending `.changeset/*.md` files and opens a "Version Packages" PR that bumps versions and updates changelogs.
3. When that PR is merged, the Action publishes all changed packages to npm using OIDC trusted publishing (no stored npm token — provenance is attached automatically via `NPM_CONFIG_PROVENANCE=true`).

### Linked Versioning

All published packages are in one linked group in `.changeset/config.json`:

```json
"linked": [
  [
    "@galaxy-tool-util/schema",
    "@galaxy-tool-util/core",
    "@galaxy-tool-util/cli",
    "@galaxy-tool-util/tool-cache-proxy",
    "@galaxy-tool-util/gxwf-web",
    "@galaxy-tool-util/gxwf-client",
    "@galaxy-tool-util/gxwf-report-shell"
  ]
]
```

Linked mode means: if any package bumps, **all linked packages bump to the same version** (taking the highest version in the group and applying the highest-level bump). This keeps versions in sync across the monorepo.

Private packages (`gxwf-ui`, `gxwf-e2e`) are excluded from publishing automatically via `"private": true` in their `package.json`.

### Trusted Publishing (OIDC)

The release workflow uses GitHub Actions OIDC (`id-token: write`) instead of a stored npm token. This must be configured **per package** on npmjs.com:

1. Go to `https://www.npmjs.com/package/<package-name>` → Settings → Trusted Publishers
2. Add a trusted publisher: GitHub Actions, repo `jmchilton/galaxy-tool-util-ts`, workflow `release.yml`

This configuration is already in place for all currently published packages.

---

## Adding a New Published Package

New packages require a one-time manual stub publish to create the package page on npm before trusted publishing can be configured. Trusted publishing cannot be set up on a package that doesn't exist yet.

### Step 1 — Build and publish the stub

Ensure you're logged in to npm locally (`npm login`), then from the repo root:

```bash
pnpm --filter @galaxy-tool-util/<new-package> build
cd packages/<new-package>
pnpm publish --no-git-checks --no-provenance --tag stub
```

Use `--no-provenance` because OIDC tokens aren't available locally. Use `--tag stub` so the stub version doesn't become the `latest` tag — linked-mode versioning will bump the package up to the group's unified version on the next automated release, so `latest` is never the stub.

If npm prompts for 2FA, open the browser URL it provides to complete authentication.

Publish packages in dependency order (if package B depends on package A via `workspace:*`, publish A first).

### Step 2 — Configure trusted publishing on npmjs.com

Go to `https://www.npmjs.com/package/@galaxy-tool-util/<new-package>` → Settings → Trusted Publishers and add:

- **Provider**: GitHub Actions
- **Repository**: `jmchilton/galaxy-tool-util-ts`
- **Workflow**: `release.yml`
- **Environment**: `npm-publish` (matches `environment: npm-publish` in `.github/workflows/release.yml`)

### Step 3 — Add to the linked group

Add the new package name to the `linked` array in `.changeset/config.json` (unless it should version independently).

### Step 4 — Include in the changeset release

Ensure a `.changeset/*.md` file references the new package so it appears in the next Version Packages PR.
