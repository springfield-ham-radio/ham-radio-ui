<script setup lang="ts">
const { openReadFromRadio, openMemoryFile } = useRadio();
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 py-8">
    <p class="text-sm text-muted">Open a memory file or read from a radio to get started.</p>
    <div class="flex flex-wrap items-center justify-center gap-2">
      <UButton
        icon="i-hambench-radio-read"
        color="primary"
        label="Read from Radio"
        @click="openReadFromRadio"
      />
      <UButton
        icon="i-lucide-folder-open"
        color="neutral"
        variant="outline"
        label="Open Memory"
        @click="openMemoryFile"
      />
    </div>
  </div>
</template>
