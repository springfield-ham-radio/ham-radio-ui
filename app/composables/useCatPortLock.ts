/**
 * Shared lock so Import / Write refuse the serial port while a CAT session is open.
 */
export function useCatPortLock() {
  const lockedPort = useState<string | undefined>('cat-locked-serial-port', () => undefined);

  return { lockedPort };
}
