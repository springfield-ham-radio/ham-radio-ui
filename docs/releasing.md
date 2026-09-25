# Releasing HamBench

This app ships as native installers attached to [GitHub Releases](https://github.com/springfield-ham-radio/ham-radio-ui/releases). Versions are set by **semantic-release** from conventional commits. Do not edit version numbers by hand.

## Versioning

`package.json` is the source of truth. [`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json) reads that version via `"version": "../package.json"`. On each release, semantic-release also updates `src-tauri/Cargo.toml` and the `ham-radio` package version in `src-tauri/Cargo.lock` through [`scripts/set-cargo-version.mjs`](../scripts/set-cargo-version.mjs). Cargo rewrites that lock entry the next time it runs, so leaving it behind shows up as a local change.

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

Unsigned builds (no Apple notarization or Windows Authenticode yet). After the platform builds upload, a follow-up job renames the installers so the platform is in the filename:

- **macOS (Apple Silicon):** `HamBench-X.Y.Z-macOS-Apple-Silicon.dmg`
- **Windows:** `HamBench-X.Y.Z-Windows-x64.exe` and `HamBench-X.Y.Z-Windows-x64.msi`
- **Linux (x64):** `HamBench-X.Y.Z-Linux-x64.deb`, `.rpm`, and `.AppImage`

Updater payloads (`.app.tar.gz`, `.sig`, and `latest.json`) keep the names Tauri generated. The rename changes the installer filename on the existing asset, so the updater links in `latest.json` stay valid. Rebuilding a tag uploads another copy under Tauri's original filename; the rename job removes the previous platform-named installer and renames the new upload onto that name.

CI builds installers in the same workflow run after semantic-release (via `workflow_call`). A standalone `release` event from `GITHUB_TOKEN` does not start other workflows.

macOS Gatekeeper and Windows SmartScreen will warn. Current macOS often reports an unsigned Safari download as **“HamBench” is damaged and can’t be opened**. That is quarantine, not a corrupt file. Users should not move it to the Trash. Clear the quarantine, then open it:

```sh
xattr -cr ~/Downloads/HamBench*.dmg
```

If the app is already in Applications:

```sh
xattr -cr /Applications/HamBench.app
open /Applications/HamBench.app
```

Right-click → Open often does not dismiss this dialog. On Windows, choose **More info** → **Run anyway**. User-facing copy also lives in the [HamBench install guide](https://springfield-ham-radio.github.io/ham-radio-docs/guide/getting-started).

## Auto-update

Packaged builds use the [Tauri updater](https://v2.tauri.app/plugin/updater/). They fetch [`latest.json`](https://github.com/springfield-ham-radio/ham-radio-ui/releases/latest/download/latest.json) from GitHub Releases, verify a minisign signature, download the matching installer, then ask the user to restart. The app does not relaunch by itself.

`tauri-action` writes `latest.json` when `bundle.createUpdaterArtifacts` is true and the signing key is present. Artifacts are signed with a private key that must never be committed.

The Release Tauri job runs [`scripts/prepare-updater-signing.ts`](../scripts/prepare-updater-signing.ts) first. That script accepts the private key as the raw minisign file, the same file with literal `\n` escapes, or base64 of the whole file. It then sets `TAURI_SIGNING_PRIVATE_KEY` to base64 of that file, which is the encoding `tauri build` decodes. Passing the raw minisign text or a file path fails with `Invalid symbol 32, offset 9`. If the secret is missing or not a minisign key, the job disables `createUpdaterArtifacts` and still uploads installers. In-app updates stay off until the secret is a valid matching key.

### GitHub Actions secrets

Add these as **repository** secrets (Settings → Secrets and variables → Actions), not environment secrets. Environment secrets are not visible to this workflow.

| Secret | Value |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Entire contents of `~/.tauri/ham-radio-ui.key`. `tauri signer generate` usually writes this as one base64 line; paste that line. You will not see `untrusted comment:` in the file; it appears only after decoding. Raw minisign text also works. |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Key password. Omit this secret, or leave it empty, when the key has none. |

Generate a key pair with `yarn tauri signer generate -w ~/.tauri/ham-radio-ui.key`. Put only the public key in [`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json) `plugins.updater.pubkey`. Keep the private key in a password manager and in the GitHub secret.

Confirm a generated key decodes to a minisign/rsign secret key:

```
python3 -c "import base64, pathlib; print(base64.b64decode(pathlib.Path.home().joinpath('.tauri/ham-radio-ui.key').read_text().strip()).decode().splitlines()[0])"
```

That should print `untrusted comment: rsign encrypted secret key` or `untrusted comment: minisign encrypted secret key`. If the file already starts with `untrusted comment:`, it is already decoded; paste it as-is.

Local `yarn tauri:build` also needs the key:

```
export TAURI_SIGNING_PRIVATE_KEY_PATH="$HOME/.tauri/ham-radio-ui.key"
```

Users on a build from before updater support was added must install one updater-enabled release by hand. Later versions then update themselves.

## Adding code signing later

Store Apple and/or Windows signing credentials as GitHub Actions secrets, then pass them into the Tauri build steps in [`.github/workflows/release-tauri.yml`](../.github/workflows/release-tauri.yml). See the [Tauri signing docs](https://v2.tauri.app/distribute/) for certificate and notarization setup.
