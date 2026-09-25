import {
  addAntennaToStore,
  addStationToStore,
  antennasAtStation,
  applyAntennaTypeToDraft,
  applyLicenseGridToHomeIfEmpty,
  createRadioStation,
  createStationAntenna,
  defaultAntennaDraft,
  defaultAntennaWhatIf,
  defaultStationAntennaStore,
  HOME_STATION_ID,
  parseStationAntennaStore,
  readStationAntennaStore,
  removeAntennaFromStore,
  removeStationFromStore,
  replaceAntennaInStore,
  replaceStationInStore,
  resolveAntennaView,
  selectAntennaInStore,
  selectedRadioStation,
  selectedStationAntenna,
  selectStationInStore,
  serializeStationAntennaStore,
  updateRadioStation,
  updateStationAntenna,
  writeStationAntennaStore,
  type AntennaDraft,
  type AntennaViewSource,
  type AntennaWhatIf,
  type RadioStation,
  type StationAntenna,
  type StationDraft,
} from '~/utils/antenna-station';
import {
  ANTENNA_TYPES,
  antennaIsTrapped,
  antennaTypeById,
  antennaTypeUsesHeading,
  bandsForEnabledTraps,
  type AntennaBandId,
  type AntennaTypeId,
} from '~/utils/antenna-types';

/**
 * Shared stations, owned antennas, and Propagation what-if draft.
 *
 * Sites and antennas persist in localStorage. What-if stays in session state so a
 * scratch Yagi does not land on a station until the operator saves it.
 */
export function useStationAntennas() {
  const store = useState('station-antenna-store', () => defaultStationAntennaStore());
  const source = useState<AntennaViewSource>('station-antenna-source', () => 'station');
  const whatIf = useState<AntennaWhatIf>('station-antenna-what-if', () => defaultAntennaWhatIf());
  const { homeGridsquare } = useOperatorLicense();

  const hydrated = useState('station-antenna-store-hydrated', () => false);

  if (import.meta.client && !hydrated.value) {
    store.value = readStationAntennaStore();
    hydrated.value = true;
  }

  const stations = computed(() => store.value.stations);
  const selectedStationId = computed(() => store.value.selectedStationId);
  const selectedStation = computed(() => selectedRadioStation(store.value));
  const antennas = computed(() => store.value.antennas);
  const stationAntennas = computed(() => antennasAtStation(store.value));
  const selectedId = computed(() => store.value.selectedId);
  const selected = computed(() => selectedStationAntenna(store.value));
  const resolved = computed(() => resolveAntennaView(store.value, source.value, whatIf.value));
  const canRemoveStation = computed(() => store.value.stations.length > 1);

  watch(
    () => homeGridsquare.value,
    (gridsquare) => {
      if (!import.meta.client) {
        return;
      }

      const next = applyLicenseGridToHomeIfEmpty(store.value, gridsquare);

      if (next !== store.value) {
        persist(next);
      }
    },
    { immediate: import.meta.client },
  );

  function persist(next: typeof store.value): void {
    const raw = serializeStationAntennaStore(next);
    const plain = parseStationAntennaStore(raw);
    store.value = plain;
    writeStationAntennaStore(plain);
  }

  function addAntenna(draft: AntennaDraft): StationAntenna {
    const antenna = createStationAntenna({
      ...draft,
      stationId: draft.stationId ?? store.value.selectedStationId ?? HOME_STATION_ID,
    });
    persist(addAntennaToStore(store.value, antenna));
    source.value = 'station';
    return antenna;
  }

  function saveAntenna(id: string, draft: AntennaDraft): StationAntenna | undefined {
    const current = store.value.antennas.find((antenna) => antenna.id === id);

    if (!current) {
      return undefined;
    }

    const updated = updateStationAntenna(current, draft);
    persist(replaceAntennaInStore(store.value, updated));
    return updated;
  }

  function removeAntenna(id: string): void {
    persist(removeAntennaFromStore(store.value, id));
  }

  function selectAntenna(id: string): void {
    persist(selectAntennaInStore(store.value, id));
    source.value = 'station';
  }

  function addStation(draft: StationDraft): RadioStation {
    const station = createRadioStation(draft);
    persist(addStationToStore(store.value, station));
    return station;
  }

  function saveStation(id: string, draft: StationDraft): RadioStation | undefined {
    const current = store.value.stations.find((station) => station.id === id);

    if (!current) {
      return undefined;
    }

    const updated = updateRadioStation(current, draft);
    persist(replaceStationInStore(store.value, updated));
    return updated;
  }

  function removeStation(id: string): void {
    persist(removeStationFromStore(store.value, id));
  }

  function selectStation(id: string): void {
    persist(selectStationInStore(store.value, id));
  }

  function setSource(next: AntennaViewSource): void {
    if (next === 'what-if' && source.value !== 'what-if') {
      whatIf.value = defaultAntennaWhatIf(selected.value);
    }

    source.value = next;
  }

  function setWhatIfType(typeId: AntennaTypeId): void {
    const draft = applyAntennaTypeToDraft(
      {
        nickname: '',
        typeId: whatIf.value.typeId,
        heightAglM: whatIf.value.heightAglM,
        headingDeg: whatIf.value.headingDeg,
        bands: [...(whatIf.value.bands ?? antennaTypeById(whatIf.value.typeId)?.defaultBands ?? [])],
        trapped: whatIf.value.trapped,
      },
      typeId,
    );

    whatIf.value = {
      typeId: draft.typeId,
      heightAglM: draft.heightAglM,
      headingDeg: draft.headingDeg,
      bands: [...draft.bands],
      trapped: draft.trapped,
    };
  }

  function setWhatIfHeight(heightAglM: number): void {
    whatIf.value = {
      ...whatIf.value,
      heightAglM,
    };
  }

  function setWhatIfHeading(headingDeg: number): void {
    whatIf.value = {
      ...whatIf.value,
      headingDeg,
    };
  }

  function setWhatIfBands(bands: AntennaBandId[]): void {
    const type = antennaTypeById(whatIf.value.typeId);
    const next = [...bands];
    const trapped =
      type && whatIf.value.trapped && antennaIsTrapped(type, true, next) ? true : undefined;

    whatIf.value = {
      ...whatIf.value,
      bands: next,
      trapped,
    };
  }

  function setWhatIfTrapped(trapped: boolean): void {
    const type = antennaTypeById(whatIf.value.typeId) ?? ANTENNA_TYPES[0]!;
    const bands = trapped
      ? bandsForEnabledTraps(whatIf.value.bands ?? type.defaultBands)
      : [...(whatIf.value.bands ?? type.defaultBands)];

    whatIf.value = {
      ...whatIf.value,
      bands,
      trapped: trapped && antennaIsTrapped(type, true, bands) ? true : undefined,
    };
  }

  function saveWhatIfToStation(): StationAntenna {
    const type = antennaTypeById(whatIf.value.typeId) ?? ANTENNA_TYPES[0]!;
    const antenna = addAntenna({
      ...defaultAntennaDraft(type.id),
      nickname: `What-if ${type.label}`,
      heightAglM: whatIf.value.heightAglM,
      headingDeg: whatIf.value.headingDeg,
      bands: [...(whatIf.value.bands ?? type.defaultBands)],
      trapped: whatIf.value.trapped,
    });

    source.value = 'station';
    return antenna;
  }

  function typeUsesHeading(typeId: AntennaTypeId = whatIf.value.typeId): boolean {
    const type = antennaTypeById(typeId);
    return type ? antennaTypeUsesHeading(type) : false;
  }

  return {
    stations,
    selectedStationId,
    selectedStation,
    antennas,
    stationAntennas,
    selectedId,
    selected,
    source,
    whatIf,
    resolved,
    canRemoveStation,
    addAntenna,
    saveAntenna,
    removeAntenna,
    selectAntenna,
    addStation,
    saveStation,
    removeStation,
    selectStation,
    setSource,
    setWhatIfType,
    setWhatIfHeight,
    setWhatIfHeading,
    setWhatIfBands,
    setWhatIfTrapped,
    saveWhatIfToStation,
    typeUsesHeading,
  };
}
