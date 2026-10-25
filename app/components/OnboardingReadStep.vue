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
  plan.value.radios.map((radio) => ({
    label: radio.serialPort ? `${radio.name} · ${radio.serialPort}` : radio.name,
    value: radio.id,
    disabled: !radio.ready,
    ...(radio.disabledReason ? { description: radio.disabledReason } : {}),
  })),
);

watch(
  plan,
  (next) => {
    const ready = next.radios.filter((radio) => radio.ready);

    if (ready.length === 0) {
      readOnFinish.value = false;
      touched.value = false;
      selectedRadioId.value = undefined;
      return;
    }

    if (!touched.value) {
      readOnFinish.value = next.defaultOn;
    }

    if (!ready.some((radio) => radio.id === selectedRadioId.value)) {
      selectedRadioId.value = next.selectedId ?? ready[0]?.id;
    }
  },
  { immediate: true },
);

function finishRead(): string | undefined {
  if (!readOnFinish.value || !plan.value.enabled) {
    return undefined;
  }

  const ready = plan.value.radios.filter((radio) => radio.ready);
  const chosen = ready.find((radio) => radio.id === selectedRadioId.value);

  return chosen?.id ?? ready[0]?.id;
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
      <USelect
        v-if="plan.radios.length > 1"
        v-model="selectedRadioId"
        :items="radioItems"
        value-key="value"
        color="neutral"
        class="w-64"
        aria-label="Radio to read"
      />
    </div>
    <p v-if="plan.note" class="mt-3 text-sm text-muted">{{ plan.note }}</p>
  </div>
</template>
