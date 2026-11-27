/** @deprecated Legacy View-menu flag; migration only. */
export const LEGACY_DEVELOPER_MODE_STORAGE_KEY = 'ham-radio-developer-mode';

/** @deprecated Legacy Developer tools flag; migration only. */
export const LEGACY_DEVELOPER_TOOLS_STORAGE_KEY = 'ham-radio-developer-tools';

export const DEVELOPER_PANELS_STORAGE_KEY = 'ham-radio-developer-panels';

export interface DeveloperPanels {
  /** Main /driver module editor tab in the app header. */
  driverDevelopment: boolean;
  /** Radio card Driver tab (protocol inspector and menu capture). */
  radioDriver: boolean;
  radioHex: boolean;
  radioDebug: boolean;
  radioSniffer: boolean;
  /** APRS sub-tab: serial reply, counters, and decoded lines. */
  aprsRawLog: boolean;
}

export type DeveloperPanelKey = keyof DeveloperPanels;

/** Fresh installs and corrupt stored values keep every panel off. */
export function defaultDeveloperPanels(): DeveloperPanels {
  return {
    driverDevelopment: false,
    radioDriver: false,
    radioHex: false,
    radioDebug: false,
    radioSniffer: false,
    aprsRawLog: false,
  };
}

/** Only an explicit JSON true turns a panel on. */
export function parseDeveloperPanelFlag(value: unknown): boolean {
  return value === true;
}

export function parseDeveloperPanels(raw: string | null): DeveloperPanels {
  const defaults = defaultDeveloperPanels();

  if (!raw) {
    return defaults;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return defaults;
    }

    const record = parsed as Record<string, unknown>;

    return {
      driverDevelopment: parseDeveloperPanelFlag(record.driverDevelopment),
      radioDriver: parseDeveloperPanelFlag(record.radioDriver),
      radioHex: parseDeveloperPanelFlag(record.radioHex),
      radioDebug: parseDeveloperPanelFlag(record.radioDebug),
      radioSniffer: parseDeveloperPanelFlag(record.radioSniffer),
      aprsRawLog: parseDeveloperPanelFlag(record.aprsRawLog),
    };
  } catch {
    return defaults;
  }
}

export function serializeDeveloperPanels(panels: DeveloperPanels): string {
  return JSON.stringify({
    driverDevelopment: panels.driverDevelopment === true,
    radioDriver: panels.radioDriver === true,
    radioHex: panels.radioHex === true,
    radioDebug: panels.radioDebug === true,
    radioSniffer: panels.radioSniffer === true,
    aprsRawLog: panels.aprsRawLog === true,
  });
}

function legacyDeveloperFlagOn(raw: string | null): boolean {
  return raw === '1';
}

function migrateDeveloperPanelsFromLegacy(): DeveloperPanels {
  if (typeof localStorage === 'undefined') {
    return defaultDeveloperPanels();
  }

  return {
    driverDevelopment: legacyDeveloperFlagOn(localStorage.getItem(LEGACY_DEVELOPER_MODE_STORAGE_KEY)),
    radioDriver: legacyDeveloperFlagOn(localStorage.getItem(LEGACY_DEVELOPER_TOOLS_STORAGE_KEY)),
    radioHex: false,
    radioDebug: false,
    radioSniffer: false,
    aprsRawLog: false,
  };
}

export function readDeveloperPanels(): DeveloperPanels {
  if (!import.meta.client) {
    return defaultDeveloperPanels();
  }

  try {
    const existing = localStorage.getItem(DEVELOPER_PANELS_STORAGE_KEY);

    if (existing !== null) {
      return parseDeveloperPanels(existing);
    }

    const migrated = migrateDeveloperPanelsFromLegacy();
    writeDeveloperPanels(migrated);
    return migrated;
  } catch {
    return defaultDeveloperPanels();
  }
}

export function writeDeveloperPanels(panels: DeveloperPanels): void {
  if (!import.meta.client) {
    return;
  }

  localStorage.setItem(DEVELOPER_PANELS_STORAGE_KEY, serializeDeveloperPanels(panels));
}