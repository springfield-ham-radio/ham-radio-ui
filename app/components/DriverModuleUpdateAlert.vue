<script setup lang="ts">
import { DRIVER_PREFERENCES_PATH } from '~/utils/driver-module-update-alert';

const { alertOpen, alertTitle, alertDescription, onAlertOpenChange } = useDriverModuleUpdateBanner();
</script>

<template>
  <div v-if="alertOpen" class="shrink-0 border-b border-default bg-default px-4 py-2">
    <UAlert
      color="info"
      variant="subtle"
      icon="i-lucide-download"
      :title="alertTitle"
      :description="alertDescription"
      close
      :ui="{ root: 'items-center' }"
      @update:open="onAlertOpenChange"
    >
      <template #actions>
        <UButton
          :to="DRIVER_PREFERENCES_PATH"
          label="Open driver preferences"
          color="neutral"
          variant="outline"
          size="sm"
        />
      </template>
    </UAlert>
  </div>
</template>
