// @vitest-environment happy-dom
import { computed, readonly, ref, watch } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStationAntennas } from '../../app/composables/useStationAntennas.ts';
import { useSavedRadios } from '../../app/composables/useSavedRadios.ts';
import {
  addAntennaToStore,
  createStationAntenna,
  defaultStationAntennaStore,
  HOME_STATION_ID,
  stationAntennaIdsUsedByRadio,
} from '../../app/utils/antenna-station.ts';
import { emptyLicenseDirectory, readLicenseDirectory, writeLicenseDirectory } from '../../app/utils/license-people.ts';
import type { SavedRadioDraft } from '../../app/utils/saved-radios.ts';

const stateStore = new Map<string, ReturnType<typeof ref>>();
let watchInstallCount = 0;

function installTestState(): void {
  stateStore.clear();
  watchInstallCount = 0;
  vi.stubGlobal('useState', (key: string, init?: () => unknown) => {
    if (!stateStore.has(key)) {
      stateStore.set(key, ref(typeof init === 'function' ? init() : undefined));
    }

    return stateStore.get(key)!;
  });
  vi.stubGlobal('computed', computed);
  vi.stubGlobal('readonly', readonly);
  vi.stubGlobal('watch', (...args: Parameters<typeof watch>) => {
    watchInstallCount += 1;
    return watch(...args);
  });
  vi.stubGlobal('useSavedRadios', useSavedRadios);
  vi.stubGlobal('import.meta', { client: true });
}

function sampleDraft() {
  return {
    nickname: 'Yagi',
    typeId: 'yagi-3el' as const,
    heightAglM: 15,
    headingDeg: 45,
    bands: ['20m', '15m', '10m'] as const,
    stationId: HOME_STATION_ID,
  };
}

describe('radio station antenna picker', () => {
  beforeEach(() => {
    installTestState();
    localStorage.clear();
    writeLicenseDirectory(emptyLicenseDirectory());
    const antenna = createStationAntenna(sampleDraft(), { id: 'ant-home', now: 1 });
    const store = addAntennaToStore(defaultStationAntennaStore(), antenna);
    stateStore.set('station-antenna-store', ref(store));
    stateStore.set('station-antenna-store-hydrated', ref(true));
    stateStore.set('station-antenna-source', ref('station'));
    stateStore.set('station-antenna-what-if', ref({ typeId: 'dipole', heightAglM: 10 }));
    stateStore.set('saved-radios', ref({ radios: [] }));
    stateStore.set('saved-radios-hydrated', ref(true));
    stateStore.set('license-directory', ref(readLicenseDirectory()));
    stateStore.set('license-directory-hydrated', ref(true));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const baseDraft: SavedRadioDraft = {
    name: 'Mobile',
    manufacturer: 'Kenwood',
    model: 'kenwood-tm-d710a',
    serialPort: '/dev/ttyUSB0',
    stationId: HOME_STATION_ID,
  };

  it('persists antenna picks without stacking composable watchers', () => {
    vi.stubGlobal('useOperatorLicense', () => ({
      homeGridsquare: ref(undefined),
    }));

    const station = useStationAntennas();
    const watchesAfterSetup = watchInstallCount;

    const { addRadio, saveRadio } = useSavedRadios();
    const created = addRadio(baseDraft);

    expect(created).toBeTruthy();

    for (let index = 0; index < 5; index += 1) {
      station.syncRadioStationAntennas(created!.id, HOME_STATION_ID, []);
      saveRadio(created!.id, { ...baseDraft, name: `Edit ${index}` });
    }

    expect(watchInstallCount).toBe(watchesAfterSetup);
    station.syncRadioStationAntennas(created!.id, HOME_STATION_ID, ['ant-home']);
    expect(stationAntennaIdsUsedByRadio(stateStore.get('station-antenna-store')!.value, created!.id)).toEqual(['ant-home']);
  });
});