<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import type { RadioBoardLayout } from '~/utils/radio-board';
import { savedRadioModelLabel } from '~/utils/saved-radios';

const { radios } = useSavedRadios();
const { configurations, clearCardSession } = useRadio();
const { cards, layout, focusedCardId, hydrate, focusCard, openCard, closeCard, setLayout, cardById } = useRadioBoard();
const { disconnect } = useCat();

watch(
  radios,
  (list) => {
    hydrate(list.map((radio) => radio.id));
  },
  { immediate: true },
);

const openRadios = computed(() => {
  return cards.value.flatMap((card) => {
    const radio = radios.value.find((candidate) => candidate.id === card.savedRadioId);
    return radio ? [radio] : [];
  });
});

const addRadioItems = computed<DropdownMenuItem[][]>(() => {
  const available = radios.value.filter((radio) => !cards.value.some((card) => card.savedRadioId === radio.id));

  if (radios.value.length === 0) {
    return [[{
      label: 'Add radios in Preferences',
      icon: 'i-lucide-settings',
      to: '/preferences?section=radios',
    }]];
  }

  if (available.length === 0) {
    return [[{ label: 'Every saved radio is open', disabled: true }]];
  }

  return [available.map((radio) => ({
    label: radio.name,
    description: savedRadioModelLabel(radio, configurations.value),
    onSelect: () => {
      openCard(radio.id);
    },
  }))];
});

const boardClass = computed(() => {
  if (openRadios.value.length <= 1) {
    return 'grid-cols-1';
  }

  if (layout.value === 'tile') {
    return 'grid-cols-1 auto-rows-[minmax(36rem,1fr)] xl:grid-cols-2';
  }

  return 'grid-cols-1 auto-rows-[minmax(36rem,1fr)]';
});

function selectLayout(next: RadioBoardLayout): void {
  setLayout(next);
}

async function closeRadio(id: string): Promise<void> {
  const port = cardById(id)?.catPort;

  if (port) {
    await disconnect(port);
  }

  clearCardSession(id);
  closeCard(id);
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden">
    <div class="flex shrink-0 items-center justify-between gap-2 px-4 pt-2">
      <p class="min-w-0 text-xs text-muted">
        Open a saved radio to import, write, or control it. Each card keeps its own memory.
      </p>
      <div class="flex shrink-0 items-center gap-1.5">
        <UFieldGroup size="sm">
          <UButton
            icon="i-lucide-rows-3"
            color="neutral"
            :variant="layout === 'stack' ? 'subtle' : 'outline'"
            aria-label="Stack radios"
            :aria-pressed="layout === 'stack'"
            @click="selectLayout('stack')"
          />
          <UButton
            icon="i-lucide-layout-grid"
            color="neutral"
            :variant="layout === 'tile' ? 'subtle' : 'outline'"
            aria-label="Tile radios"
            :aria-pressed="layout === 'tile'"
            @click="selectLayout('tile')"
          />
        </UFieldGroup>
        <UDropdownMenu :items="addRadioItems">
          <UButton
            icon="i-lucide-plus"
            color="primary"
            size="sm"
            label="Add radio"
          />
        </UDropdownMenu>
      </div>
    </div>

    <div v-if="radios.length === 0" class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4">
      <p class="max-w-md text-center text-sm text-muted">
        Add the radios you use under Preferences. Each one keeps a name, model, baud rate, and default serial port.
      </p>
      <UButton
        label="Open radio preferences"
        color="primary"
        icon="i-lucide-radio"
        to="/preferences?section=radios"
      />
    </div>

    <div
      v-else-if="openRadios.length === 0"
      class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4"
    >
      <p class="max-w-md text-center text-sm text-muted">
        Choose a radio to open it as a card. Stack lists cards in a column. Tile places them side by side.
      </p>
      <div class="flex flex-wrap items-center justify-center gap-2">
        <UButton
          v-for="radio in radios"
          :key="radio.id"
          :label="radio.name"
          color="neutral"
          variant="outline"
          icon="i-lucide-radio"
          @click="openCard(radio.id)"
        />
      </div>
    </div>

    <div v-else class="grid min-h-0 flex-1 gap-3 overflow-auto px-4 pt-2 pb-4" :class="boardClass">
      <RadioCard
        v-for="radio in openRadios"
        :key="radio.id"
        :radio="radio"
        :focused="focusedCardId === radio.id"
        :fill="openRadios.length === 1"
        @focus="focusCard(radio.id)"
        @close="closeRadio(radio.id)"
      />
    </div>
  </div>
</template>
