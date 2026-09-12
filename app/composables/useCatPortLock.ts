/**
 * Serial ports held by live CAT sessions. Import / Write may use any other port.
 */
export function useCatPortLock() {
  const lockedPorts = useState<string[]>('cat-locked-serial-ports', () => []);

  function setLockedPorts(ports: string[]): void {
    lockedPorts.value = [...ports];
  }

  return { lockedPorts, setLockedPorts };
}
