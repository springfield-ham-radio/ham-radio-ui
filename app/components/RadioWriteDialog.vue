<script setup lang="ts">
import type { RadioMemoryMap, RadioProgram } from '@springfield/ham-radio-api';
import { createMemoryMapCodec } from '@springfield/ham-radio-utils';
import { IMPORT_EXPORT_IDS } from '~/importExport/ids';
import { importExportEntry } from '~/importExport/registry';
import { resolveProgrammingBaudRate } from '~/utils/radio-baud-rate';
import { memoryMapFromConfig } from '~/utils/radio-catalog-db';
import { readRadioImageBackupSettings } from '~/utils/radio-image-backup';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';
import { diffRadioPrograms, type WriteReviewDiff } from '~/utils/radio-write-review';
import { savedRadioModelLabel } from '~/utils/saved-radios';

const writeEntry = importExportEntry(IMPORT_EXPORT_IDS.writeToRadio);

const { configurations, writeOpen, writeToRadio, writeTarget, readRadioForWriteReview } = useRadio();
const { transferCardId, clearTransfer, cardById } = useRadioBoard();
const { radioById } = useSavedRadios();
const { lockedPorts } = useCatPortLock();
const toast = useToast();

const saved = computed(() => radioById(transferCardId.value) ?? cardById(transferCardId.value)?.guest);
const config = computed(() => {
  if (!saved.value) {
    return undefined;
  }

  return configurations.value.find((item) => String(item.id.model) === saved.value?.model);
});

const description = computed(() => {
  if (!saved.value) {
    return 'Choose the serial port for this radio.';
  }

  return `Write the loaded memory to ${saved.value.name}. The saved port is selected; pick another if this cable is on a different adapter.`;
});

const backupsEnabled = ref(false);
const reading = ref(false);

const warningDescription = computed(() => {
  const base = "The loaded memory image will overwrite what is currently stored in the radio.";

  if (!backupsEnabled.value) {
    return base;
  }

  return `${base} HamBench saves a backup of the radio's current image first.`;
});

type WriteReviewStatus = 'unavailable' | 'no-baseline' | 'no-codec' | 'decode-error' | 'ready';

interface WriteReviewState {
  status: WriteReviewStatus;
  diff?: WriteReviewDiff;
  beforeImage?: Uint8Array;
  afterImage?: Uint8Array;
}

const review = computed<WriteReviewState>(() => {
  if (!writeOpen.value) {
    return { status: 'unavailable' };
  }

  const target = writeTarget.value;
  const selected = config.value;
  const afterImage = target.memory;

  if (!afterImage || !target.radioId || !selected) {
    return { status: 'unavailable' };
  }

  const memoryMap = target.memoryMap ?? memoryMapFromConfig(selected);

  if (!memoryMap) {
    return {
      status: 'no-codec',
      beforeImage: target.baseline,
      afterImage,
    };
  }

  try {
    const after = decodeImage(afterImage, target.radioId.model, memoryMap);

    if (!after) {
      return { status: 'decode-error', beforeImage: target.baseline, afterImage };
    }

    if (!target.baseline || target.baseline.length === 0) {
      return { status: 'no-baseline', afterImage };
    }

    const before = decodeImage(target.baseline, target.radioId.model, memoryMap);

    if (!before) {
      return { status: 'decode-error', beforeImage: target.baseline, afterImage };
    }

    return {
      status: 'ready',
      diff: diffRadioPrograms(before, after, memoryMap),
      beforeImage: target.baseline,
      afterImage,
    };
  } catch (cause) {
    console.error('Failed to decode memory for write review', cause);
    return { status: 'decode-error', beforeImage: target.baseline, afterImage };
  }
});

function decodeImage(
  image: Uint8Array,
  radioModel: NonNullable<typeof writeTarget.value.radioId>['model'],
  memoryMap: RadioMemoryMap,
): RadioProgram | undefined {
  const selected = config.value;

  if (!selected?.memoryConfig) {
    return undefined;
  }

  const codec = createMemoryMapCodec({
    radioModel,
    memoryMap,
    memoryConfig: selected.memoryConfig,
  });

  return codec.decode({
    radioModel,
    contents: image,
  });
}

watch(writeOpen, (open) => {
  if (open) {
    backupsEnabled.value = readRadioImageBackupSettings().enabled && isTauriRuntime();
  }

  if (!open) {
    reading.value = false;
    clearTransfer();
  }
});

async function readForReview(serialPortPath: string): Promise<void> {
  const radio = saved.value;
  const selected = config.value;

  if (!radio || !selected) {
    return;
  }

  reading.value = true;

  try {
    await readRadioForWriteReview(serialPortPath, resolveProgrammingBaudRate(selected.serialConfig, radio.baudRate));
  } finally {
    reading.value = false;
  }
}

async function writeRadio(serialPortPath: string): Promise<void> {
  const radio = saved.value;
  const selected = config.value;

  if (!radio || !selected) {
    toast.add({
      title: 'Driver not installed',
      description: radio
        ? `Install the ${savedRadioModelLabel(radio, configurations.value)} driver under Preferences → Drivers.`
        : 'Open a radio card before writing.',
      color: 'warning',
      icon: 'i-lucide-triangle-alert',
    });
    return;
  }

  await writeToRadio(serialPortPath, resolveProgrammingBaudRate(selected.serialConfig, radio.baudRate));
}
</script>

<template>
  <RadioPortDialog
    v-model:open="writeOpen"
    title="Write to Radio"
    :description="description"
    confirm-label="Write"
    confirm-color="warning"
    :confirm-icon="writeEntry.icon"
    :confirm-loading="reading"
    warning-title="This replaces the radio's memory"
    :warning-description="warningDescription"
    :default-port="saved?.serialPort"
    :unavailable-ports="lockedPorts"
    panel-class="max-w-3xl"
    @confirm="writeRadio"
  >
    <template #review="{ selectedPort }">
      <RadioWriteReview
        v-if="review.status !== 'unavailable'"
        :status="review.status"
        :diff="review.diff"
        :before-image="review.beforeImage"
        :after-image="review.afterImage"
        :can-read="Boolean(selectedPort)"
        :reading="reading"
        @read="selectedPort && readForReview(selectedPort)"
      />
    </template>
  </RadioPortDialog>
</template>
