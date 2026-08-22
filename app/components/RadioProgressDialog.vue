<script setup lang="ts">
const { progressOpen, progress, progressError, cancelImport } = useRadio();

const title = computed(() => (progressError.value ? 'Import failed' : 'Importing from radio'));
const description = computed(() =>
  progressError.value
    ? 'The radio could not be read. Check the cable connection and try again.'
    : 'Keep the programming cable connected until this finishes.',
);

function close(): void {
  progressOpen.value = false;
}
</script>

<template>
  <UModal
    v-model:open="progressOpen"
    :title="title"
    :description="description"
    :dismissible="Boolean(progressError)"
    :close="progressError ? { color: 'neutral', variant: 'ghost' } : false"
    class="max-w-md"
  >
    <template #body>
      <UAlert
        v-if="progressError"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        title="Could not read radio"
        :description="progressError"
      />
      <div v-else class="flex flex-col gap-3">
        <UProgress :value="progress * 100" color="neutral" />
        <p class="text-sm text-muted">{{ Math.round(progress * 100) }}%</p>
      </div>
    </template>

    <template #footer="{ close: dismiss }">
      <div class="flex w-full justify-end">
        <UButton
          v-if="progressError"
          color="neutral"
          variant="outline"
          label="Close"
          @click="dismiss"
        />
        <UButton v-else color="neutral" variant="outline" label="Cancel" @click="cancelImport" />
      </div>
    </template>
  </UModal>
</template>
