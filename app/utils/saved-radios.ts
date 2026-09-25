export const SAVED_RADIOS_STORAGE_KEY = 'ham-radio-saved-radios';

/**
 * A radio the operator owns, with the cable and speed they usually use.
 *
 * Manufacturer and model point at an installed driver. Baud is stored only when
 * that driver lists more than one programming rate.
 */
export interface SavedRadio {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  baudRate?: number;
  serialPort: string;
  createdAt: number;
  updatedAt: number;
  /** Person whose license is used for channel privilege warnings. */
  privilegePersonId?: string;
  /** Grant to check. Absent when that person holds no license (FRS only). */
  privilegeLicenseId?: string;
}

export interface SavedRadioDraft {
  name: string;
  manufacturer: string;
  model: string;
  baudRate?: number;
  serialPort: string;
}

export interface SavedRadioStore {
  radios: SavedRadio[];
}

export interface SavedRadioDraftIssues {
  name?: string;
  manufacturer?: string;
  model?: string;
  baudRate?: string;
  serialPort?: string;
}

export function emptySavedRadioStore(): SavedRadioStore {
  return { radios: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStoredBaudRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1200 && value <= 115200;
}

/**
 * Parse one saved radio, dropping blank identity fields and invalid baud rates.
 */
export function parseSavedRadio(value: unknown): SavedRadio | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (
    !nonEmpty(value.id) ||
    !nonEmpty(value.name) ||
    !nonEmpty(value.manufacturer) ||
    !nonEmpty(value.model) ||
    !nonEmpty(value.serialPort)
  ) {
    return undefined;
  }

  const createdAt = typeof value.createdAt === 'number' && Number.isFinite(value.createdAt) ? value.createdAt : 0;
  const updatedAt = typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) ? value.updatedAt : createdAt;
  const radio: SavedRadio = {
    id: value.id.trim(),
    name: value.name.trim(),
    manufacturer: value.manufacturer.trim(),
    model: value.model.trim(),
    serialPort: value.serialPort.trim(),
    createdAt,
    updatedAt,
  };

  if (isStoredBaudRate(value.baudRate)) {
    radio.baudRate = value.baudRate;
  }

  if (nonEmpty(value.privilegePersonId)) {
    radio.privilegePersonId = value.privilegePersonId.trim();

    if (nonEmpty(value.privilegeLicenseId)) {
      radio.privilegeLicenseId = value.privilegeLicenseId.trim();
    }
  }

  return radio;
}

/**
 * Parse the saved-radio list from localStorage.
 */
export function parseSavedRadioStore(raw: string | null): SavedRadioStore {
  if (!raw) {
    return emptySavedRadioStore();
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!isRecord(parsed) || !Array.isArray(parsed.radios)) {
      return emptySavedRadioStore();
    }

    const radios: SavedRadio[] = [];
    const seen = new Set<string>();

    for (const entry of parsed.radios) {
      const radio = parseSavedRadio(entry);

      if (!radio || seen.has(radio.id)) {
        continue;
      }

      seen.add(radio.id);
      radios.push(radio);
    }

    return { radios };
  } catch {
    return emptySavedRadioStore();
  }
}

export function serializeSavedRadioStore(store: SavedRadioStore): string {
  return JSON.stringify({
    radios: store.radios.map((radio) => {
      const stored: Record<string, unknown> = {
        id: radio.id,
        name: radio.name,
        manufacturer: radio.manufacturer,
        model: radio.model,
        serialPort: radio.serialPort,
        createdAt: radio.createdAt,
        updatedAt: radio.updatedAt,
      };

      if (radio.baudRate !== undefined) {
        stored.baudRate = radio.baudRate;
      }

      if (radio.privilegePersonId) {
        stored.privilegePersonId = radio.privilegePersonId;

        if (radio.privilegeLicenseId) {
          stored.privilegeLicenseId = radio.privilegeLicenseId;
        }
      }

      return stored;
    }),
  });
}

export function readSavedRadioStore(): SavedRadioStore {
  if (!import.meta.client) {
    return emptySavedRadioStore();
  }

  try {
    return parseSavedRadioStore(localStorage.getItem(SAVED_RADIOS_STORAGE_KEY));
  } catch {
    return emptySavedRadioStore();
  }
}

export function writeSavedRadioStore(store: SavedRadioStore): void {
  if (!import.meta.client) {
    return;
  }

  localStorage.setItem(SAVED_RADIOS_STORAGE_KEY, serializeSavedRadioStore(store));
}

export function savedRadioNameKey(name: string): string {
  return name.trim().toLocaleLowerCase();
}

/**
 * Field errors for the add/edit radio form.
 *
 * `baudRates` is the driver's list. A single rate (or none) means baud is not
 * part of the form. More than one rate requires a listed choice.
 */
export function savedRadioDraftIssues(
  draft: SavedRadioDraft,
  options: {
    radios: readonly SavedRadio[];
    ignoreId?: string;
    baudRates?: readonly number[];
  },
): SavedRadioDraftIssues {
  const issues: SavedRadioDraftIssues = {};
  const name = draft.name.trim();

  if (name.length === 0) {
    issues.name = 'Enter a name';
  } else if (
    options.radios.some(
      (radio) => radio.id !== options.ignoreId && savedRadioNameKey(radio.name) === savedRadioNameKey(name),
    )
  ) {
    issues.name = 'A radio already uses this name';
  }

  if (draft.manufacturer.trim().length === 0) {
    issues.manufacturer = 'Choose a manufacturer';
  }

  if (draft.model.trim().length === 0) {
    issues.model = 'Choose a model';
  }

  const listed = options.baudRates ?? [];

  if (listed.length > 1 && (draft.baudRate === undefined || !listed.includes(draft.baudRate))) {
    issues.baudRate = 'Choose a baud rate';
  }

  if (draft.serialPort.trim().length === 0) {
    issues.serialPort = 'Choose a default serial port';
  }

  return issues;
}

export function savedRadioDraftHasIssues(issues: SavedRadioDraftIssues): boolean {
  return Object.values(issues).some((issue) => issue !== undefined);
}

export function createSavedRadio(draft: SavedRadioDraft, now = Date.now(), id = crypto.randomUUID()): SavedRadio {
  const radio: SavedRadio = {
    id,
    name: draft.name.trim(),
    manufacturer: draft.manufacturer.trim(),
    model: draft.model.trim(),
    serialPort: draft.serialPort.trim(),
    createdAt: now,
    updatedAt: now,
  };

  if (draft.baudRate !== undefined) {
    radio.baudRate = draft.baudRate;
  }

  return radio;
}

export function updateSavedRadio(current: SavedRadio, draft: SavedRadioDraft, now = Date.now()): SavedRadio {
  const next: SavedRadio = {
    ...current,
    name: draft.name.trim(),
    manufacturer: draft.manufacturer.trim(),
    model: draft.model.trim(),
    serialPort: draft.serialPort.trim(),
    updatedAt: now,
  };

  if (draft.baudRate === undefined) {
    delete next.baudRate;
  } else {
    next.baudRate = draft.baudRate;
  }

  return next;
}

export function draftFromSavedRadio(radio: SavedRadio): SavedRadioDraft {
  return {
    name: radio.name,
    manufacturer: radio.manufacturer,
    model: radio.model,
    baudRate: radio.baudRate,
    serialPort: radio.serialPort,
  };
}

/**
 * Display name for a saved radio's model.
 *
 * Installed drivers contribute their catalog name. Otherwise the manufacturer
 * and stored model id are shown together.
 */
export function savedRadioModelLabel(
  radio: Pick<SavedRadio, 'manufacturer' | 'model'>,
  configurations: ReadonlyArray<{ id: { model: string | number; name: string } }>,
): string {
  const installed = configurations.find((config) => String(config.id.model) === radio.model)?.id.name.trim();

  if (installed) {
    return installed;
  }

  return `${radio.manufacturer} ${radio.model}`.trim();
}

/**
 * Insert or replace a radio, keeping the existing order on update.
 */
export function upsertSavedRadio(store: SavedRadioStore, radio: SavedRadio): SavedRadioStore {
  const index = store.radios.findIndex((candidate) => candidate.id === radio.id);

  if (index === -1) {
    return { radios: [...store.radios, radio] };
  }

  const radios = store.radios.slice();
  radios[index] = radio;
  return { radios };
}

export function removeSavedRadio(store: SavedRadioStore, id: string): SavedRadioStore {
  return { radios: store.radios.filter((radio) => radio.id !== id) };
}

/**
 * Set or clear the license used for this radio's channel warnings.
 *
 * Does not change `updatedAt`. A missing license id means the person holds no license.
 */
export function applyRadioPrivilege(
  radio: SavedRadio,
  choice: { personId: string; licenseId?: string } | undefined,
): SavedRadio {
  const next: SavedRadio = { ...radio };
  delete next.privilegePersonId;
  delete next.privilegeLicenseId;

  if (!choice) {
    return next;
  }

  next.privilegePersonId = choice.personId;

  if (choice.licenseId) {
    next.privilegeLicenseId = choice.licenseId;
  }

  return next;
}
