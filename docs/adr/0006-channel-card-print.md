# Channel card print

**Status:** accepted  
**Date:** 2026-10-17  
**Related:** [#62](https://github.com/springfield-ham-radio/ham-radio-ui/issues/62)

## Context

Operators want a paper channel list for a programmed radio or a channel library group. HamBench had no print or PDF output. The UI already defines table columns on the Radio and Channels pages; print should follow those choices where it makes sense.

## Decision

- Add **Print…** on the Radio Channels toolbar, the Channels library toolbar, and **File › Print…** (`CmdOrCtrl+P` in the Tauri shell).
- Build a **print document** in `app/utils/channel-print.ts` (unit tested). Full-page layout uses table columns; **wallet** layout uses three CSS columns on letter paper with a fixed compact field set (RX, offset, tone; library **notes** only on wallet).
- Open a **dedicated print window** (`WebviewWindow` in Tauri, `window.open` in the browser) at `/print/channels`, then call **`window.print()`** so the system dialog handles Save as PDF. Do not use hidden iframes (unreliable on macOS WKWebView).
- Library print defaults to **rows currently shown** in the table, with optional **whole tab** and **selected rows only**. Radio print uses **programmed slots** on the **focused** card only.
- No in-app print preview and no PDF library in v1.

## Consequences

- `CmdOrCtrl+P` is owned by the app menu instead of printing the main webview chrome.
- Tauri capabilities include `core:webview:allow-create-webview-window` and `channel-print-*` window labels.
- If `window.print()` fails in the child window on a platform, a follow-up can add a Rust `webview.print()` fallback for that window only.
