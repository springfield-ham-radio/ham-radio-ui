/**
 * Opens an external URL in the system default browser.
 *
 * Tauri webviews ignore normal anchor navigation to external sites, so this
 * uses the opener plugin when running inside Tauri and falls back to
 * window.open for plain browser development.
 */
export async function openExternalUrl(url: string): Promise<void> {
  const normalized = url.trim();

  if (!normalized) {
    return;
  }

  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(normalized);
  } catch {
    window.open(normalized, '_blank', 'noopener,noreferrer');
  }
}
