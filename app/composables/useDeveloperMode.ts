import { readDeveloperMode, writeDeveloperMode } from '~/utils/developer-mode';

/**
 * Developer mode shows the Driver page. The native View menu is the toggle;
 * this state mirrors that check item and remembers it between launches.
 */
export function useDeveloperMode(): {
  enabled: Ref<boolean>;
  setEnabled: (enabled: boolean) => void;
} {
  const enabled = useState('developer-mode', () => readDeveloperMode());

  function setEnabled(next: boolean): void {
    enabled.value = next;
    writeDeveloperMode(next);
  }

  return { enabled, setEnabled };
}
