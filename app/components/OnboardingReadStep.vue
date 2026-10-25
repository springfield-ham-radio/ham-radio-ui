<script setup lang="ts">
import { onboardingFinishReadPlan, type OnboardingFinishReadRadio } from '~/utils/onboarding';

const props = defineProps<{
  radios: readonly OnboardingFinishReadRadio[];
}>();

const plan = computed(() => onboardingFinishReadPlan(props.radios));
const readOnFinish = ref(false);
const selectedRadioId = ref<string | undefined>();
const touched = ref(false);
const radioItems = computed(() =>
  plan.value.radios.map((radio) => ({ label: `${radio.name} · ${radio.serialPort}`, value: radio.id })),
);

watch(
  plan,
  (next) => {
    if (!next.enabled) {
      readOnFinish.value = false;
      touched.value = false;
      selectedRadioId.value = undefined;
      return;
    }

    if (!touched.value) {
      readOnFinish.value = next.defaultOn;
    }

    if (!next.radios.some((radio) => radio.id === selectedRadioId.value)) {
      selectedRadioId.value = next.radios[0]?.id;
    }
  },
  { immediate: true },
);

function finishRead(): string | undefined {
  if (!readOnFinish.value || !plan.value.enabled) {
    return undefined;
  }

  return selectedRadioId.value ?? plan.value.radios[0]?.id;
}

function onSwitch(value: boolean): void {
  touched.value = true;
  readOnFinish.value = value;
}

defineExpose({ finishRead });
</script>

<template>
  <div class="mt-4 overflow-hidden rounded-xl bg-default p-4 shadow-sm ring-1 ring-default">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <USwitch
        :model-value="readOnFinish"
        label="Read my radio when I finish"
        description="The read saves a backup before any edits."
        :disabled="!plan.enabled"
        @update:model-value="onSwitch"
      />
      <USelectMenu
        v-if="plan.radios.length > 1"
        v-model="selectedRadioId"
        :items="radioItems"
        value-key="value"
        color="neutral"
        :search-input="false"
        class="w-56"
        aria-label="Radio to read"
      />
    </div>
    <p v-if="plan.note" class="mt-3 text-sm text-muted">{{ plan.note }}</p>
  </div>
</template>
