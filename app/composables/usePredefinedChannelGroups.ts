import {
  PREDEFINED_CHANNEL_GROUP_IDS,
  visiblePredefinedChannelGroups,
  type PredefinedChannelGroupId,
} from '~/utils/predefined-channel-groups';
import {
  readPredefinedChannelGroupSettings,
  settingsWithGroupHidden,
  writePredefinedChannelGroupSettings,
  type PredefinedChannelGroupSettings,
} from '~/utils/predefined-channel-settings';
import type { ChannelGroup } from '~/utils/channel-groups';

/**
 * Built-in Weather, FRS, and GMRS groups, and which of them the operator has hidden.
 */
export function usePredefinedChannelGroups() {
  const settings = useState<PredefinedChannelGroupSettings>(
    'predefined-channel-group-settings',
    () => readPredefinedChannelGroupSettings(),
  );

  const visibleGroups = computed<ChannelGroup[]>(() => visiblePredefinedChannelGroups(settings.value));

  function setHidden(groupId: PredefinedChannelGroupId, hidden: boolean): void {
    const next = settingsWithGroupHidden(settings.value, groupId, hidden);
    settings.value = next;
    writePredefinedChannelGroupSettings(next);
  }

  return {
    settings,
    visibleGroups,
    setHidden,
    groupIds: PREDEFINED_CHANNEL_GROUP_IDS,
  };
}
