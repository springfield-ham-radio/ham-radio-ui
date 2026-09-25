<script setup lang="ts">
import { radioCardIdKey } from '~/composables/radio-card-context';
import { serialPortLabel } from '~/utils/serial-port-list';
import { savedRadioModelLabel, type SavedRadio } from '~/utils/saved-radios';

const props = defineProps<{
  radio: SavedRadio;
  focused: boolean;
  fill: boolean;
}>();

const emit = defineEmits<{
  focus: [];
  close: [];
}>();

const cardId = computed(() => props.radio.id);
provide(radioCardIdKey, cardId);

const { configurations } = useRadio();
const driverInstalled = computed(() =>
  configurations.value.some((config) => String(config.id.model) === props.radio.model),
);
const modelLabel = computed(() => savedRadioModelLabel(props.radio, configurations.value));
const detail = computed(() => {
  const parts = [modelLabel.value, serialPortLabel(props.radio.serialPort)];

  if (props.radio.baudRate !== undefined) {
    parts.splice(1, 0, `${props.radio.baudRate} baud`);
  }

  return parts.join(' · ');
});
const cardClass = computed(() => ({
  'ring-primary': props.focused,
  'ring-default': !props.focused,
  'h-full': props.fill,
  'min-h-[36rem]': !props.fill,
}));
</script>

<template>
  <section
    class="flex min-h-0 flex-col overflow-hidden rounded-xl bg-default shadow-sm ring-1"
    :class="cardClass"
    @pointerdown="emit('focus')"
  >
    <header class="flex shrink-0 items-center gap-3 border-b border-default px-3 py-2">
      <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-elevated">
        <UIcon name="i-lucide-radio" class="size-4 text-highlighted" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium text-highlighted">{{ radio.name }}</p>
        <p class="truncate text-xs text-muted">{{ detail }}</p>
      </div>
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        size="xs"
        aria-label="Close radio"
        @click="emit('close')"
      />
    </header>
    <UAlert
      v-if="!driverInstalled"
      class="m-3 mb-0"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Driver not installed"
      :description="`Install the ${modelLabel} driver under Preferences → Drivers.`"
    />
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <RadioWorkspace />
    </div>
  </section>
</template>
