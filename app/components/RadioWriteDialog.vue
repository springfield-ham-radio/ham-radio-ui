<script setup lang="ts">
import type { RadioMemoryMap, RadioProgram } from '@springfield/ham-radio-api';
import { createMemoryMapCodec } from '@springfield/ham-radio-utils';
import { IMPORT_EXPORT_IDS } from '~/importExport/ids';
import { importExportEntry } from '~/importExport/registry';
import { resolveProgrammingBaudRate } from '~/utils/radio-baud-rate';
import { memoryMapFromConfig } from '~/utils/radio-catalog-db';
import { readRadioImageBackupSettings } from '~/utils/radio-image-backup';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';
import { isDevFixtureSerialPort } from '~/utils/add-to-radio-dev-fixture';
import { channelSchemaFromSettingsSchema } from '~/utils/channel-validation';
import {
  diffRadioPrograms,
  writeReviewCapabilityFindings,
  type WriteReviewCapabilitySummary,
  type WriteReviewDiff,
} from '~/utils/radio-write-review';
import {
  radioTransferDialogDescription,
  radioTransferDialogTitle,
  resolveRadioTransferTarget,
} from '~/utils/radio-transfer-target';
import { savedRadioModelLabel } from '~/utils/saved-radios';

const writeEntry = importExportEntry(IMPORT_EXPORT_IDS.writeToRadio);

const { configurations, writeOpen, writeToRadio, writeTarget, readRadioForWriteReview, transferInFlight } = useRadio();
const { transferCardId, clearTransfer, cardById } = useRadioBoard();
const { radioById } = useSavedRadios();
const { choiceForRadio, assessmentFor } = useOperatorLicense();
const { lockedPorts } = useCatPortLock();
const toast = useToast();

const validationErrorsAcknowledged = ref(false);

const saved = computed(() =>
  resolveRadioTransferTarget(transferCardId.value, (id) => radioById(id), (id) => cardById(id)),
);
const transferGuest = computed(() => {
  const card = cardById(transferCardId.value);

  return Boolean(card?.guest && !card.savedRadioId);
});
const title = computed(() => radioTransferDialogTitle('write', saved.value?.name));
const config = computed(() => {
  if (!saved.value) {
    return undefined;
  }

  return configurations.value.find((item) => String(item.id.model) === saved.value?.model);
});

const description = computed(() => radioTransferDialogDescription('write', saved.value?.name));

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
  capability?: WriteReviewCapabilitySummary;
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
    const license = assessmentFor(choiceForRadio(saved.value));
    const capability = target.program
      ? writeReviewCapabilityFindings(
          target.program,
          {
            bands: selected.bands,
            channelSchema: channelSchemaFromSettingsSchema(selected.settingsSchema),
          },
          license,
        )
      : undefined;

    return {
      status: 'no-codec',
      capability,
      beforeImage: target.baseline,
      afterImage,
    };
  }

  const validationRadio = {
    bands: selected.bands,
    memoryMap,
    channelSchema: channelSchemaFromSettingsSchema(selected.settingsSchema),
  };
  const license = assessmentFor(choiceForRadio(saved.value));

  try {
    const after = decodeImage(afterImage, target.radioId.model, memoryMap);

    if (!after) {
      return { status: 'decode-error', beforeImage: target.baseline, afterImage };
    }

    const capability = writeReviewCapabilityFindings(after, validationRadio, license);

    if (!target.baseline || target.baseline.length === 0) {
      return { status: 'no-baseline', afterImage, capability };
    }

    const before = decodeImage(target.baseline, target.radioId.model, memoryMap);

    if (!before) {
      return { status: 'decode-error', beforeImage: target.baseline, afterImage, capability };
    }

    return {
      status: 'ready',
      diff: diffRadioPrograms(before, after, memoryMap),
      capability,
      beforeImage: target.baseline,
      afterImage,
    };
  } catch (cause) {
    console.error('Failed to decode memory for write review', cause);
    return { status: 'decode-error', beforeImage: target.baseline, afterImage };
  }
});

const writeConfirmDisabled = computed(
  () => Boolean(review.value.capability?.hasErrors && !validationErrorsAcknowledged.value),
);

const isFixtureRadio = computed(() => isDevFixtureSerialPort(saved.value?.serialPort));
const capabilityImage = computed(() => writeTarget.value.memory);

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
    validationErrorsAcknowledged.value = false;
  }

  if (!open) {
    reading.value = false;
    clearTransfer();
  }
});

watch(capabilityImage, () => {
  if (!writeOpen.value) {
    return;
  }

  validationErrorsAcknowledged.value = false;
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
    :title="title"
    :description="description"
    confirm-label="Write"
    confirm-color="warning"
    :confirm-icon="writeEntry.icon"
    :confirm-loading="reading || transferInFlight"
    :confirm-disabled="writeConfirmDisabled"
    warning-title="This replaces the radio's memory"
    :warning-description="warningDescription"
    :default-port="saved?.serialPort"
    :unavailable-ports="lockedPorts"
    panel-class="max-w-3xl"
    @confirm="writeRadio"
  >
    <template #target>
      <RadioTransferTargetHeader
        :radio="saved"
        :configurations="configurations"
        :guest="transferGuest"
      />
    </template>
    <template #review="{ selectedPort }">
      <RadioWriteReview
        v-if="review.status !== 'unavailable'"
        v-model:errors-acknowledged="validationErrorsAcknowledged"
        :status="review.status"
        :diff="review.diff"
        :capability="review.capability"
        :before-image="review.beforeImage"
        :after-image="review.afterImage"
        :can-read="Boolean(selectedPort) && !isFixtureRadio"
        :reading="reading"
        @read="selectedPort && !isFixtureRadio && readForReview(selectedPort)"
      />
      <p v-if="isFixtureRadio" class="mb-4 text-xs text-muted">
        This fixture radio never writes to hardware. Write only confirms the review.
      </p>
    </template>
  </RadioPortDialog>
</template>
