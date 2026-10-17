<script setup lang="ts">
import type { LibraryPrintRowScope } from '~/utils/channel-print';

const { dialog, closePrintDialog, confirmPrint } = useChannelPrint();

const layout = ref<'full' | 'wallet'>('full');
const matchVisibleColumns = ref(true);
const libraryScope = ref<LibraryPrintRowScope>('visible');
const selectedOnly = ref(false);
const callSign = ref<string | undefined>();

watch(
  () => dialog.value.open,
  (open) => {
    if (!open) {
      return;
    }

    layout.value = 'full';
    matchVisibleColumns.value = true;
    libraryScope.value = 'visible';
    selectedOnly.value = false;
    callSign.value = dialog.value.defaultCallSign ?? dialog.value.callSignOptions[0]?.value;
  },
);

const layoutItems = [
  { label: 'Full page', value: 'full' },
  { label: 'Wallet card', value: 'wallet' },
];

const libraryScopeItems = [
  { label: 'As shown in the table', value: 'visible' },
  { label: 'Whole tab', value: 'whole-tab' },
];

const canPrint = computed(() => dialog.value.rowCount > 0);

async function onPrint(): Promise<void> {
  await confirmPrint({
    layout: layout.value,
    matchVisibleColumns: matchVisibleColumns.value,
    callSign: callSign.value,
    libraryScope: libraryScope.value,
    selectedOnly: selectedOnly.value,
  });
}
</script>

<template>
  <UModal
    :open="dialog.open"
    title="Print channels"
    @update:open="(open) => { if (!open) closePrintDialog(); }"
    :description="dialog.subtitle"
    :ui="{ content: 'sm:max-w-md', footer: 'justify-end' }"
  >
    <template #body>
    <div class="space-y-4">
      <UFormField label="Layout">
        <USelect v-model="layout" :items="layoutItems" value-key="value" class="w-full" />
      </UFormField>

      <UFormField
        v-if="dialog.surface === 'library' && layout === 'full'"
        label="Columns"
      >
        <UCheckbox v-model="matchVisibleColumns" label="Match the table’s visible columns" />
      </UFormField>

      <UFormField
        v-if="dialog.surface === 'library' && dialog.hasFiltersActive"
        label="Rows"
      >
        <USelect v-model="libraryScope" :items="libraryScopeItems" value-key="value" class="w-full" />
      </UFormField>

      <UFormField v-if="dialog.surface === 'library' && dialog.hasSelection">
        <UCheckbox v-model="selectedOnly" label="Selected rows only" />
      </UFormField>

      <UFormField v-if="dialog.callSignOptions.length > 0" label="Call sign">
        <USelect
          v-model="callSign"
          :items="dialog.callSignOptions"
          value-key="value"
          class="w-full"
        />
      </UFormField>
    </div>
    </template>

    <template #footer="{ close }">
      <UButton color="neutral" variant="outline" label="Cancel" @click="close" />
      <UButton
        icon="i-lucide-printer"
        color="primary"
        label="Print…"
        :disabled="!canPrint"
        @click="onPrint"
      />
    </template>
  </UModal>
</template>
