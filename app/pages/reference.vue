<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';
import { REFERENCE_SOURCES, REFERENCE_VERIFIED_ON } from '~/utils/reference-sources';

useHead({ title: 'Reference' });

const section = ref('phonetic');
const sectionItems: TabsItem[] = [
  { label: 'Phonetic', value: 'phonetic', icon: 'i-lucide-case-sensitive' },
  { label: 'Q signals', value: 'q-signals', icon: 'i-lucide-messages-square' },
  { label: 'Bands', value: 'bands', icon: 'i-lucide-chart-bar' },
  { label: 'Morse', value: 'morse', icon: 'i-lucide-audio-lines' },
];
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-default px-4 py-3">
      <div class="min-w-0">
        <h2 class="text-sm font-semibold text-highlighted">Reference</h2>
        <p class="text-xs text-muted">
          Offline operating reference. No radio needs to be selected, installed, or connected.
          Verified {{ REFERENCE_VERIFIED_ON }}.
        </p>
      </div>
      <UTabs
        v-model="section"
        :items="sectionItems"
        :content="false"
        color="primary"
        variant="pill"
        size="sm"
        class="w-auto max-w-full"
        :ui="{ list: 'w-auto', trigger: 'grow-0' }"
      />
    </div>

    <div class="min-h-0 flex-1 overflow-auto px-4 py-3">
      <ReferencePhonetic v-if="section === 'phonetic'" />
      <ReferenceQSignals v-else-if="section === 'q-signals'" />
      <ReferenceBandChart v-else-if="section === 'bands'" />
      <ReferenceMorse v-else />

      <details class="mt-6 rounded-lg border border-default px-3 py-2">
        <summary class="cursor-pointer text-xs font-medium text-highlighted">Sources</summary>
        <ul class="mt-2 space-y-1 text-xs text-muted">
          <li v-for="source in REFERENCE_SOURCES" :key="source.id">
            <ReferenceExternalLink :href="source.url">{{ source.title }}</ReferenceExternalLink>
            — {{ source.usedFor }}
          </li>
        </ul>
      </details>
    </div>
  </div>
</template>
