import type { StationLogQsoInput } from '~/utils/station-log-db';
import { adifBandFromFrequencyHz } from '~/utils/station-log-db';
import type { CatVfo } from '~/utils/kenwood-cat-session';

/**
 * Prefill a new station-log contact from the live CAT VFO.
 */
export function stationLogDraftFromCatVfo(vfo: CatVfo): Partial<StationLogQsoInput> {
  return {
    frequencyHz: vfo.frequencyHz,
    mode: vfo.mode,
    band: adifBandFromFrequencyHz(vfo.frequencyHz),
  };
}
