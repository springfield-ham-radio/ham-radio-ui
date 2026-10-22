import { setSerialPortReconnectHooks } from '~/utils/serial-port-reconnect';

export default defineNuxtPlugin(() => {
  const waiting = useState('serial-port-reconnect-waiting', () => false);
  const canceled = useState('radio-canceled', () => false);

  setSerialPortReconnectHooks({
    shouldAbort: () => canceled.value,
    onWaiting: (active) => {
      waiting.value = active;
    },
  });
});
