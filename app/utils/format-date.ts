/** Short local calendar date, the same form printed channel cards use: "Oct 17, 2026". */
export function formatShortDate(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Pack `updated` timestamp for the import preview. Unparseable values stay as written. */
export function formatChannelPackUpdated(updated: string): string {
  const date = new Date(updated);

  if (Number.isNaN(date.getTime())) {
    return updated;
  }

  return formatShortDate(date);
}
