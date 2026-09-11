/**
 * Extra memory-map fields that must not become table columns.
 *
 * Kenwood stores a numeric `band` code (0=118 MHz, 5=144, 8=400, …) on each
 * channel. That id collides with the core Band column, which shows a name from
 * the amateur band plan (for example "2 Meter"). Duplicate TanStack column ids
 * then display the integer instead of the name.
 */
export const CORE_CHANNEL_TABLE_FIELD_IDS = new Set([
  'band',
  'name',
  'channelNumber',
  'transmit',
  'receive',
  'txTone',
  'rxTone',
  'toneType',
]);

export function extraChannelTableFields<T extends { fieldId: string }>(fields: T[]): T[] {
  return fields.filter((field) => !CORE_CHANNEL_TABLE_FIELD_IDS.has(field.fieldId));
}
