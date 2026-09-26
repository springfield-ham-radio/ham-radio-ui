<script setup lang="ts">
import { driverFieldError } from '~/utils/driver-compile';
import type { DriverChannelSchemaDraft } from '~/utils/driver-draft';

const { draft, channelSchema, patch } = useDriverDraft();

function errorAt(path: string): string | undefined {
  return driverFieldError(channelSchema.value.issues, path);
}

function patchSchema(partial: Partial<DriverChannelSchemaDraft>): void {
  patch({ channelSchema: { ...draft.value.channelSchema, ...partial } });
}

function setFlag(field: 'includeName' | 'includeReceiveTone' | 'includeTransmitTone', value: boolean | 'indeterminate'): void {
  if (value !== 'indeterminate') {
    patchSchema({ [field]: value });
  }
}

const nameMaxLength = computed({
  get: () => draft.value.channelSchema.nameMaxLength,
  set: (value: string) => patchSchema({ nameMaxLength: value }),
});
const receiveMinimum = computed({
  get: () => draft.value.channelSchema.receiveMinimum,
  set: (value: string) => patchSchema({ receiveMinimum: value }),
});
const receiveMaximum = computed({
  get: () => draft.value.channelSchema.receiveMaximum,
  set: (value: string) => patchSchema({ receiveMaximum: value }),
});
const transmitMinimum = computed({
  get: () => draft.value.channelSchema.transmitMinimum,
  set: (value: string) => patchSchema({ transmitMinimum: value }),
});
const transmitMaximum = computed({
  get: () => draft.value.channelSchema.transmitMaximum,
  set: (value: string) => patchSchema({ transmitMaximum: value }),
});
const ctcssMinimum = computed({
  get: () => draft.value.channelSchema.ctcssMinimum,
  set: (value: string) => patchSchema({ ctcssMinimum: value }),
});
const ctcssMaximum = computed({
  get: () => draft.value.channelSchema.ctcssMaximum,
  set: (value: string) => patchSchema({ ctcssMaximum: value }),
});
const dcsPattern = computed({
  get: () => draft.value.channelSchema.dcsPattern,
  set: (value: string) => patchSchema({ dcsPattern: value }),
});

const tonesIncluded = computed(() => draft.value.channelSchema.includeReceiveTone || draft.value.channelSchema.includeTransmitTone);
</script>

<template>
  <div class="flex w-full flex-col gap-4">
    <DriverFormSection title="Name" help="Optional label stored with the channel. Leave it out when the radio has no name field.">
      <div class="flex items-center gap-1">
        <UCheckbox
          :model-value="draft.channelSchema.includeName"
          label="Include channel name"
          @update:model-value="setFlag('includeName', $event)"
        />
      </div>
      <UFormField v-if="draft.channelSchema.includeName" label="Maximum length" required :error="errorAt('channel.nameMaxLength')">
        <template #hint>
          <HelpTooltip text="Characters stored for the name. A UV-5R uses 7. A Kenwood handheld uses 16." />
        </template>
        <UInput v-model="nameMaxLength" class="w-full font-mono sm:max-w-xs" inputmode="numeric" />
      </UFormField>
    </DriverFormSection>

    <DriverFormSection title="Receive frequency" help="Hertz. 146520000 is 146.52 MHz.">
      <div class="grid gap-3 sm:grid-cols-2">
        <UFormField label="Minimum" required :error="errorAt('channel.receiveMinimum')">
          <UInput v-model="receiveMinimum" class="w-full font-mono" inputmode="decimal" />
        </UFormField>
        <UFormField label="Maximum" required :error="errorAt('channel.receiveMaximum')">
          <UInput v-model="receiveMaximum" class="w-full font-mono" inputmode="decimal" />
        </UFormField>
      </div>
    </DriverFormSection>

    <DriverFormSection title="Transmit frequency" help="Hertz, same units as the receive frequency.">
      <div class="grid gap-3 sm:grid-cols-2">
        <UFormField label="Minimum" required :error="errorAt('channel.transmitMinimum')">
          <UInput v-model="transmitMinimum" class="w-full font-mono" inputmode="decimal" />
        </UFormField>
        <UFormField label="Maximum" required :error="errorAt('channel.transmitMaximum')">
          <UInput v-model="transmitMaximum" class="w-full font-mono" inputmode="decimal" />
        </UFormField>
      </div>
    </DriverFormSection>

    <DriverFormSection title="Tones" help="CTCSS is a tone frequency. DCS is a code such as D023N.">
      <div class="flex flex-col gap-2">
        <UCheckbox
          :model-value="draft.channelSchema.includeReceiveTone"
          label="Receive tone"
          @update:model-value="setFlag('includeReceiveTone', $event)"
        />
        <UCheckbox
          :model-value="draft.channelSchema.includeTransmitTone"
          label="Transmit tone"
          @update:model-value="setFlag('includeTransmitTone', $event)"
        />
      </div>
      <div v-if="tonesIncluded" class="grid gap-3 sm:grid-cols-2">
        <UFormField label="CTCSS minimum" required :error="errorAt('channel.ctcssMinimum')">
          <template #hint>
            <HelpTooltip text="Lowest CTCSS tone in hertz." />
          </template>
          <UInput v-model="ctcssMinimum" class="w-full font-mono" inputmode="decimal" />
        </UFormField>
        <UFormField label="CTCSS maximum" required :error="errorAt('channel.ctcssMaximum')">
          <UInput v-model="ctcssMaximum" class="w-full font-mono" inputmode="decimal" />
        </UFormField>
        <UFormField class="sm:col-span-2" label="DCS pattern" required :error="errorAt('channel.dcsPattern')">
          <template #hint>
            <HelpTooltip text="Regular expression for a code such as D023N or D023I." />
          </template>
          <UInput v-model="dcsPattern" class="w-full font-mono" spellcheck="false" />
        </UFormField>
      </div>
    </DriverFormSection>
  </div>
</template>
