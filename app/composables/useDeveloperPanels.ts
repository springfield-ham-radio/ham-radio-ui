import {
  readDeveloperPanels,
  writeDeveloperPanels,
  type DeveloperPanelKey,
  type DeveloperPanels,
} from '~/utils/developer-panels';

/**
 * Developer panel visibility (Preferences → Developer).
 * Independent toggles; all off by default for new installs.
 */
export function useDeveloperPanels(): {
  panels: Ref<DeveloperPanels>;
  setPanel: (key: DeveloperPanelKey, enabled: boolean) => void;
} {
  const panels = useState<DeveloperPanels>('developer-panels', () => readDeveloperPanels());

  function setPanel(key: DeveloperPanelKey, enabled: boolean): void {
    const next = { ...panels.value, [key]: enabled };
    panels.value = next;
    writeDeveloperPanels(next);
  }

  return { panels, setPanel };
}