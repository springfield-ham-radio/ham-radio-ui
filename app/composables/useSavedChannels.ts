import type { RadioChannel, RadioChannelId } from '@springfield/ham-radio-api';
import {
  deleteSavedChannel,
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
  const isLoading = useState('saved-channels-loading', () => false);
  const error = useState<string | null>('saved-channels-error', () => null);
  const search = useState('saved-channels-search', () => '');

  const filteredChannels = computed(() => {
    return channels.value.filter((channel) => matchesSavedChannelSearch(channel, search.value));
  });

  async function refresh(): Promise<void> {
    isLoading.value = true;
    error.value = null;

    try {
      channels.value = await listSavedChannels();
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Failed to load saved channels';
      channels.value = [];
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

  async function createChannel(radioChannel: RadioChannel, notes?: string): Promise<SavedChannel> {
    try {
      const trimmedNotes = notes?.trim();
      const [saved] = await insertSavedChannelModels([
        radioChannelToSavedChannel(radioChannel, {
          notes: trimmedNotes ? trimmedNotes : undefined,
        }),
      ]);

      channels.value = await listSavedChannels();
      toast.add({
        title: 'Channel created',
        description: 'The channel was added to the library.',
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
      await deleteSavedChannel(id);
      channels.value = channels.value.filter((channel) => channel.id !== id);
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


  async function exportLibraryCsv(): Promise<void> {
    try {
      const csv = serializeSavedChannelsCsv(channels.value);
      const destination = await saveChannelLibraryCsvWithPicker(csv);

      if (!destination) {
        return;
      }

      toast.add({
        title: 'Library exported',
        description:
          channels.value.length === 1
            ? '1 channel was exported to CSV.'
            : `${channels.value.length} channels were exported to CSV.`,
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

      const models = parsed.channels.map((channel, index) =>
        radioChannelToSavedChannel(channel, { notes: parsed.notes[index] }),
      );
      await insertSavedChannelModels(models);
      channels.value = await listSavedChannels();
      toast.add({
        title: 'Library imported',
        description:
          models.length === 1
            ? '1 channel was imported from CSV.'
            : `${models.length} channels were imported from CSV.`,
        color: 'success',
        icon: 'i-lucide-file-up',
      });
      return models.length;
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

  return {
    channels,
    filteredChannels,
    isLoading,
    error,
    search,
    refresh,
    saveChannels,
    createChannel,
    updateChannel,
    removeChannel,
    exportLibraryCsv,
    importLibraryCsv,
  };
}
