import { defaultStationAntennaStore } from '~/utils/antenna-station';
import { adoptLegacyAprsConnection } from '~/utils/aprs-d710';
import {
  clearSavedRadioStationLinks,
  createSavedRadio,
  resolveSavedRadioStationDraft,
  draftFromSavedRadio,
  readSavedRadioStore,
  removeSavedRadio,
  savedRadioDraftHasIssues,
  savedRadioDraftIssues,
  patchSavedRadioAprsBeacon,
  rememberSavedRadioSerialPort,
  rememberSavedRadioAprsCall,
  updateSavedRadio,
  upsertSavedRadio,
  applyRadioPrivilege,
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
  const stationAntennaStore = useState('station-antenna-store', () => defaultStationAntennaStore());

  function knownStationIds(): readonly string[] {
    return stationAntennaStore.value.stations.map((station) => station.id);
  }

  function draftWithResolvedStation(draft: SavedRadioDraft): SavedRadioDraft {
    if (draft.stationId === undefined) {
      return draft;
    }

    return {
      ...draft,
      stationId: resolveSavedRadioStationDraft(draft.stationId, knownStationIds()),
    };
  }

  if (import.meta.client && !hydrated.value) {
    const read = readSavedRadioStore();
    const adopted = adoptLegacyAprsConnection(read.radios, localStorage);
    store.value = adopted.changed ? { radios: adopted.radios } : read;

    if (adopted.changed) {
      writeSavedRadioStore(store.value);
    }

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

  function issuesFor(
    draft: SavedRadioDraft,
    options: { ignoreId?: string; baudRates?: readonly number[]; aprsBaudRates?: readonly number[] },
  ): SavedRadioDraftIssues {
    return savedRadioDraftIssues(draft, {
      radios: store.value.radios,
      ignoreId: options.ignoreId,
      baudRates: options.baudRates,
      aprsBaudRates: options.aprsBaudRates,
    });
  }

  function addRadio(draft: SavedRadioDraft, baudRates?: readonly number[]): SavedRadio | undefined {
    const issues = issuesFor(draft, { baudRates });

    if (savedRadioDraftHasIssues(issues)) {
      return undefined;
    }

    const resolved = draftWithResolvedStation(draft);
    const radio = createSavedRadio(resolved, Date.now(), crypto.randomUUID(), { knownStationIds: knownStationIds() });
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

    const resolved = draftWithResolvedStation(draft);
    const radio = updateSavedRadio(current, resolved, Date.now(), { knownStationIds: knownStationIds() });
    persist(upsertSavedRadio(store.value, radio));
    return radio;
  }

  function rememberAprsMyCall(id: string | undefined, text: string): void {
    if (!id) {
      return;
    }

    const current = radioById(id);

    if (!current) {
      return;
    }

    const next = rememberSavedRadioAprsCall(current, text);

    if (next === current) {
      return;
    }

    persist(upsertSavedRadio(store.value, next));
  }

  function rememberSavedRadioAprsBeacon(id: string | undefined, beacon: import('~/utils/aprs-beacon').SavedRadioAprsBeacon | undefined): void {
    if (!id) {
      return;
    }

    const current = radioById(id);

    if (!current) {
      return;
    }

    const next = patchSavedRadioAprsBeacon(current, beacon);

    if (next === current) {
      return;
    }

    persist(upsertSavedRadio(store.value, next));
  }

  function rememberSavedRadioPort(id: string | undefined, serialPort: string): void {
    if (!id) {
      return;
    }

    const current = radioById(id);

    if (!current) {
      return;
    }

    const next = rememberSavedRadioSerialPort(current, serialPort);

    if (next === current) {
      return;
    }

    persist(upsertSavedRadio(store.value, next));
  }

  function deleteRadio(id: string): void {
    persist(removeSavedRadio(store.value, id));
  }

  function unlinkRadiosFromStation(stationId: string): void {
    const next = clearSavedRadioStationLinks(store.value, stationId);

    if (next === store.value) {
      return;
    }

    persist(next);
  }

  function assignPrivilege(id: string, choice: { personId: string; licenseId?: string } | undefined): void {
    const current = radioById(id);

    if (!current) {
      return;
    }

    const next = applyRadioPrivilege(current, choice);

    if (next.privilegePersonId === current.privilegePersonId && next.privilegeLicenseId === current.privilegeLicenseId) {
      return;
    }

    persist(upsertSavedRadio(store.value, next));
  }

  return {
    radios,
    radioById,
    issuesFor,
    draftFromSavedRadio,
    addRadio,
    saveRadio,
    rememberSavedRadioPort,
    rememberAprsMyCall,
    rememberSavedRadioAprsBeacon,
    deleteRadio,
    unlinkRadiosFromStation,
    assignPrivilege,
  };
}
