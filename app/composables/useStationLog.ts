import {
  createStationLogQso,
  deleteStationLogQso,
  insertStationLogQsos,
  listStationLogQsos,
  matchesStationLogSearch,
  updateStationLogQso,
  type StationLogQso,
  type StationLogQsoInput,
} from '~/utils/station-log-db';
import {
  adifInputsToStationLogQsos,
  parseStationLogAdif,
  serializeStationLogAdif,
} from '~/utils/station-log-adif';
import {
  readStationLogAdifWithPicker,
  saveStationLogAdifWithPicker,
} from '~/utils/station-log-adif-io';

export function useStationLog() {
  const toast = useToast();
  const qsos = useState<StationLogQso[]>('station-log-qsos', () => []);
  const isLoading = useState('station-log-loading', () => false);
  const error = useState<string | null>('station-log-error', () => null);
  const search = useState('station-log-search', () => '');

  const filteredQsos = computed(() => {
    return qsos.value.filter((qso) => matchesStationLogSearch(qso, search.value));
  });

  async function refresh(): Promise<void> {
    isLoading.value = true;
    error.value = null;

    try {
      qsos.value = await listStationLogQsos();
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Failed to load station log';
      qsos.value = [];
    } finally {
      isLoading.value = false;
    }
  }

  async function createQso(input: StationLogQsoInput): Promise<StationLogQso> {
    try {
      const [saved] = await insertStationLogQsos([createStationLogQso(input)]);
      qsos.value = await listStationLogQsos();
      toast.add({
        title: 'Contact logged',
        description: 'The QSO was added to the station log.',
        color: 'success',
        icon: 'i-lucide-plus',
      });
      return saved;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to create contact';
      toast.add({
        title: 'Could not log contact',
        description: message,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
      throw cause;
    }
  }

  async function updateQso(qso: StationLogQso): Promise<StationLogQso> {
    try {
      const updated = await updateStationLogQso(qso);
      qsos.value = await listStationLogQsos();
      toast.add({
        title: 'Contact updated',
        description: 'Station log changes were saved.',
        color: 'success',
        icon: 'i-lucide-check',
      });
      return updated;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to update contact';
      toast.add({
        title: 'Could not update contact',
        description: message,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
      throw cause;
    }
  }

  async function removeQso(id: string): Promise<void> {
    try {
      await deleteStationLogQso(id);
      qsos.value = qsos.value.filter((qso) => qso.id !== id);
      toast.add({
        title: 'Contact removed',
        description: 'The QSO was deleted from the station log.',
        color: 'success',
        icon: 'i-lucide-trash-2',
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to delete contact';
      toast.add({
        title: 'Could not delete contact',
        description: message,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
      throw cause;
    }
  }

  async function exportAdif(): Promise<void> {
    try {
      const adi = serializeStationLogAdif(qsos.value);
      const destination = await saveStationLogAdifWithPicker(adi);

      if (!destination) {
        return;
      }

      toast.add({
        title: 'Log exported',
        description:
          qsos.value.length === 1
            ? '1 contact was exported to ADIF.'
            : `${qsos.value.length} contacts were exported to ADIF.`,
        color: 'success',
        icon: 'i-lucide-file-down',
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to export station log';
      toast.add({
        title: 'Could not export log',
        description: message,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
      throw cause;
    }
  }

  async function importAdif(): Promise<number> {
    try {
      const text = await readStationLogAdifWithPicker();

      if (text === undefined) {
        return 0;
      }

      const parsed = parseStationLogAdif(text);

      if (parsed.qsos.length === 0) {
        toast.add({
          title: 'Nothing to import',
          description:
            parsed.skipped > 0
              ? 'The ADIF file had records, but none included CALL and QSO_DATE.'
              : 'The ADIF file did not contain any contacts.',
          color: 'warning',
          icon: 'i-lucide-file-up',
        });
        return 0;
      }

      const models = adifInputsToStationLogQsos(parsed.qsos);
      await insertStationLogQsos(models);
      qsos.value = await listStationLogQsos();

      const skippedNote =
        parsed.skipped > 0
          ? ` ${parsed.skipped} incomplete record${parsed.skipped === 1 ? ' was' : 's were'} skipped.`
          : '';

      toast.add({
        title: 'Log imported',
        description:
          models.length === 1
            ? `1 contact was imported from ADIF.${skippedNote}`
            : `${models.length} contacts were imported from ADIF.${skippedNote}`,
        color: 'success',
        icon: 'i-lucide-file-up',
      });
      return models.length;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to import station log';
      toast.add({
        title: 'Could not import log',
        description: message,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
      throw cause;
    }
  }

  return {
    qsos,
    filteredQsos,
    isLoading,
    error,
    search,
    refresh,
    createQso,
    updateQso,
    removeQso,
    exportAdif,
    importAdif,
  };
}
