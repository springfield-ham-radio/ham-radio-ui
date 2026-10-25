<script setup lang="ts">
import type { OnboardingReadContinueResult } from '~/utils/onboarding';

defineProps<{
  decision: OnboardingReadContinueResult;
  attempted: boolean;
}>();

const emit = defineEmits<{
  'go-to': [step: 'drivers' | 'cable'];
  backups: [];
  read: [];
}>();
</script>

<template>
  <div class="mt-4 flex flex-col gap-4">
    <div class="overflow-hidden rounded-xl bg-default p-4 shadow-sm ring-1 ring-default">
      <p class="text-sm font-medium text-highlighted">First read</p>
      <p class="mt-1 text-xs text-muted">
        Read radio opens the read dialog on top of this guide and saves a backup before anything is edited. Finish
        closes the guide, with or without that backup.
      </p>
    </div>

    <UAlert
      v-if="decision.action === 'blocked' && decision.reason === 'desktop'"
      color="warning"
      variant="subtle"
      icon="i-lucide-monitor"
      title="Desktop app required"
      description="Reading a radio and saving a backup need the HamBench desktop app. Finish closes the guide without a read."
    />
    <UAlert
      v-else-if="decision.action === 'blocked' && decision.reason === 'backups'"
      color="warning"
      variant="subtle"
      icon="i-lucide-archive"
      title="Backups are off"
      :description="attempted ? 'Read radio cannot open the dialog until backups are on. Turn them on under Preferences → Backups, then open this guide again. Finish closes the guide without a read.' : 'Turn backups on under Preferences → Backups before this step can open the read dialog. Finish closes the guide without a read.'"
    >
      <template #actions>
        <UButton label="Open Backups" color="neutral" variant="outline" size="sm" @click="emit('backups')" />
      </template>
    </UAlert>
    <UAlert
      v-else-if="decision.action === 'blocked' && decision.reason === 'driver'"
      color="warning"
      variant="subtle"
      icon="i-lucide-cpu"
      :title="attempted ? 'Read radio did not open the dialog' : 'Driver not installed'"
      :description="`Install the ${decision.name} driver under Drivers before this radio can be read.`"
    >
      <template #actions>
        <UButton label="Go to Drivers" color="neutral" variant="outline" size="sm" @click="emit('go-to', 'drivers')" />
      </template>
    </UAlert>
    <UAlert
      v-else-if="decision.action === 'blocked' && decision.reason === 'port'"
      color="warning"
      variant="subtle"
      icon="i-lucide-usb"
      :title="attempted ? 'Read radio did not open the dialog' : 'No radio is ready to read'"
      description="Save a radio with a driver and a programming port on the Cable step. Finish does not read a radio."
    >
      <template #actions>
        <UButton label="Go to Cable" color="neutral" variant="outline" size="sm" @click="emit('go-to', 'cable')" />
      </template>
    </UAlert>
    <UAlert
      v-else-if="decision.action === 'advance'"
      color="success"
      variant="subtle"
      icon="i-lucide-archive"
      title="A backup is already saved"
      description="Finish closes the guide. The backup was made before edits."
    />
    <p v-else class="text-sm text-muted">
      Read radio reads {{ decision.name }} on {{ decision.serialPort }}. The read dialog opens on top of this guide.
    </p>
    <div v-if="decision.action !== 'advance'">
      <UButton label="Read radio" color="primary" @click="emit('read')" />
    </div>
  </div>
</template>
