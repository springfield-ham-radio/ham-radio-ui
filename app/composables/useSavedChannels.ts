import { invoke } from '@tauri-apps/api/core';
import type { RadioChannel, RadioChannelId } from '@springfield/ham-radio-api';
import { ALL_CHANNELS_TAB_ID, channelsInGroup, type ChannelGroup, type ChannelGroupMembership } from '~/utils/channel-groups';
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
import { fillRepeaterBookUseAndOnAir } from '~/utils/repeaterbook-listings';
import { importedRepeaterNotes, importedRepeaterToRadioChannel, parseRepeaterImportCsv } from '~/utils/repeater-import';
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
import { parseSavedChannelsCsv, serializeSavedChannelsCsv } from '~/utils/saved-channels-csv';
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
    repeater?: { use?: SavedChannel['use']; onAir?: SavedChannel['onAir']; callsign?: string },
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

  async function exportLibraryCsv(): Promise<void> {
    try {
      const exporting = scopedChannels.value;

      if (activeGroup.value && exporting.length === 0) {
        toast.add({
          title: 'Nothing to export',
          description: `${activeGroup.value.name} has no channels.`,
          color: 'warning',
          icon: 'i-lucide-file-down',
        });
        return;
      }

      const csv = serializeSavedChannelsCsv(exporting);
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

  async function importLibraryCsv(): Promise<number> {
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
      const text = await readChannelLibraryCsvWithPicker();

      if (text === undefined) {
        return 0;
      }

      const parsed = parseSavedChannelsCsv(text);

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
        }),
      );

      if (parsed.source === 'repeaterbook' && isTauriRuntime()) {
        const repeaters = await fillRepeaterBookUseAndOnAir(parseRepeaterImportCsv(text).repeaters, (url) =>
          invoke<string>('fetch_repeaterbook_search', { url }),
        );
        models = repeaters.map((repeater) =>
          radioChannelToSavedChannel(importedRepeaterToRadioChannel(repeater), {
            notes: importedRepeaterNotes(repeater),
            kind: 'repeater',
            use: repeater.use,
            onAir: repeater.onAir,
            callsign: repeater.callsign || undefined,
          }),
        );
      }

      const existing = new Map(channels.value.map((channel) => [libraryImportKey(channel), channel]));
      const toInsert: SavedChannel[] = [];
      const memberIds: RadioChannelId[] = [];
      let updated = 0;

      for (const model of models) {
        const match = existing.get(libraryImportKey(model));

        if (!match) {
          toInsert.push(model);
          existing.set(libraryImportKey(model), model);
          memberIds.push(model.id);
          continue;
        }

        memberIds.push(match.id);
        const nextUse = model.use ?? match.use;
        const nextOnAir = model.onAir ?? match.onAir;
        const nextNotes = model.notes ?? match.notes;
        const nextCallsign = model.callsign ?? match.callsign;
        const callsignWasName =
          Boolean(model.callsign) &&
          !match.callsign &&
          match.name?.trim().toLowerCase() === model.callsign?.trim().toLowerCase();
        const nextName = callsignWasName ? undefined : match.name;

        if (nextUse === match.use && nextOnAir === match.onAir && nextNotes === match.notes && nextCallsign === match.callsign && nextName === match.name) {
          continue;
        }

        if (toInsert.some((row) => row.id === match.id)) {
          continue;
        }

        await updateSavedChannel({
          ...match,
          name: nextName,
          use: nextUse,
          onAir: nextOnAir,
          notes: nextNotes,
          callsign: nextCallsign,
        });
        updated += 1;
      }

      await insertSavedChannelModels(toInsert);

      if (activeGroup.value && !activeGroup.value.builtin) {
        await addChannelsToGroup(activeGroup.value.id, memberIds);
      }

      await reloadLibrary();
      const added = toInsert.length;
      const sourceLabel =
        parsed.source === 'repeaterbook'
          ? 'RepeaterBook CSV'
          : parsed.source === 'chirp'
            ? 'CHIRP CSV'
            : 'CSV';
      const destination = activeGroup.value ? activeGroup.value.name : 'the library';
      const summary = [
        added === 1 ? '1 new' : `${added} new`,
        updated === 1 ? '1 updated' : `${updated} updated`,
      ].join(', ');
      toast.add({
        title: parsed.source === 'library' ? 'Library imported' : 'Repeaters imported',
        description: `${summary} from ${sourceLabel} in ${destination}.`,
        color: 'success',
        icon: 'i-lucide-file-up',
      });
      return added;
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

  async function createGroup(name: string, channelIds: readonly RadioChannelId[]): Promise<ChannelGroup> {
    try {
      if (channelIds.some((id) => isPredefinedChannelId(id))) {
        throw new Error('Built-in channels are already in a group');
      }

      const group = await insertChannelGroup(name, channelIds);
      await reloadLibrary();
      activeGroupId.value = group.id;
      toast.add({
        title: 'Group created',
        description:
          channelIds.length === 0
            ? `${group.name} is empty. Import a CSV to add channels.`
            : channelIds.length === 1
              ? `${group.name} contains 1 channel.`
              : `${group.name} contains ${channelIds.length} channels.`,
        color: 'success',
        icon: 'i-lucide-folder-plus',
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
    importLibraryCsv,
    createGroup,
    renameGroup,
    removeGroup,
  };
}

function libraryImportKey(channel: Pick<SavedChannel, 'name' | 'kind' | 'callsign' | 'transmitFrequency' | 'receiveFrequency'>): string {
  const label = (channel.callsign || channel.name || '').trim().toLowerCase();
  return `${channel.kind}|${label}|${channel.transmitFrequency}|${channel.receiveFrequency}`;
}
