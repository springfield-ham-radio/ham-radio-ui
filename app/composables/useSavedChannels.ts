import { invoke } from '@tauri-apps/api/core';
import type { RadioChannel, RadioChannelId } from '@springfield/ham-radio-api';
import {
  ALL_CHANNELS_TAB_ID,
  channelsInGroup,
  type ChannelGroup,
  type ChannelGroupKind,
  type ChannelGroupMembership,
} from '~/utils/channel-groups';
import {
  findPredefinedChannel,
  isPredefinedChannelId,
  isPredefinedGroupId,
  predefinedChannelsForGroup,
} from '~/utils/predefined-channel-groups';
import {
  addChannelsToGroup,
  deleteChannelGroup,
  insertChannelGroup,
  listChannelGroupMemberships,
  listChannelGroups,
  renameChannelGroup,
} from '~/utils/channel-groups-db';
import { linkedNodesForKind } from '~/utils/linked-nodes';
import { formatLibraryImportSummary, planLibraryImport } from '~/utils/library-import';
import { fillRepeaterBookUseAndOnAir } from '~/utils/repeaterbook-listings';
import {
  importedRepeaterNotes,
  importedRepeaterToRadioChannel,
  parseRepeaterImportCsv,
  type ParsedRepeater,
} from '~/utils/repeater-import';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';
import {
  deleteSavedChannel,
  deleteSavedChannels,
  insertSavedChannelModels,
  insertSavedChannels,
  listSavedChannels,
  matchesSavedChannelSearch,
  radioChannelToSavedChannel,
  updateSavedChannel,
  type SavedChannel,
} from '~/utils/saved-channels-db';
import { IMPORT_EXPORT_IDS } from '~/importExport/ids';
import { importExportEntry } from '~/importExport/registry';
import type { ImportExportHandlerInput } from '~/importExport/types';
import {
  readChannelLibraryCsvWithPicker,
  saveChannelLibraryCsvWithPicker,
} from '~/utils/saved-channels-csv-io';

export function useSavedChannels() {
  const toast = useToast();
  const channels = useState<SavedChannel[]>('saved-channels', () => []);
  const storedGroups = useState<ChannelGroup[]>('channel-groups', () => []);
  const { visibleGroups: predefinedGroups } = usePredefinedChannelGroups();
  const groups = computed(() => [...predefinedGroups.value, ...storedGroups.value]);
  const memberships = useState<ChannelGroupMembership[]>('channel-group-memberships', () => []);
  const activeGroupId = useState('channel-group-active', () => ALL_CHANNELS_TAB_ID);
  const isLoading = useState('saved-channels-loading', () => false);
  const error = useState<string | null>('saved-channels-error', () => null);
  const search = useState('saved-channels-search', () => '');

  const scopedChannels = computed(() => channelsForGroup(activeGroupId.value));

  const filteredChannels = computed(() => {
    return scopedChannels.value.filter((channel) => matchesSavedChannelSearch(channel, search.value));
  });

  const activeGroup = computed(() => groups.value.find((group) => group.id === activeGroupId.value));

  function channelsForGroup(groupId: string): SavedChannel[] {
    const predefined = predefinedChannelsForGroup(groupId);

    if (predefined) {
      return predefined;
    }

    return channelsInGroup(channels.value, memberships.value, groupId);
  }

  function findLibraryChannel(id: RadioChannelId): SavedChannel | undefined {
    return findPredefinedChannel(id) ?? channels.value.find((channel) => channel.id === id);
  }

  function ensureActiveGroup(): void {
    if (activeGroupId.value === ALL_CHANNELS_TAB_ID) {
      return;
    }

    if (!groups.value.some((group) => group.id === activeGroupId.value)) {
      activeGroupId.value = ALL_CHANNELS_TAB_ID;
    }
  }

  watch(groups, () => {
    ensureActiveGroup();
  });

  async function reloadLibrary(): Promise<void> {
    const [nextChannels, nextGroups, nextMemberships] = await Promise.all([
      listSavedChannels(),
      listChannelGroups(),
      listChannelGroupMemberships(),
    ]);

    channels.value = nextChannels;
    storedGroups.value = nextGroups;
    memberships.value = nextMemberships;
    ensureActiveGroup();
  }

  async function refresh(): Promise<void> {
    isLoading.value = true;
    error.value = null;

    try {
      await reloadLibrary();
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Failed to load saved channels';
      channels.value = [];
      storedGroups.value = [];
      memberships.value = [];

      if (!isPredefinedGroupId(activeGroupId.value) || !groups.value.some((group) => group.id === activeGroupId.value)) {
        activeGroupId.value = ALL_CHANNELS_TAB_ID;
      }
    } finally {
      isLoading.value = false;
    }
  }

  async function saveChannels(radioChannels: RadioChannel[]): Promise<number> {
    if (radioChannels.length === 0) {
      return 0;
    }

    try {
      const saved = await insertSavedChannels(radioChannels);
      channels.value = await listSavedChannels();
      toast.add({
        title: 'Saved to library',
        description:
          saved.length === 1 ? '1 channel was added to the library.' : `${saved.length} channels were added to the library.`,
        color: 'success',
        icon: 'i-lucide-bookmark',
      });
      return saved.length;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to save channels';
      toast.add({
        title: 'Could not save channels',
        description: message,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
      throw cause;
    }
  }

  async function createChannel(
    radioChannel: RadioChannel,
    notes?: string,
    kind?: SavedChannel['kind'],
    repeater?: {
      use?: SavedChannel['use'];
      onAir?: SavedChannel['onAir'];
      callsign?: string;
      allstarNode?: string;
      echolinkNode?: string;
      irlpNode?: string;
      wiresNode?: string;
      allstar?: boolean;
      echolink?: boolean;
      irlp?: boolean;
      wires?: boolean;
      city?: string;
      county?: string;
      state?: string;
      country?: string;
      landmark?: string;
      modes?: string;
    },
  ): Promise<SavedChannel> {
    try {
      const trimmedNotes = notes?.trim();
      const [saved] = await insertSavedChannelModels([
        radioChannelToSavedChannel(radioChannel, {
          notes: trimmedNotes ? trimmedNotes : undefined,
          kind,
          use: repeater?.use,
          onAir: repeater?.onAir,
          callsign: repeater?.callsign,
          allstarNode: repeater?.allstarNode,
          echolinkNode: repeater?.echolinkNode,
          irlpNode: repeater?.irlpNode,
          wiresNode: repeater?.wiresNode,
          allstar: repeater?.allstar,
          echolink: repeater?.echolink,
          irlp: repeater?.irlp,
          wires: repeater?.wires,
          city: repeater?.city,
          county: repeater?.county,
          state: repeater?.state,
          country: repeater?.country,
          landmark: repeater?.landmark,
          modes: repeater?.modes,
        }),
      ]);

      if (!saved) {
        throw new Error('Failed to create channel');
      }

      if (activeGroup.value && !activeGroup.value.builtin) {
        await addChannelsToGroup(activeGroup.value.id, [saved.id]);
      }

      await reloadLibrary();
      const addedToGroup = activeGroup.value && !activeGroup.value.builtin ? activeGroup.value : undefined;
      toast.add({
        title: 'Channel created',
        description: addedToGroup
          ? `The channel was added to ${addedToGroup.name}.`
          : 'The channel was added to the library.',
        color: 'success',
        icon: 'i-lucide-plus',
      });
      return saved;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to create channel';
      toast.add({
        title: 'Could not create channel',
        description: message,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
      throw cause;
    }
  }

  async function updateChannel(channel: SavedChannel): Promise<SavedChannel> {
    try {
      if (isPredefinedChannelId(channel.id)) {
        throw new Error('Built-in channels cannot be changed');
      }

      const updated = await updateSavedChannel(channel);
      channels.value = await listSavedChannels();
      toast.add({
        title: 'Channel updated',
        description: 'Library channel changes were saved.',
        color: 'success',
        icon: 'i-lucide-check',
      });
      return updated;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to update channel';
      toast.add({
        title: 'Could not update channel',
        description: message,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
      throw cause;
    }
  }

  async function removeChannel(id: RadioChannelId): Promise<void> {
    try {
      if (isPredefinedChannelId(id)) {
        throw new Error('Built-in channels cannot be deleted');
      }

      await deleteSavedChannel(id);
      channels.value = channels.value.filter((channel) => channel.id !== id);
      memberships.value = memberships.value.filter((membership) => membership.channelId !== id);
      toast.add({
        title: 'Channel removed',
        description: 'The channel was deleted from the library.',
        color: 'success',
        icon: 'i-lucide-trash-2',
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to delete channel';
      toast.add({
        title: 'Could not delete channel',
        description: message,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
      throw cause;
    }
  }


  async function removeChannels(ids: readonly RadioChannelId[]): Promise<number> {
    const unique = [...new Set(ids)].filter((id) => !isPredefinedChannelId(id));

    if (unique.length === 0) {
      return 0;
    }

    try {
      await deleteSavedChannels(unique);
      const removed = new Set(unique);
      channels.value = channels.value.filter((channel) => !removed.has(channel.id));
      memberships.value = memberships.value.filter((membership) => !removed.has(membership.channelId));
      toast.add({
        title: unique.length === 1 ? 'Channel removed' : 'Channels removed',
        description:
          unique.length === 1
            ? 'The channel was deleted from the library.'
            : `${unique.length} channels were deleted from the library.`,
        color: 'success',
        icon: 'i-lucide-trash-2',
      });
      return unique.length;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to delete channels';
      toast.add({
        title: 'Could not delete channels',
        description: message,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
      throw cause;
    }
  }

  async function exportChirpLibraryCsv(input: ImportExportHandlerInput = {}): Promise<void> {
    try {
      const exporting = input.savedChannels ? [...input.savedChannels] : scopedChannels.value;

      if (!input.savedChannels && activeGroup.value && exporting.length === 0) {
        toast.add({
          title: 'Nothing to export',
          description: `${activeGroup.value.name} has no channels.`,
          color: 'warning',
          icon: 'i-lucide-file-down',
        });
        return;
      }

      const rendered = await importExportEntry(IMPORT_EXPORT_IDS.exportChannelsChirpCsv).handler({
        savedChannels: exporting,
      });
      const csv = rendered.text;

      if (!csv) {
        return;
      }

      const destination = await saveChannelLibraryCsvWithPicker(csv);

      if (!destination) {
        return;
      }

      const scope = activeGroup.value ? activeGroup.value.name : 'the library';
      toast.add({
        title: 'CHIRP CSV exported',
        description:
          exporting.length === 1
            ? `1 channel from ${scope} was exported as CHIRP CSV.`
            : `${exporting.length} channels from ${scope} were exported as CHIRP CSV.`,
        color: 'success',
        icon: 'i-lucide-file-down',
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to export CHIRP CSV';
      toast.add({
        title: 'Could not export CHIRP CSV',
        description: message,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
      throw cause;
    }
  }

  async function exportLibraryCsv(input: ImportExportHandlerInput = {}): Promise<void> {
    try {
      const exporting = input.savedChannels ? [...input.savedChannels] : scopedChannels.value;

      if (!input.savedChannels && activeGroup.value && exporting.length === 0) {
        toast.add({
          title: 'Nothing to export',
          description: `${activeGroup.value.name} has no channels.`,
          color: 'warning',
          icon: 'i-lucide-file-down',
        });
        return;
      }

      const rendered = await importExportEntry(IMPORT_EXPORT_IDS.exportChannelsCsv).handler({
        savedChannels: exporting,
      });
      const csv = rendered.text;

      if (!csv) {
        return;
      }

      const destination = await saveChannelLibraryCsvWithPicker(csv);

      if (!destination) {
        return;
      }

      const scope = activeGroup.value ? activeGroup.value.name : 'the library';
      toast.add({
        title: 'Library exported',
        description:
          exporting.length === 1
            ? `1 channel from ${scope} was exported to CSV.`
            : `${exporting.length} channels from ${scope} were exported to CSV.`,
        color: 'success',
        icon: 'i-lucide-file-down',
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to export channel library';
      toast.add({
        title: 'Could not export library',
        description: message,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
      throw cause;
    }
  }

  async function importLibraryCsv(input: ImportExportHandlerInput = {}): Promise<number> {
    if (isPredefinedGroupId(activeGroupId.value)) {
      toast.add({
        title: 'Built-in group',
        description: 'Import into All or a group you created. Built-in groups cannot be changed.',
        color: 'warning',
        icon: 'i-lucide-folder',
      });
      return 0;
    }

    try {
      const text = input.file?.text ?? (await readChannelLibraryCsvWithPicker());

      if (text === undefined) {
        return 0;
      }

      const rendered = await importExportEntry(IMPORT_EXPORT_IDS.importChannelsCsv).handler({
        file: { text, name: input.file?.name },
      });
      const parsed = rendered.document;

      if (!parsed) {
        return 0;
      }

      if (parsed.channels.length === 0) {
        toast.add({
          title: 'Nothing to import',
          description: 'The CSV file did not contain any channels.',
          color: 'warning',
          icon: 'i-lucide-file-up',
        });
        return 0;
      }

      let models = parsed.channels.map((channel, index) =>
        radioChannelToSavedChannel(channel, {
          notes: parsed.notes[index],
          kind: parsed.kinds[index],
          use: parsed.uses[index],
          onAir: parsed.onAir[index],
          callsign: parsed.callsigns[index],
          latitude: parsed.latitudes[index],
          longitude: parsed.longitudes[index],
          ...linkedNodesForKind(parsed.kinds[index] ?? 'channel', parsed.linkedNodes[index]),
          sourceKey: parsed.sourceKeys[index],
          sourceFormat: parsed.sourceFormats[index],
          city: parsed.cities[index],
          county: parsed.counties[index],
          state: parsed.states[index],
          country: parsed.countries[index],
          landmark: parsed.landmarks[index],
          modes: parsed.modes[index],
          lastUpdate: parsed.lastUpdates[index],
        }),
      );

      if (parsed.source === 'repeaterbook' && isTauriRuntime()) {
        const repeaters = await fillRepeaterBookUseAndOnAir(parseRepeaterImportCsv(text).repeaters, (url) =>
          invoke<string>('fetch_repeaterbook_search', { url }),
        );
        models = repeaters.map((repeater) => savedChannelFromParsedRepeater(repeater));
      }

      const plan = planLibraryImport(channels.value, models, {
        columns: parsed.recordColumns,
        replaceLinkedNodes: parsed.replaceLinkedNodes,
        replaceLinkedPresence: parsed.replaceLinkedPresence,
        importedAt: new Date().toISOString(),
      });

      for (const row of plan.update) {
        await updateSavedChannel(row);
      }

      await insertSavedChannelModels(plan.insert);

      if (activeGroup.value && !activeGroup.value.builtin) {
        await addChannelsToGroup(activeGroup.value.id, plan.memberIds);
      }

      await reloadLibrary();
      const sourceLabel =
        parsed.source === 'repeaterbook'
          ? 'RepeaterBook CSV'
          : parsed.source === 'chirp'
            ? 'CHIRP CSV'
            : 'CSV';
      const destination = activeGroup.value ? activeGroup.value.name : 'the library';
      const description = `${formatLibraryImportSummary(plan.added, plan.updated, plan.unchanged)} from ${sourceLabel} in ${destination}.`;

      toast.add({
        title: parsed.source === 'library' ? 'Library imported' : 'Repeaters imported',
        description,
        color: 'success',
        icon: 'i-lucide-file-up',
      });
      return plan.added;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to import channel library';
      toast.add({
        title: 'Could not import library',
        description: message,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
      throw cause;
    }
  }

  async function createGroup(
    name: string,
    channelIds: readonly RadioChannelId[],
    kind: ChannelGroupKind = 'group',
  ): Promise<ChannelGroup> {
    try {
      if (channelIds.some((id) => isPredefinedChannelId(id))) {
        throw new Error('Built-in channels are already in a group');
      }

      const group = await insertChannelGroup(name, channelIds, kind);
      await reloadLibrary();
      activeGroupId.value = group.id;
      toast.add({
        title: kind === 'trip' ? 'Trip group created' : 'Group created',
        description: groupCreatedDescription(group, channelIds.length),
        color: 'success',
        icon: kind === 'trip' ? 'i-lucide-route' : 'i-lucide-folder-plus',
      });
      return group;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to create group';
      toast.add({
        title: 'Could not create group',
        description: message,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
      throw cause;
    }
  }

  async function renameGroup(id: string, name: string): Promise<ChannelGroup> {
    try {
      if (isPredefinedGroupId(id)) {
        throw new Error('Built-in groups cannot be renamed');
      }

      const group = await renameChannelGroup(id, name);
      await reloadLibrary();
      toast.add({
        title: 'Group renamed',
        description: `The group is now ${group.name}.`,
        color: 'success',
        icon: 'i-lucide-folder-pen',
      });
      return group;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to rename group';
      toast.add({
        title: 'Could not rename group',
        description: message,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
      throw cause;
    }
  }

  async function removeGroup(id: string): Promise<void> {
    const group = storedGroups.value.find((candidate) => candidate.id === id);

    try {
      if (isPredefinedGroupId(id)) {
        throw new Error('Built-in groups cannot be removed');
      }

      await deleteChannelGroup(id);
      storedGroups.value = storedGroups.value.filter((candidate) => candidate.id !== id);
      memberships.value = memberships.value.filter((membership) => membership.groupId !== id);

      if (activeGroupId.value === id) {
        activeGroupId.value = ALL_CHANNELS_TAB_ID;
      }

      toast.add({
        title: 'Group removed',
        description: group
          ? `${group.name} was removed. Its channels are still in All.`
          : 'The group was removed. Its channels are still in All.',
        color: 'success',
        icon: 'i-lucide-folder-minus',
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to remove group';
      toast.add({
        title: 'Could not remove group',
        description: message,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
      throw cause;
    }
  }

  return {
    channels,
    groups,
    memberships,
    activeGroupId,
    activeGroup,
    filteredChannels,
    isLoading,
    error,
    search,
    refresh,
    channelsForGroup,
    findLibraryChannel,
    saveChannels,
    createChannel,
    updateChannel,
    removeChannel,
    removeChannels,
    exportLibraryCsv,
    exportChirpLibraryCsv,
    importLibraryCsv,
    createGroup,
    renameGroup,
    removeGroup,
  };
}

function groupCreatedDescription(group: ChannelGroup, channelCount: number): string {
  if (group.kind === 'trip') {
    return `${group.name} is ready. Import the route CSV you already exported.`;
  }

  if (channelCount === 0) {
    return `${group.name} is empty. Import a CSV to add channels.`;
  }

  if (channelCount === 1) {
    return `${group.name} contains 1 channel.`;
  }

  return `${group.name} contains ${channelCount} channels.`;
}

function savedChannelFromParsedRepeater(repeater: ParsedRepeater): SavedChannel {
  return radioChannelToSavedChannel(importedRepeaterToRadioChannel(repeater), {
    notes: importedRepeaterNotes(repeater),
    kind: 'repeater',
    use: repeater.use,
    onAir: repeater.onAir,
    callsign: repeater.callsign || undefined,
    latitude: repeater.latitude,
    longitude: repeater.longitude,
    allstarNode: repeater.allstarNode,
    echolinkNode: repeater.echolinkNode,
    irlpNode: repeater.irlpNode,
    wiresNode: repeater.wiresNode,
    allstar: repeater.allstar,
    echolink: repeater.echolink,
    irlp: repeater.irlp,
    wires: repeater.wires,
    sourceKey: repeater.sourceKey,
    sourceFormat: repeater.sourceFormat,
    city: repeater.city,
    county: repeater.county,
    state: repeater.state,
    country: repeater.country,
    landmark: repeater.landmark,
    modes: repeater.modes,
    lastUpdate: repeater.lastUpdate,
  });
}
