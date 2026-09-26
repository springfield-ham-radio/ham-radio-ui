<script setup lang="ts">
import { driverFieldError, driverIssuesUnder, type DriverIssue } from '~/utils/driver-compile';
import {
  DRIVER_READ_STEP_KINDS,
  DRIVER_STEP_KIND_LABELS,
  DRIVER_WRITE_STEP_KINDS,
  canonicalizeSkipAddress,
  createDriverId,
  type DriverStepDraft,
  type DriverStepKind,
} from '~/utils/driver-draft';

const props = defineProps<{
  step: DriverStepDraft;
  side: 'read' | 'write';
  segmentNames: string[];
  issues: DriverIssue[];
}>();

const emit = defineEmits<{
  'update:step': [step: DriverStepDraft];
}>();

const kindItems = computed(() => {
  const allowed = props.side === 'read' ? DRIVER_READ_STEP_KINDS : DRIVER_WRITE_STEP_KINDS;
  const kinds: DriverStepKind[] = (allowed as readonly DriverStepKind[]).includes(props.step.kind)
    ? [...allowed]
    : [props.step.kind, ...allowed];

  return kinds.map((kind) => ({ label: DRIVER_STEP_KIND_LABELS[kind], value: kind }));
});

const path = computed(() => `${props.side}.${props.step.id}`);

function errorAt(suffix?: string): string | undefined {
  return driverFieldError(props.issues, suffix ? `${path.value}.${suffix}` : path.value);
}

function errorUnder(suffix: string): string | undefined {
  return driverIssuesUnder(props.issues, `${path.value}.${suffix}`).find((issue) => issue.level === 'error')?.message;
}

const stepError = computed(() => errorAt());
const relatedIssues = computed(() => driverIssuesUnder(props.issues, path.value));

function patch(partial: Partial<DriverStepDraft>): void {
  emit('update:step', { ...props.step, ...partial });
}

function onKind(value: unknown): void {
  if (
    value === 'exchange' ||
    value === 'read' ||
    value === 'write' ||
    value === 'catRead' ||
    value === 'catWrite'
  ) {
    patch({ kind: value });
  }
}

function toggleSegment(name: string, checked: boolean | 'indeterminate'): void {
  if (checked === 'indeterminate') {
    return;
  }

  const segments = checked ? [...props.step.segments, name] : props.step.segments.filter((item) => item !== name);
  patch({ segments });
}

function addSkip(): void {
  patch({
    skip: [...props.step.skip, { id: createDriverId(), startAddress: '', endAddress: '' }],
  });
}

function formattedSkipAddress(raw: string): string {
  const text = raw.trim();
  const digits = text.replace(/^0x/i, '');
  const finished =
    /^0x[0-9a-fA-F]+$/i.test(text) ||
    (/[a-fA-F]/.test(digits) && digits.length >= 3) ||
    /^\d{4,}$/.test(text);

  return finished ? canonicalizeSkipAddress(text) : raw;
}

watch(
  () => props.step.skip.map((range) => `${range.id}:${range.startAddress}:${range.endAddress}`).join('|'),
  () => {
    let changed = false;
    const skip = props.step.skip.map((range) => {
      const startAddress = formattedSkipAddress(range.startAddress);
      const endAddress = formattedSkipAddress(range.endAddress);

      if (startAddress !== range.startAddress || endAddress !== range.endAddress) {
        changed = true;
      }

      return { ...range, startAddress, endAddress };
    });

    if (changed) {
      patch({ skip });
    }
  },
  { immediate: true },
);

function updateSkip(id: string, field: 'startAddress' | 'endAddress', value: string): void {
  const current = props.step.skip.find((range) => range.id === id);

  if (!current || current[field] === value) {
    return;
  }

  patch({
    skip: props.step.skip.map((range) => (range.id === id ? { ...range, [field]: value } : range)),
  });
}

function commitSkip(id: string, field: 'startAddress' | 'endAddress', event: FocusEvent): void {
  const target = event.target;
  const value = target instanceof HTMLInputElement ? target.value : '';
  updateSkip(id, field, canonicalizeSkipAddress(value));
}

function removeSkip(id: string): void {
  patch({ skip: props.step.skip.filter((range) => range.id !== id) });
}
</script>

<template>
  <div class="flex w-full flex-col gap-4">
    <UAlert
      v-if="stepError"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="stepError"
    />
    <DriverFormSection title="Step">
      <UFormField label="What this step does">
        <UInput
          :model-value="step.description"
          class="w-full"
          placeholder="Send magic number"
          @update:model-value="patch({ description: String($event ?? '') })"
        />
      </UFormField>
      <UFormField label="Step type" description="The type decides which fields are written into the JSON.">
        <USelect
          :model-value="step.kind"
          :items="kindItems"
          value-key="value"
          class="w-full"
          @update:model-value="onKind"
        />
      </UFormField>
      <UFormField
        v-if="step.kind !== 'catRead' && step.kind !== 'catWrite'"
        label="Timeout (ms)"
        hint="Optional"
        :error="errorAt('timeout')"
      >
        <UInput
          :model-value="step.timeout"
          class="w-full font-mono"
          inputmode="numeric"
          @update:model-value="patch({ timeout: String($event ?? '') })"
        />
      </UFormField>
      <UFormField
        v-if="step.kind === 'read' || step.kind === 'write'"
        label="Segments"
        :error="errorAt('segments')"
        description="Address ranges from the Memory tab."
      >
        <p v-if="segmentNames.length === 0" class="text-sm text-muted">Add a memory segment before choosing one.</p>
        <div v-else class="flex flex-col gap-2">
          <UCheckbox
            v-for="name in segmentNames"
            :key="name"
            :model-value="step.segments.includes(name)"
            :label="name"
            @update:model-value="toggleSegment(name, $event)"
          />
        </div>
      </UFormField>
    </DriverFormSection>

    <template v-if="step.kind === 'catRead' || step.kind === 'catWrite'">
      <div class="grid gap-3 sm:grid-cols-2">
        <UFormField label="Segment" :error="errorAt('catSegment')">
          <USelect
            :model-value="step.catSegment"
            :items="segmentNames.map((name) => ({ label: name, value: name }))"
            value-key="value"
            placeholder="Choose a segment"
            class="w-full"
            @update:model-value="patch({ catSegment: String($event ?? '') })"
          />
        </UFormField>
        <UFormField label="Packer" description="How CAT replies become channel records.">
          <UInput :model-value="step.catPack" class="w-full font-mono" disabled />
        </UFormField>
        <UFormField label="Channel count" :error="errorAt('catCount')">
          <UInput
            :model-value="step.catCount"
            class="w-full font-mono"
            inputmode="numeric"
            @update:model-value="patch({ catCount: String($event ?? '') })"
          />
        </UFormField>
        <UFormField label="Bytes per channel" :error="errorAt('catRecordSize')">
          <UInput
            :model-value="step.catRecordSize"
            class="w-full font-mono"
            inputmode="numeric"
            @update:model-value="patch({ catRecordSize: String($event ?? '') })"
          />
        </UFormField>
        <UFormField label="Index width" hint="Optional" :error="errorAt('catIndexWidth')">
          <UInput
            :model-value="step.catIndexWidth"
            class="w-full font-mono"
            inputmode="numeric"
            @update:model-value="patch({ catIndexWidth: String($event ?? '') })"
          />
        </UFormField>
        <UFormField label="Empty byte" hint="Optional" :error="errorAt('catEmptyByte')">
          <UInput
            :model-value="step.catEmptyByte"
            class="w-full font-mono"
            placeholder="FF"
            @update:model-value="patch({ catEmptyByte: String($event ?? '') })"
          />
        </UFormField>
      </div>
    </template>

    <template v-else>
      <DriverExchangeSection
        title="Computer sends"
        direction="send"
        description="Hex is 00–FF. ASCII is one character. Placeholders fill in the current chunk."
      >
        <DriverTokenField
          :tokens="step.send"
          label="Computer sends"
          hide-label
          :error="errorUnder('send')"
          @update:tokens="patch({ send: $event })"
        />
      </DriverExchangeSection>
      <DriverExchangeSection title="Radio replies" direction="receive">
        <DriverExpectField
          :expect="step.expect"
          label="Radio replies"
          hide-label
          :error="errorUnder('expect')"
          @update:expect="patch({ expect: $event })"
        />
      </DriverExchangeSection>
      <DriverFormSection title="Timing">
        <UFormField label="Delay (ms)" hint="Optional" :error="errorAt('delay')">
          <UInput
            :model-value="step.delay"
            class="w-full font-mono"
            inputmode="numeric"
            @update:model-value="patch({ delay: String($event ?? '') })"
          />
        </UFormField>
        <UFormField v-if="step.kind === 'exchange'" label="Switch baud" hint="Optional" :error="errorAt('setBaudRate')">
          <UInput
            :model-value="step.setBaudRate"
            class="w-full font-mono"
            placeholder="57600"
            inputmode="numeric"
            @update:model-value="patch({ setBaudRate: String($event ?? '') })"
          />
        </UFormField>
        <UFormField v-if="step.kind === 'write'" label="Chunk size override" hint="Optional" :error="errorAt('chunkSize')">
          <UInput
            :model-value="step.chunkSize"
            class="w-full font-mono"
            inputmode="numeric"
            @update:model-value="patch({ chunkSize: String($event ?? '') })"
          />
        </UFormField>
      </DriverFormSection>
    </template>

    <template v-if="step.kind === 'read'">
      <UCheckbox
        :model-value="step.includeAck"
        label="Ack after each chunk"
        description="A second exchange after the radio accepts a block."
        @update:model-value="patch({ includeAck: $event === true })"
      />
      <div v-if="step.includeAck" class="flex flex-col gap-3">
        <DriverExchangeSection title="Ack send" direction="send">
          <DriverTokenField
            :tokens="step.ackSend"
            label="Ack send"
            hide-label
            :error="errorUnder('ack.send')"
            @update:tokens="patch({ ackSend: $event })"
          />
        </DriverExchangeSection>
        <DriverExchangeSection title="Ack reply" direction="receive">
          <DriverExpectField
            :expect="step.ackExpect"
            label="Ack reply"
            hide-label
            :error="errorUnder('ack')"
            @update:expect="patch({ ackExpect: $event })"
          />
        </DriverExchangeSection>
        <UFormField label="Ack timeout (ms)" :error="errorAt('ack.timeout')">
          <UInput
            :model-value="step.ackTimeout"
            class="w-32 font-mono"
            inputmode="numeric"
            @update:model-value="patch({ ackTimeout: String($event ?? '') })"
          />
        </UFormField>
      </div>
      <UCheckbox
        :model-value="step.includeReady"
        label="Ready byte when the ack times out"
        description="Prefix the next reply with this byte if the radio stays silent."
        @update:model-value="patch({ includeReady: $event === true })"
      />
      <DriverTokenField
        v-if="step.includeReady"
        :tokens="[step.ready]"
        label="Ready byte"
        :error="errorAt('ready')"
        fixed
        @update:tokens="patch({ ready: $event[0] ?? step.ready })"
      />
    </template>

    <DriverFormSection v-if="step.kind === 'write'" title="Skip ranges">
      <div class="flex items-center justify-between gap-2">
        <p class="text-xs text-muted">Inclusive addresses, written as 0x0000, that must not be uploaded.</p>
        <UButton label="Add range" color="neutral" variant="outline" size="xs" icon="i-lucide-plus" @click="addSkip" />
      </div>
      <div v-for="range in step.skip" :key="range.id" class="flex flex-wrap items-end gap-2">
        <UFormField label="Start" :error="errorAt(`skip.${range.id}`)">
          <UInput
            :model-value="range.startAddress"
            class="w-36 font-mono"
            placeholder="0x0000"
            spellcheck="false"
            autocapitalize="characters"
            @update:model-value="updateSkip(range.id, 'startAddress', String($event ?? ''))"
            @blur="commitSkip(range.id, 'startAddress', $event)"
          />
        </UFormField>
        <UFormField label="End">
          <UInput
            :model-value="range.endAddress"
            class="w-36 font-mono"
            placeholder="0x0000"
            spellcheck="false"
            autocapitalize="characters"
            @update:model-value="updateSkip(range.id, 'endAddress', String($event ?? ''))"
            @blur="commitSkip(range.id, 'endAddress', $event)"
          />
        </UFormField>
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Remove skip range"
          @click="removeSkip(range.id)"
        />
      </div>
    </DriverFormSection>

    <ul v-if="relatedIssues.length > 0" class="flex flex-col gap-1">
      <li v-for="issue in relatedIssues" :key="`${issue.path}-${issue.message}`" class="text-xs text-muted">
        {{ issue.level === 'warning' ? 'Note: ' : '' }}{{ issue.message }}
      </li>
    </ul>
  </div>
</template>
