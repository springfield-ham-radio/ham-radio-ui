import {
  PREDEFINED_CHANNEL_GROUP_IDS,
  visiblePredefinedChannelGroups,
  type PredefinedChannelGroupId,
} from '~/utils/predefined-channel-groups';
import {
  readPredefinedChannelGroupSettings,
  settingsWithGroupShown,
  writePredefinedChannelGroupSettings,
  type PredefinedChannelGroupSettings,
} from '~/utils/predefined-channel-settings';
import type { ChannelGroup } from '~/utils/channel-groups';

/**
 * Built-in Weather, FRS, and GMRS groups, and which of them the operator has turned on.
 */
export function usePredefinedChannelGroups() {
  const settings = useState<PredefinedChannelGroupSettings>(
    'predefined-channel-group-settings',
    () => readPredefinedChannelGroupSettings(),
  );

  const visibleGroups = computed<ChannelGroup[]>(() => visiblePredefinedChannelGroups(settings.value));

  function setShown(groupId: PredefinedChannelGroupId, shown: boolean): void {
    const next = settingsWithGroupShown(settings.value, groupId, shown);
    settings.value = next;
    writePredefinedChannelGroupSettings(next);
  }

  return {
    settings,
    visibleGroups,
    setShown,
    groupIds: PREDEFINED_CHANNEL_GROUP_IDS,
  };
}
