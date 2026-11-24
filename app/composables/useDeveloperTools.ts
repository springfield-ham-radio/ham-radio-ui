import { readDeveloperTools, writeDeveloperTools } from '~/utils/developer-tools';

/**
 * App-wide developer tools preference (menu capture on the radio Driver tab).
 * Off by default; independent of View-menu developer mode.
 */
export function useDeveloperTools(): {
  enabled: Ref<boolean>;
  setEnabled: (enabled: boolean) => void;
} {
  const enabled = useState('developer-tools', () => readDeveloperTools());

  function setEnabled(next: boolean): void {
    enabled.value = next;
    writeDeveloperTools(next);
  }

  return { enabled, setEnabled };
}