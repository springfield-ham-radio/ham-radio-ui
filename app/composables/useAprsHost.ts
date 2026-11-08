import { aprsConnectBlocked } from '~/utils/cat-memory-transfer';
import { aprsPortMissingMessage } from '~/utils/aprs-d710';
import { createAprsHostSession, type AprsHostMessage, type AprsHostSession, type AprsHostSnapshot } from '~/utils/aprs-host-session';
import { aprsHoldPaths, nextAprsPortHolds } from '~/utils/aprs-session';
import { openAprsHostPort } from '~/utils/aprs-serial';
import type { AprsHostFlowControl } from '~/utils/aprs-serial-options';
import { isPortMissingError } from '~/utils/serial-port-reconnect';

const sessions = new Map<string, AprsHostSession>();

function sessionFor(cardId: string): AprsHostSession {
  const existing = sessions.get(cardId);

  if (existing) {
    return existing;
  }

  const created = createAprsHostSession({ useRetryClock: true });
  sessions.set(cardId, created);
  return created;
}

/**
 * Host KISS listener for one radio card.
 *
 * This is a different session from the menu 604 monitor. It uses the same
 * port hold list, so CAT, memory transfer, and the monitor cannot open the
 * adapter at the same time. Listen does not write. Message frames are written only after Allow transmit and Send.
 */
export function useAprsHost() {
  const { lockedPorts, setHolderPorts } = useCatPortLock();
  const monitorPorts = useState<Record<string, string>>('aprs-card-ports', () => ({}));
  const cardPorts = useState<Record<string, string>>('aprs-host-card-ports', () => ({}));
  const snapshots = useState<Record<string, AprsHostSnapshot>>('aprs-host-snapshots', () => ({}));
  const connecting = useState<Record<string, boolean>>('aprs-host-connecting', () => ({}));

  function publish(cardId: string): void {
    const session = sessions.get(cardId);
    snapshots.value = session ? { ...snapshots.value, [cardId]: session.snapshot() } : snapshots.value;
  }

  function syncHolds(next: Record<string, string>): void {
    cardPorts.value = next;
    setHolderPorts('aprs', aprsHoldPaths(monitorPorts.value, next));
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

  async function connect(cardId: string, path: string, baudRate: number, flowControl: AprsHostFlowControl = 'software'): Promise<void> {
    if (aprsConnectBlocked(lockedPorts.value, path, cardPorts.value[cardId])) {
      const session = sessionFor(cardId);
      session.unavailable('That serial port is already open for CAT, the monitor, or APRS. Disconnect it first.');
      publish(cardId);
      return;
    }

    connecting.value = { ...connecting.value, [cardId]: true };
    const session = sessionFor(cardId);

    try {
      await session.connect(path, async () => {
        try {
          return await openAprsHostPort(path, baudRate, flowControl);
        } catch (cause) {
          if (isPortMissingError(cause)) {
            throw new Error(aprsPortMissingMessage(path));
          }

          throw cause;
        }
      }, { flowControl });

      if (session.snapshot().connected) {
        syncHolds(nextAprsPortHolds(cardPorts.value, cardId, path));
      }
    } finally {
      connecting.value = { ...connecting.value, [cardId]: false };
      publish(cardId);
    }
  }

  function unavailable(cardId: string, message: string): void {
    sessionFor(cardId).unavailable(message);
    publish(cardId);
  }

  async function disconnect(cardId: string): Promise<void> {
    await sessions.get(cardId)?.disconnect();
    syncHolds(nextAprsPortHolds(cardPorts.value, cardId, undefined));
    publish(cardId);
  }

  async function send(
    cardId: string,
    input: { mine: string; to: string; text: string; transmitRequested: boolean },
  ): Promise<AprsHostMessage> {
    const message = await sessionFor(cardId).send(input);
    publish(cardId);
    return message;
  }

  function cancel(cardId: string, key: string): void {
    sessions.get(cardId)?.cancel(key);
    publish(cardId);
  }

  function setIdentity(cardId: string, call: string): string | undefined {
    return sessionFor(cardId).setIdentity(call);
  }

  async function requestCommandPrompt(cardId: string): Promise<string | undefined> {
    const reason = await sessionFor(cardId).requestCommandPrompt();
    publish(cardId);
    return reason;
  }

  function cancelCommand(cardId: string): void {
    sessionFor(cardId).cancelCommand();
    publish(cardId);
  }

  async function enterHostKiss(cardId: string): Promise<string | undefined> {
    const reason = await sessionFor(cardId).enterHostKiss();
    publish(cardId);
    return reason;
  }

  function clearTrace(cardId: string): void {
    sessions.get(cardId)?.clearTrace();
    publish(cardId);
  }

  function setAckOptIn(cardId: string, on: boolean): string | undefined {
    const reason = sessionFor(cardId).setAckOptIn(on);
    publish(cardId);
    return reason;
  }

  return {
    snapshots,
    connecting,
    cardPorts,
    watchCard,
    connect,
    unavailable,
    disconnect,
    send,
    cancel,
    setIdentity,
    setAckOptIn,
    requestCommandPrompt,
    cancelCommand,
    enterHostKiss,
    clearTrace,
  };
}
