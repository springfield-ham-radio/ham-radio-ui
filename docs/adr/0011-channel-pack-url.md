# Channel pack URL import and manual updates

**Status:** accepted  
**Date:** 2026-10-18  
**Related:** [#147](https://github.com/springfield-ham-radio/ham-radio-ui/issues/147), [0010-channel-pack.md](./0010-channel-pack.md)

## Context

Clubs host `.hpack` files at stable https URLs. Operators want a manual **Import from URL** action and **Check for updates** on a group that already stores a source URL, without background sync or accounts. The desktop webview is still subject to CORS for cross-origin `fetch`, while the browser build cannot reach arbitrary club hosts reliably.

## Decision

**Fetch path.** Desktop uses a Rust `fetch_channel_pack` command on the existing `reqwest` client (same family as RepeaterBook search and radio module downloads). The browser build uses webview `fetch` and reports CORS failures with guidance to use the desktop app. Shared TypeScript helper `fetchChannelPack` parses with `parseChannelPack` (ADR 0010); JSON Schema is not validated with a second library at runtime.

**Policy.** https only, any public host. Refuse credentials, `localhost`, `*.local`, `*.localhost`, and private or link-local IP literals. Follow at most five redirects; each hop must pass the same rules. Maximum body size is `CHANNEL_PACK_MAX_CHARS` (1_000_000). Timeout 20 seconds. Accept missing, `text/*`, `application/json`, and `application/octet-stream` content types; reject obvious non-text media before parse.

**Stored URL.** Import from URL persists the URL the operator submitted, not redirect targets. Check for updates uses `pack_source_url` on the group. When a downloaded pack declares a different https `source`, the update dialog offers an opt-in checkbox to adopt it for later checks; file import behavior is unchanged.

**UI.** Registry id `import-channels-pack-url` (`online`) opens a URL modal, then reuses `ChannelPackPreviewDialog` and `applyChannelPackImport`. Groups with a usable source URL show **Check for updates** on the Channels tab bar and a muted version / updated line. Compare remote `updated` timestamps only; `version` stays free text.

**Pack identity.** When the remote pack id differs from the group’s stored pack id, check-for-updates stops with a warning and offers **Import as new pack** through the existing resolver. The group is not retargeted silently.

**Apply.** `applyChannelPackImport` accepts optional `sourceUrl`, which wins over `pack.source` when writing `pack_source_url`.

**Dev fixtures.** In development, `fixture:sample-club` fetches `public/fixtures/sample-club.hpack`. Query `packRev` selects newer, older, other-id, or error bodies when the stored URL is that fixture token.

## Consequences

- No `schemaVersion` bump and no new SQLite migration.
- Browser operators may need the desktop app for club hosts without CORS headers.
- Future automatic sync remains out of scope; this ADR covers manual actions only.
