/** Who currently has the serial port open. APRS and CAT must not share one. */
export type SerialSessionKind = 'cat' | 'aprs';

interface SerialPortHold {
  path: string;
  kind: SerialSessionKind;
}

/**
 * Serial ports held by live CAT or APRS sessions.
 *
 * `setLockedPorts` replaces only CAT holds, so an APRS session survives a CAT
 * status refresh. Read and Write may use any port that is not in `lockedPorts`.
 */
export function useCatPortLock() {
  const holds = useState<SerialPortHold[]>('serial-port-holds', () => []);
  const lockedPorts = computed(() => holds.value.map((hold) => hold.path));
  const holdersByPath = computed(() => {
    const holders: Partial<Record<string, SerialSessionKind>> = {};

    for (const hold of holds.value) {
      holders[hold.path] ??= hold.kind;
    }

    return holders;
  });

  function setHolderPorts(kind: SerialSessionKind, paths: string[]): void {
    const kept = holds.value.filter((hold) => hold.kind !== kind);
    const next = [...new Set(paths)].map((path) => ({ path, kind }));
    holds.value = [...kept, ...next];
  }

  function setLockedPorts(paths: string[]): void {
    setHolderPorts('cat', paths);
  }

  function holderFor(path: string): SerialSessionKind | undefined {
    return holdersByPath.value[path];
  }

  return { lockedPorts, holdersByPath, setLockedPorts, setHolderPorts, holderFor };
}
