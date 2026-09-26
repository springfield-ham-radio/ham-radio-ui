<script setup lang="ts">
import type { Radio, RadioModelId, RadioProgressIndicator } from '@springfield/ham-radio-api';
import { ConsoleTransport, LogLayer } from 'loglayer';
import { compareMemoryImages, memoryDiffByteCount } from '~/utils/driver-debug';
import { serialPortSelectItems } from '~/utils/serial-port-list';
import { readSerialPortSettings } from '~/utils/serial-port-settings';
import { releaseSerialPortHold } from '~/utils/serial-idle-hold';

const { compiled } = useDriverDraft();
const toast = useToast();

const kind = shallowRef<'channel' | 'setting'>('setting');
const fieldName = shallowRef('');
const originalValue = shallowRef('');
const nextValue = shallowRef('');
const port = shallowRef<string | undefined>();
const ports = ref<Array<{ label: string; value: string; description?: string }>>([]);
const portError = shallowRef('');
const loadingPorts = shallowRef(false);
const reading = shallowRef<'first' | 'second' | undefined>();
const progress = shallowRef(0);
const progressPercent = computed(() => Math.min(100, Math.max(0, Math.round(progress.value * 100))));
const canceled = shallowRef(false);
const firstImage = shallowRef<Uint8Array | undefined>();
const secondImage = shallowRef<Uint8Array | undefined>();
const readError = shallowRef('');

const kindItems = [
  { label: 'Channel', value: 'channel' },
  { label: 'Setting', value: 'setting' },
];

const canRead = computed(() => {
  return Boolean(port.value) && compiled.value.errorCount === 0 && compiled.value.document.readMemory.length > 0 && !reading.value;
});

const runs = computed(() => {
  if (!firstImage.value || !secondImage.value) {
    return [];
  }

  return compareMemoryImages(firstImage.value, secondImage.value);
});

const changedBytes = computed(() => memoryDiffByteCount(runs.value));

const fieldSummary = computed(() => {
  const name = fieldName.value.trim() || 'this field';
  const kindLabel = kind.value === 'channel' ? 'Channel' : 'Setting';
  const from = originalValue.value.trim() || 'original';
  const to = nextValue.value.trim() || 'new';

  return `${kindLabel} ${name}: ${from} → ${to}`;
});

function imageStatus(image: Uint8Array | undefined, label: string): string {
  return image ? `${label}: ${image.length} bytes` : `${label}: not read`;
}

async function loadPorts(): Promise<void> {
  loadingPorts.value = true;
  portError.value = '';

  try {
    const { SerialPort } = await import('tauri-plugin-serialplugin-api');
    const available = await SerialPort.available_ports();
    const settings = readSerialPortSettings();
    const listed = serialPortSelectItems(Object.keys(available), {
      filterCommonPorts: settings.filterCommonPorts,
      excludedPortNames: settings.excludedPortNames,
      portAliases: settings.portAliases,
    });

    ports.value = listed;

    if (port.value && !listed.some((item) => item.value === port.value)) {
      port.value = undefined;
    }
  } catch (cause) {
    ports.value = [];
    portError.value = cause instanceof Error ? cause.message : 'Could not list serial ports';
  } finally {
    loadingPorts.value = false;
  }
}

function progressIndicator(): RadioProgressIndicator {
  canceled.value = false;
  progress.value = 0;

  return {
    setValue(value: number) {
      progress.value = value;
    },
    get isCanceled() {
      return canceled.value;
    },
    set isCanceled(value: boolean) {
      canceled.value = value;
    },
  };
}

function radioForRead(): Radio {
  const document = compiled.value.document;
  const model = document.id.model as RadioModelId;

  return {
    id: {
      model,
      name: document.id.name,
      manufacturer: document.id.manufacturer,
    },
    version: document.version,
    description: document.description,
    settingsSchema: document.settingsSchema
      ? { ...document.settingsSchema, model }
      : {
          model,
          settingsSchema: { type: 'object', additionalProperties: true },
          channelSchema: {},
        },
    memoryConfig: document.memoryConfig ?? {
      chunkSize: 0,
      addressSize: 0,
      addressEndianness: 'big',
      segments: {},
    },
    serialConfig: document.serialConfig,
    readMemory: document.readMemory,
    writeMemory: document.writeMemory,
    memoryMap: document.memoryMap,
  };
}

async function readClone(which: 'first' | 'second'): Promise<void> {
  const serialPortPath = port.value;

  if (!serialPortPath || reading.value) {
    return;
  }

  reading.value = which;
  readError.value = '';
  const indicator = progressIndicator();

  try {
    await releaseSerialPortHold();
    const { RadioDriver } = await import('@springfield/ham-radio-driver');
    const logger = new LogLayer({
      transport: [new ConsoleTransport({ logger: console, level: 'info' })],
    });
    const driver = new RadioDriver(radioForRead(), logger, undefined, false);
    const image = await driver.readRadio(serialPortPath, indicator);

    if (which === 'first') {
      firstImage.value = image;
    } else {
      secondImage.value = image;
    }

    toast.add({
      title: which === 'first' ? 'First clone read' : 'Second clone read',
      description: `${image.length} bytes`,
      color: 'success',
      icon: 'i-lucide-download',
    });
  } catch (cause) {
    if (indicator.isCanceled || (cause instanceof Error && cause.name === 'CancelledException')) {
      toast.add({
        title: 'Clone canceled',
        color: 'warning',
        icon: 'i-lucide-triangle-alert',
      });
    } else {
      const message = cause instanceof Error ? cause.message : 'Could not read the radio';
      readError.value = message;
      toast.add({
        title: 'Clone failed',
        description: message,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
    }
  } finally {
    reading.value = undefined;
  }
}

function cancelRead(): void {
  canceled.value = true;
}

onMounted(() => {
  void loadPorts();
});
</script>

<template>
  <div class="flex w-full flex-col gap-4">
    <DriverFormSection
      title="Field"
      help="Name the one channel or setting you will change on the radio between the two clones."
    >
      <div class="grid gap-3 sm:grid-cols-2">
        <UFormField label="Kind">
          <USelect v-model="kind" :items="kindItems" value-key="value" class="w-full" />
        </UFormField>
        <UFormField label="Field">
          <UInput v-model="fieldName" class="w-full" placeholder="squelch" />
        </UFormField>
        <UFormField label="Original value">
          <UInput v-model="originalValue" class="w-full font-mono" placeholder="5" />
        </UFormField>
        <UFormField label="New value">
          <UInput v-model="nextValue" class="w-full font-mono" placeholder="9" />
        </UFormField>
      </div>
    </DriverFormSection>

    <DriverFormSection
      title="Clones"
      help="Read the radio, change that field on the radio, then read it again. Both reads use the protocol on the Read tab."
    >
      <div class="flex flex-wrap items-end gap-2">
        <UFormField label="Programming port" class="min-w-56 flex-1">
          <USelect
            v-model="port"
            :items="ports"
            value-key="value"
            placeholder="Select a port"
            class="w-full"
            :loading="loadingPorts"
          />
        </UFormField>
        <UButton label="Refresh ports" color="neutral" variant="outline" size="sm" :loading="loadingPorts" @click="loadPorts" />
      </div>
      <p v-if="portError" class="text-sm text-error">{{ portError }}</p>
      <p v-if="compiled.errorCount > 0" class="text-sm text-error">Fix the protocol errors before reading the radio.</p>
      <p v-else-if="compiled.document.readMemory.length === 0" class="text-sm text-muted">Add a read step before cloning.</p>
      <div class="flex flex-wrap gap-2">
        <UButton
          label="Read first clone"
          color="primary"
          size="sm"
          icon="i-lucide-download"
          :loading="reading === 'first'"
          :disabled="!canRead"
          @click="readClone('first')"
        />
        <UButton
          label="Read second clone"
          color="primary"
          variant="outline"
          size="sm"
          icon="i-lucide-download"
          :loading="reading === 'second'"
          :disabled="!canRead"
          @click="readClone('second')"
        />
        <UButton v-if="reading" label="Cancel" color="neutral" variant="ghost" size="sm" @click="cancelRead" />
      </div>
      <p v-if="reading" class="text-sm text-muted">Reading… {{ progressPercent }}%</p>
      <p v-if="readError" class="text-sm text-error">{{ readError }}</p>
      <p class="text-sm text-muted">{{ imageStatus(firstImage, 'First clone') }}</p>
      <p class="text-sm text-muted">{{ imageStatus(secondImage, 'Second clone') }}</p>
    </DriverFormSection>

    <DriverFormSection title="Where it changed" :help="fieldSummary">
      <p v-if="!firstImage || !secondImage" class="text-sm text-muted">
        Both clones are needed before the differing bytes can be listed.
      </p>
      <template v-else>
        <p class="text-sm text-highlighted">{{ fieldSummary }}</p>
        <p v-if="runs.length === 0" class="text-sm text-muted">The two images match. No byte changed.</p>
        <p v-else class="text-sm text-muted">
          {{ changedBytes }} {{ changedBytes === 1 ? 'byte' : 'bytes' }} changed in
          {{ runs.length }} {{ runs.length === 1 ? 'run' : 'runs' }}.
        </p>
        <DriverMemoryHexDiff v-if="firstImage && secondImage && runs.length > 0" :before="firstImage" :after="secondImage" />
      </template>
    </DriverFormSection>
  </div>
</template>
