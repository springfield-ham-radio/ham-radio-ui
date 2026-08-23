# Releasing Ham Radio UI

This app ships as native installers attached to [GitHub Releases](https://github.com/springfield-ham-radio/ham-radio-ui/releases). Versions are set by **semantic-release** from conventional commits. Do not edit version numbers by hand.

## Versioning

`package.json` is the source of truth. [`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json) reads that version via `"version": "../package.json"`. On each release, semantic-release also updates `src-tauri/Cargo.toml` through [`scripts/set-cargo-version.mjs`](../scripts/set-cargo-version.mjs).

| Commit on `main` | Bump |
| --- | --- |
| `fix:` | patch (`0.1.0` → `0.1.1`) |
| `feat:` | minor (`0.1.0` → `0.2.0`) |
| `feat!:` or `BREAKING CHANGE:` | major (`0.1.0` → `1.0.0`) |

The `beta` branch publishes prereleases (`0.2.0-beta.1`).

## How to cut a release

1. Merge a PR with conventional commits into `main` (or `beta`).
2. The CI `release` job runs semantic-release: changelog, git tag `vX.Y.Z`, and a GitHub Release.
3. CI then calls the **Release Tauri** workflow (same run) to build installers and upload them to that release.

GitHub does not start new workflows from events created with `GITHUB_TOKEN`, so installer builds are chained from CI via `workflow_call` rather than the `release` event alone.

You can rebuild installers for an existing tag from the Actions UI (**Release Tauri** → Run workflow → enter the tag).

Baseline tag `v0.0.0` exists so the first automated release is `0.1.0` instead of semantic-release’s default `1.0.0`.

## Downloadable artifacts

Unsigned builds (no Apple notarization or Windows Authenticode yet):

- **macOS (Apple Silicon):** `.dmg`
- **Windows:** NSIS `.exe` and `.msi`
- **Linux (x64):** `.deb`, `.rpm`, and `.AppImage`

CI builds installers in the same workflow run after semantic-release (via `workflow_call`). A standalone `release` event from `GITHUB_TOKEN` does not start other workflows.

macOS Gatekeeper and Windows SmartScreen will warn. Users can still open the app (macOS: right-click → Open; Windows: More info → Run anyway).

## Adding code signing later

Store Apple and/or Windows signing credentials as GitHub Actions secrets, then pass them into the Tauri build steps in [`.github/workflows/release-tauri.yml`](../.github/workflows/release-tauri.yml). See the [Tauri signing docs](https://v2.tauri.app/distribute/) for certificate and notarization setup.
