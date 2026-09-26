<script setup lang="ts">
import type { DropdownMenuItem, TabsItem } from '@nuxt/ui';
import type { DirectImportRequest } from '~/components/RadioDirectImportDialog.vue';
import type { RadioBoardLayout } from '~/utils/radio-board';
import { savedRadioModelLabel, type SavedRadio } from '~/utils/saved-radios';

const { radios } = useSavedRadios();
const { configurations, clearCardSession, importFromRadio, openModulesInstall } = useRadio();
const {
  cards,
  layout,
  focusedCardId,
  hydrate,
  focusCard,
  openCard,
  openGuestCard,
  closeCard,
  setLayout,
  cardById,
  beginTransfer,
  clearTransfer,
} = useRadioBoard();
const { disconnect } = useCat();

watch(
  radios,
  (list) => {
    hydrate(list.map((radio) => radio.id));
  },
  { immediate: true },
);

const directImportOpen = shallowRef(false);

const openRadios = computed(() => {
  return cards.value.flatMap((card) => {
    if (card.guest) {
      const radio: SavedRadio = {
        id: card.id,
        name: card.guest.name,
        manufacturer: card.guest.manufacturer,
        model: card.guest.model,
        serialPort: card.guest.serialPort,
        createdAt: 0,
        updatedAt: 0,
      };

      if (card.guest.baudRate !== undefined) {
        radio.baudRate = card.guest.baudRate;
      }

      return [radio];
    }

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

const tabbed = computed(() => layout.value === 'tabs' && openRadios.value.length > 1);

const tabItems = computed<TabsItem[]>(() =>
  openRadios.value.map((radio) => ({
    label: radio.name,
    value: radio.id,
    icon: 'i-lucide-radio',
  })),
);

const activeTabId = computed({
  get(): string {
    const focused = focusedCardId.value;

    if (focused && openRadios.value.some((radio) => radio.id === focused)) {
      return focused;
    }

    return openRadios.value[0]?.id ?? '';
  },
  set(id: string | number) {
    focusCard(String(id));
  },
});

const panelClass = computed(() => {
  if (tabbed.value || openRadios.value.length <= 1) {
    return 'grid-cols-1 grid-rows-1 overflow-hidden';
  }

  return 'grid-cols-1 auto-rows-[minmax(36rem,1fr)] overflow-auto xl:grid-cols-2';
});

function selectLayout(next: RadioBoardLayout): void {
  setLayout(next);
}

function openDirectImport(): void {
  if (configurations.value.length === 0) {
    openModulesInstall();
    return;
  }

  directImportOpen.value = true;
}

async function onDirectImport(request: DirectImportRequest): Promise<void> {
  const id = openGuestCard({
    name: request.radioId.name,
    manufacturer: String(request.radioId.manufacturer),
    model: String(request.radioId.model),
    baudRate: request.baudRate,
    serialPort: request.serialPort,
  });
  beginTransfer(id);

  try {
    await importFromRadio(request.serialPort, request.radioId, request.baudRate);
  } finally {
    clearTransfer();
  }
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
          <UTooltip text="Tabs">
            <UButton
              icon="i-lucide-gallery-horizontal"
              color="neutral"
              :variant="layout === 'tabs' ? 'subtle' : 'outline'"
              aria-label="Show radios in tabs"
              :aria-pressed="layout === 'tabs'"
              @click="selectLayout('tabs')"
            />
          </UTooltip>
          <UTooltip text="Tile">
            <UButton
              icon="i-lucide-layout-grid"
              color="neutral"
              :variant="layout === 'tile' ? 'subtle' : 'outline'"
              aria-label="Tile radios"
              :aria-pressed="layout === 'tile'"
              @click="selectLayout('tile')"
            />
          </UTooltip>
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
        Import from a connected radio, or add the radios you use under Preferences. Each saved radio keeps a name, model, baud rate, and default serial port.
      </p>
      <div class="flex flex-wrap items-center justify-center gap-2">
        <UButton
          label="Import from Radio"
          color="primary"
          icon="i-lucide-download"
          @click="openDirectImport"
        />
        <UButton
          label="Open radio preferences"
          color="neutral"
          variant="outline"
          icon="i-lucide-radio"
          to="/preferences?section=radios"
        />
      </div>
    </div>

    <div
      v-else-if="openRadios.length === 0"
      class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4"
    >
      <p class="max-w-md text-center text-sm text-muted">
        Import from a connected radio, or open one you already saved. Tabs shows one radio at a time. Tile places them side by side.
      </p>
      <div class="flex flex-wrap items-center justify-center gap-2">
        <UButton
          label="Import from Radio"
          color="primary"
          icon="i-lucide-download"
          @click="openDirectImport"
        />
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

    <div v-else class="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pt-2 pb-4">
      <UTabs
        v-if="tabbed"
        v-model="activeTabId"
        :items="tabItems"
        :content="false"
        color="neutral"
        variant="pill"
        size="sm"
        class="mb-3 w-full shrink-0"
        :ui="{
          list: 'w-full overflow-x-auto',
          trigger: 'grow-0 shrink-0',
        }"
      />
      <div
        class="grid min-h-0 min-w-0 flex-1 gap-3"
        :class="panelClass"
      >
        <RadioCard
          v-for="radio in openRadios"
          v-show="!tabbed || radio.id === activeTabId"
          :key="radio.id"
          :radio="radio"
          :focused="focusedCardId === radio.id"
          :fill="tabbed || openRadios.length === 1"
          @focus="focusCard(radio.id)"
          @close="closeRadio(radio.id)"
        />
      </div>
    </div>

    <RadioDirectImportDialog v-model:open="directImportOpen" @confirm="onDirectImport" />
  </div>
</template>
