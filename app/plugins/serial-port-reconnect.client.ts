import { transferCanceledForPort, RADIO_CARD_TRANSFERS_KEY, type RadioTransferMap } from '~/utils/radio-transfer-progress';
import { setSerialPortReconnectHooks, updateReconnectWaitingPorts } from '~/utils/serial-port-reconnect';

export default defineNuxtPlugin(() => {
  const transfers = useState<RadioTransferMap>(RADIO_CARD_TRANSFERS_KEY, () => ({}));
  const waitingPorts = useState<string[]>('serial-port-reconnect-waiting-ports', () => []);

  setSerialPortReconnectHooks({
    shouldAbort: (path) => transferCanceledForPort(transfers.value, path),
    onWaiting: (path, active) => {
      waitingPorts.value = updateReconnectWaitingPorts(waitingPorts.value, path, active);
    },
  });
});
