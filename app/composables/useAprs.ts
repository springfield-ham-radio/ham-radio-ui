import { aprsConnectBlocked } from '~/utils/cat-memory-transfer';
import { aprsPortMissingMessage } from '~/utils/aprs-d710';
import { openAprsReceivePort } from '~/utils/aprs-serial';
import { isPortMissingError } from '~/utils/serial-port-reconnect';
import {
  aprsHoldPaths,
  createAprsReceiveSession,
  nextAprsPortHolds,
  type AprsReceiveSession,
  type AprsSessionSnapshot,
} from '~/utils/aprs-session';

const sessions = new Map<string, AprsReceiveSession>();

/** Fold a KISS UI payload into the station list. No port is opened and nothing is written. */
export function ingestAprsAx25Ui(cardId: string, payload: Uint8Array): void {
  sessionFor(cardId).ingestAx25Ui(payload);
}

function sessionFor(cardId: string): AprsReceiveSession {
  const existing = sessions.get(cardId);

  if (existing) {
    return existing;
  }

  const created = createAprsReceiveSession();
  sessions.set(cardId, created);
  return created;
}

/**
 * One receive-only APRS session per radio card.
 *
 * The serial port is claimed in the shared hold list so Read, Write, and CAT
 * cannot open it at the same time. Disconnect releases the hold.
 */
export function useAprs() {
  const { lockedPorts, setHolderPorts } = useCatPortLock();
  const cardPorts = useState<Record<string, string>>('aprs-card-ports', () => ({}));
  const hostPorts = useState<Record<string, string>>('aprs-host-card-ports', () => ({}));
  const snapshots = useState<Record<string, AprsSessionSnapshot>>('aprs-snapshots', () => ({}));
  const connecting = useState<Record<string, boolean>>('aprs-connecting', () => ({}));

  function publish(cardId: string): void {
    const session = sessions.get(cardId);

    if (!session) {
      const next = { ...snapshots.value };
      delete next[cardId];
      snapshots.value = next;
      return;
    }

    snapshots.value = { ...snapshots.value, [cardId]: session.snapshot() };
  }

  function syncHolds(next: Record<string, string>): void {
    cardPorts.value = next;
    setHolderPorts('aprs', aprsHoldPaths(next, hostPorts.value));
  }

  function watchCard(cardId: string): void {
    const session = sessionFor(cardId);
    const listener = () => publish(cardId);
    session.subscribe(listener);
    publish(cardId);
    onScopeDispose(() => {
      session.unsubscribe(listener);
    });
  }

  async function connect(cardId: string, path: string, baudRate: number): Promise<void> {
    if (aprsConnectBlocked(lockedPorts.value, path, cardPorts.value[cardId])) {
      const session = sessionFor(cardId);
      await session.disconnect();
      syncHolds(nextAprsPortHolds(cardPorts.value, cardId, undefined));
      snapshots.value = {
        ...snapshots.value,
        [cardId]: {
          ...session.snapshot(),
          error: 'That serial port is already open for CAT or APRS. Disconnect it first.',
        },
      };
      return;
    }

    connecting.value = { ...connecting.value, [cardId]: true };
    const session = sessionFor(cardId);

    try {
      await session.disconnect();
      syncHolds(nextAprsPortHolds(cardPorts.value, cardId, undefined));
      await session.connect(path, async () => {
        try {
          return await openAprsReceivePort(path, baudRate);
        } catch (cause) {
          if (isPortMissingError(cause)) {
            throw new Error(aprsPortMissingMessage(path));
          }

          throw cause;
        }
      });
      const opened = session.snapshot();

      if (opened.connected) {
        syncHolds(nextAprsPortHolds(cardPorts.value, cardId, path));
      }
    } finally {
      connecting.value = { ...connecting.value, [cardId]: false };
      publish(cardId);
    }
  }

  function receiveText(cardId: string, text: string): void {
    const session = sessionFor(cardId);
    session.receiveText(text);
    publish(cardId);
  }

  function ingestAx25Ui(cardId: string, payload: Uint8Array): void {
    ingestAprsAx25Ui(cardId, payload);
    publish(cardId);
  }

  function unavailable(cardId: string, message: string): void {
    const session = sessionFor(cardId);
    session.unavailable(message);
    publish(cardId);
  }

  async function disconnect(cardId: string): Promise<void> {
    const session = sessions.get(cardId);

    if (!session) {
      syncHolds(nextAprsPortHolds(cardPorts.value, cardId, undefined));
      return;
    }

    await session.disconnect();
    syncHolds(nextAprsPortHolds(cardPorts.value, cardId, undefined));
    publish(cardId);
  }

  function clear(cardId: string): void {
    sessions.get(cardId)?.clear();
    publish(cardId);
  }

  return { snapshots, connecting, cardPorts, lockedPorts, watchCard, connect, unavailable, receiveText, ingestAx25Ui, disconnect, clear };
}
