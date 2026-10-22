import type { InstalledRadioListItem } from '~/utils/radio-module-listing';
import {
  installedDriverConfigVersion,
  installedModuleVersion,
  radioDisplayName,
} from '~/utils/radio-module-listing';
import {
  type DriverUpdateDismissals,
  isDriverUpdateDismissed,
} from '~/utils/driver-update-dismissals';

export interface DriverModuleUpdate {
  modelId: string;
  displayName: string;
  installedModuleVersion: string;
  configVersion: string;
  availableVersion: string;
}

export function driverModuleUpdatesFromInstalledItems(
  items: InstalledRadioListItem[],
): DriverModuleUpdate[] {
  return items.flatMap((item) => {
    if (!item.canUpdate || !item.catalogEntry) {
      return [];
    }

    const { record, catalogEntry } = item;

    return [
      {
        modelId: record.modelId,
        displayName: radioDisplayName(record.manufacturer, record.name),
        installedModuleVersion: installedModuleVersion(record),
        configVersion: installedDriverConfigVersion(record),
        availableVersion: catalogEntry.version,
      },
    ];
  });
}

export function filterVisibleDriverModuleUpdates(
  updates: DriverModuleUpdate[],
  dismissals: DriverUpdateDismissals,
): DriverModuleUpdate[] {
  return updates.filter(
    (update) => !isDriverUpdateDismissed(update.modelId, update.availableVersion, dismissals),
  );
}

export function formatDriverModuleUpdateLine(update: DriverModuleUpdate): string {
  return `${update.displayName}: v${update.installedModuleVersion} → v${update.availableVersion} (config v${update.configVersion})`;
}

export function driverModuleUpdateAlertTitle(updates: DriverModuleUpdate[]): string {
  if (updates.length === 1) {
    return 'Driver update available';
  }

  return `${updates.length} driver updates available`;
}

export function driverModuleUpdateAlertDescription(updates: DriverModuleUpdate[]): string {
  if (updates.length === 1) {
    return formatDriverModuleUpdateLine(updates[0]!);
  }

  const preview = updates.slice(0, 3).map(formatDriverModuleUpdateLine).join(' · ');
  const remaining = updates.length - 3;

  if (remaining > 0) {
    return `${preview} · and ${remaining} more`;
  }

  return preview;
}

export const DRIVER_PREFERENCES_PATH = '/preferences?section=drivers';
