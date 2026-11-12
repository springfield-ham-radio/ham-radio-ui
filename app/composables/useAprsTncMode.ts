import type { AprsConnectionMode } from '~/utils/aprs-connection';

/**
 * Mode shown on the shared TNC connection bar.
 *
 * This is session state, shared by the APRS and Packet tabs. It is not written
 * to storage. A radio with a host profile starts on Host. Choosing a mode
 * does not open the port.
 */
export function useAprsTncMode() {
  const requestedModes = useState<Record<string, AprsConnectionMode>>('aprs-tnc-requested-mode', () => ({}));

  function setSelectedMode(cardId: string, mode: AprsConnectionMode): void {
    requestedModes.value = { ...requestedModes.value, [cardId]: mode };
  }

  return { requestedModes, setSelectedMode };
}
