<script setup lang="ts">
import { DRIVER_PREFERENCES_PATH } from '~/utils/driver-module-update-alert';

const { alertOpen, onAlertOpenChange } = useEmptyCatalogBanner();
</script>

<template>
  <div v-if="alertOpen" class="shrink-0 border-b border-default bg-default px-4 py-2">
    <UAlert
      color="warning"
      variant="subtle"
      icon="i-lucide-cpu"
      title="No radio modules installed"
      description="Install a driver before you can read or write a radio."
      close
      :ui="{ root: 'items-center' }"
      @update:open="onAlertOpenChange"
    >
      <template #actions>
        <UButton
          :to="DRIVER_PREFERENCES_PATH"
          label="Install drivers"
          color="neutral"
          variant="outline"
          size="sm"
        />
      </template>
    </UAlert>
  </div>
</template>
