<script setup lang="ts">
import type { RadioMemoryConfig, RadioProtocolStep } from '@springfield/ham-radio-api';
import { describeProtocolSteps, formatProtocolJson } from '~/utils/protocol-display';

const props = defineProps<{
  protocol: RadioProtocolStep[];
  memoryConfig?: RadioMemoryConfig;
  serialSummary?: string;
  viewMode: 'diagram' | 'json';
}>();

const sequence = computed(() => describeProtocolSteps(props.protocol, props.memoryConfig));
const json = computed(() => formatProtocolJson(props.protocol));
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden pt-3">
    <RadioDriverSequence
      v-if="viewMode === 'diagram'"
      :steps="sequence"
      :serial-summary="serialSummary"
    />
    <div
      v-else
      class="min-h-0 flex-1 overflow-auto rounded-xl bg-default shadow-sm ring-1 ring-default"
    >
      <pre class="px-4 py-3 font-mono text-xs leading-6 text-highlighted">{{ json }}</pre>
    </div>
  </div>
</template>
