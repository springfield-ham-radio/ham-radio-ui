import {
  createSavedRadio,
  draftFromSavedRadio,
  readSavedRadioStore,
  removeSavedRadio,
  savedRadioDraftHasIssues,
  savedRadioDraftIssues,
  updateSavedRadio,
  upsertSavedRadio,
  writeSavedRadioStore,
  type SavedRadio,
  type SavedRadioDraft,
  type SavedRadioDraftIssues,
} from '~/utils/saved-radios';

/**
 * Radios the operator has added under Preferences → Radios.
 */
export function useSavedRadios() {
  const store = useState('saved-radios', () => readSavedRadioStore());
  const hydrated = useState('saved-radios-hydrated', () => false);

  if (import.meta.client && !hydrated.value) {
    store.value = readSavedRadioStore();
    hydrated.value = true;
  }

  const radios = computed(() => store.value.radios);

  function radioById(id: string | undefined): SavedRadio | undefined {
    if (!id) {
      return undefined;
    }

    return store.value.radios.find((radio) => radio.id === id);
  }

  function persist(next: typeof store.value): void {
    store.value = next;
    writeSavedRadioStore(next);
  }

  function issuesFor(draft: SavedRadioDraft, options: { ignoreId?: string; baudRates?: readonly number[] }): SavedRadioDraftIssues {
    return savedRadioDraftIssues(draft, {
      radios: store.value.radios,
      ignoreId: options.ignoreId,
      baudRates: options.baudRates,
    });
  }

  function addRadio(draft: SavedRadioDraft, baudRates?: readonly number[]): SavedRadio | undefined {
    const issues = issuesFor(draft, { baudRates });

    if (savedRadioDraftHasIssues(issues)) {
      return undefined;
    }

    const radio = createSavedRadio(draft);
    persist(upsertSavedRadio(store.value, radio));
    return radio;
  }

  function saveRadio(id: string, draft: SavedRadioDraft, baudRates?: readonly number[]): SavedRadio | undefined {
    const current = radioById(id);

    if (!current) {
      return undefined;
    }

    const issues = issuesFor(draft, { ignoreId: id, baudRates });

    if (savedRadioDraftHasIssues(issues)) {
      return undefined;
    }

    const radio = updateSavedRadio(current, draft);
    persist(upsertSavedRadio(store.value, radio));
    return radio;
  }

  function deleteRadio(id: string): void {
    persist(removeSavedRadio(store.value, id));
  }

  return {
    radios,
    radioById,
    issuesFor,
    draftFromSavedRadio,
    addRadio,
    saveRadio,
    deleteRadio,
  };
}
