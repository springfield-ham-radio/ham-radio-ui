# Channel card print

**Status:** accepted  
**Date:** 2026-10-17  
**Related:** [#62](https://github.com/springfield-ham-radio/ham-radio-ui/issues/62)

## Context

Operators want a paper channel list for a programmed radio or a channel library group. HamBench had no print or PDF output. The UI already defines table columns on the Radio and Channels pages; print should follow those choices where it makes sense.

## Decision

- Add **Print…** on the Radio Channels toolbar, the Channels library toolbar, and **File › Print…** (`CmdOrCtrl+P` in the Tauri shell).
- Build a **print document** in `app/utils/channel-print.ts` (unit tested). Full-page layout uses table columns on **letter landscape** with compact locations; **wallet** layout uses three CSS columns on letter portrait with a fixed compact field set (RX, offset, tone; library **notes** only on wallet). The print dialog’s layout control lives in the modal body so the choice is part of the print payload.
- Open one **dedicated print window** labeled `channel-print` (`WebviewWindow` in Tauri, a named `window.open` in the browser) at `/channel-print.html`, then call **`window.print()`** so the system dialog handles Save as PDF. Do not use hidden iframes (unreliable on macOS WKWebView). That file is a static page with a classic script: it does not boot Nuxt, so the print webview never lazy-imports a module against a `/print/channels` document URL (WebKit reports that as `TypeError: Importing a module script failed.` when the response is the SPA HTML shell). Full-page layout is letter landscape; wallet is three columns on letter portrait. `html`/`body` stay `height: auto` and `overflow: visible` so a long list paginates. The payload lives in `localStorage` under one key (a new webview does not share `sessionStorage`) and is removed when printing finishes. A second print closes that window and opens it again with the new card, so windows do not stack. The print window’s capability allows `core:window:allow-close`, `core:webview:allow-print` (macOS routes `window.print()` through Tauri’s print command), and `core:event:allow-emit`. Failures emit to the main window with `window.__TAURI__.event` (injected by `withGlobalTauri`, not a module import).
- Library print defaults to **rows currently shown** in the table, with optional **whole tab** and **selected rows only**. Radio print uses **programmed slots** on the **focused** card only.
- No in-app print preview and no PDF library in v1.

## Consequences

- `CmdOrCtrl+P` is owned by the app menu instead of printing the main webview chrome.
- Tauri capabilities include `core:webview:allow-create-webview-window` and `channel-print-*` window labels.
- If `window.print()` fails in the child window on a platform, a follow-up can add a Rust `webview.print()` fallback for that window only.
