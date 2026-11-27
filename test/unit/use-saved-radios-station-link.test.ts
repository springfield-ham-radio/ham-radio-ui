// @vitest-environment happy-dom
import { computed, readonly, ref, watch } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as savedRadiosUtils from '../../app/utils/saved-radios.ts';
import * as stationAntennasComposable from '../../app/composables/useStationAntennas.ts';
import { useOperatorLicense } from '../../app/composables/useOperatorLicense.ts';
import { useSavedRadios } from '../../app/composables/useSavedRadios.ts';
import { defaultStationAntennaStore, HOME_STATION_ID } from '../../app/utils/antenna-station.ts';
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

describe('useSavedRadios station link', () => {
  beforeEach(() => {
    installTestState();
    localStorage.clear();
    writeLicenseDirectory(emptyLicenseDirectory());
    stateStore.set('station-antenna-store', ref(defaultStationAntennaStore()));
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

  it('resolves station ids from shared state without calling useStationAntennas', () => {
    const stationSpy = vi.spyOn(stationAntennasComposable, 'useStationAntennas');
    const { addRadio, saveRadio } = useSavedRadios();

    const created = addRadio(baseDraft);
    expect(created?.stationId).toBe(HOME_STATION_ID);

    const updated = saveRadio(created!.id, { ...baseDraft, name: 'Base', stationId: '' });
    expect(updated?.stationId).toBeUndefined();

    addRadio({ ...baseDraft, name: 'HT' });
    saveRadio(created!.id, { ...baseDraft, name: 'Base again' });

    expect(stationSpy).not.toHaveBeenCalled();
  });

  it('does not register extra watchers or privilege writes when adding or saving radios', () => {
    useOperatorLicense();
    const watchesAfterLicense = watchInstallCount;

    const privilegeSpy = vi.spyOn(savedRadiosUtils, 'applyRadioPrivilege');

    const { addRadio, saveRadio } = useSavedRadios();

    const radio = addRadio(baseDraft);
    expect(radio).toBeTruthy();

    addRadio({ ...baseDraft, name: 'Second' });

    for (let index = 0; index < 4; index += 1) {
      saveRadio(radio!.id, { ...baseDraft, name: `Edit ${index}` });
    }

    expect(watchInstallCount).toBe(watchesAfterLicense);
    expect(privilegeSpy).not.toHaveBeenCalled();
  });
});