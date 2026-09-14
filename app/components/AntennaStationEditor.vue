<script setup lang="ts">
import {
  antennaDraftErrors,
  applyAntennaTypeToDraft,
  defaultAntennaDraft,
  draftFromStationAntenna,
  type AntennaDraft,
  type StationAntenna,
} from '~/utils/antenna-station';
import {
  antennaBandSelectItems,
  antennaTypeById,
  antennaTypeSelectItems,
  antennaTypeUsesHeading,
  bandsForEnabledTraps,
  formatTrapSummary,
  isAntennaTypeId,
  trapResonantBands,
  type AntennaBandId,
  type AntennaTypeId,
} from '~/utils/antenna-types';

const props = defineProps<{
  open: boolean;
  antenna?: StationAntenna;
}>();

const emit = defineEmits<{
  'update:open': [open: boolean];
  save: [draft: AntennaDraft];
}>();

const nickname = ref('');
const typeId = ref<AntennaTypeId>('dipole');
const heightText = ref('10');
const headingText = ref('45');
const bands = ref<AntennaBandId[]>([]);
const trapped = ref(false);
const heightError = ref<string | undefined>();
const headingError = ref<string | undefined>();

const typeItems = antennaTypeSelectItems();
const bandItems = antennaBandSelectItems();
const isCreate = computed(() => props.antenna === undefined);
const selectedType = computed(() => antennaTypeById(typeId.value));
const usesHeading = computed(() => {
  const type = selectedType.value;
  return type ? antennaTypeUsesHeading(type) : false;
});
const usesTraps = computed(() => selectedType.value?.supportsTraps === true);
const trapCaption = computed(() =>
  trapped.value && usesTraps.value ? formatTrapSummary(bands.value) : undefined,
);

const title = computed(() => (isCreate.value ? 'Add antenna' : 'Edit antenna'));
const description = computed(() =>
  isCreate.value
    ? 'Generic type plus height and heading. Commercial catalogs can come later.'
    : props.antenna?.nickname || selectedType.value?.label || 'Station antenna',
);

watch(
  () => [props.open, props.antenna?.id] as const,
  () => {
    if (!props.open) {
      return;
    }

    const draft = props.antenna ? draftFromStationAntenna(props.antenna) : defaultAntennaDraft();
    applyDraft(draft);
  },
  { immediate: true },
);

watch(bands, (next) => {
  if (trapped.value && trapResonantBands(next).length === 0) {
    trapped.value = false;
  }
});

function applyDraft(draft: AntennaDraft): void {
  nickname.value = draft.nickname;
  typeId.value = draft.typeId;
  heightText.value = formatNumber(draft.heightAglM);
  headingText.value = draft.headingDeg === undefined ? '' : String(Math.round(draft.headingDeg));
  bands.value = [...draft.bands];
  trapped.value = draft.trapped === true;
  heightError.value = undefined;
  headingError.value = undefined;
}

function onTypeChange(value: string): void {
  if (!isAntennaTypeId(value)) {
    return;
  }

  const draft = applyAntennaTypeToDraft(currentDraft(), value);
  applyDraft({
    ...draft,
    nickname: nickname.value,
  });
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

function currentDraft(): AntennaDraft {
  return {
    nickname: nickname.value,
    typeId: typeId.value,
    heightAglM: Number(heightText.value),
    headingDeg: usesHeading.value ? Number(headingText.value) : undefined,
    bands: [...bands.value],
    trapped: usesTraps.value ? trapped.value : undefined,
  };
}

function onTrappedChange(value: boolean): void {
  if (value) {
    bands.value = bandsForEnabledTraps(bands.value);
    trapped.value = trapResonantBands(bands.value).length > 0;
    return;
  }

  trapped.value = false;
}

function close(): void {
  emit('update:open', false);
}

function save(): void {
  const draft = currentDraft();
  const errors = antennaDraftErrors(draft);
  heightError.value = errors?.heightAglM;
  headingError.value = errors?.headingDeg;

  if (errors) {
    return;
  }

  emit('save', draft);
}
</script>

<template>
  <USlideover
    :open="open"
    :title="title"
    :description="description"
    :ui="{ content: 'max-w-lg' }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div class="space-y-4">
        <UFormField label="Nickname" hint="Optional">
          <UInput v-model="nickname" class="w-full" placeholder="Backyard Yagi" />
        </UFormField>

        <UFormField label="Type" required>
          <USelect
            :model-value="typeId"
            :items="typeItems"
            value-key="value"
            class="w-full"
            @update:model-value="onTypeChange"
          />
        </UFormField>

        <p v-if="selectedType" class="text-xs text-muted">{{ selectedType.description }}</p>

        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Height AGL (m)" :error="heightError" required>
            <UInput v-model="heightText" inputmode="decimal" class="w-full tabular-nums" placeholder="10" />
          </UFormField>

          <UFormField
            v-if="usesHeading"
            label="Heading (°)"
            hint="True"
            :error="headingError"
            :description="selectedType?.pattern === 'directive' ? 'Boom direction of maximum gain.' : 'Broadside of maximum radiation.'"
            required
          >
            <UInput v-model="headingText" inputmode="numeric" class="w-full tabular-nums" placeholder="045" />
          </UFormField>
        </div>

        <UFormField label="Bands" description="HF through 70 cm. Empty uses the type defaults.">
          <USelectMenu
            v-model="bands"
            :items="bandItems"
            value-key="id"
            multiple
            class="w-full"
            :search-input="false"
          />
        </UFormField>

        <UFormField
          v-if="usesTraps"
          label="Traps"
          :hint="trapCaption"
          description="LC traps on the higher bands. Leave off for a fan dipole. One HF band plus traps adds the next-lower band."
        >
          <USwitch :model-value="trapped" @update:model-value="onTrappedChange" />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <UButton color="neutral" variant="outline" label="Cancel" @click="close" />
        <UButton color="primary" :label="isCreate ? 'Add' : 'Save'" @click="save" />
      </div>
    </template>
  </USlideover>
</template>
