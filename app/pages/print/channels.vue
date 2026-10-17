<script setup lang="ts">
import { isTauriRuntime } from '~/utils/radio-memory-file-io';
import {
  clearChannelPrintDocument,
  readChannelPrintDocument,
} from '~/utils/channel-print-window';

definePageMeta({
  layout: 'print',
});

const route = useRoute();
const document = computed(() => {
  const id = typeof route.query.id === 'string' ? route.query.id : '';
  return id ? readChannelPrintDocument(id) : undefined;
});

onMounted(async () => {
  const id = typeof route.query.id === 'string' ? route.query.id : '';

  if (!document.value) {
    return;
  }

  await document.fonts.ready;
  await nextTick();

  window.print();
  window.addEventListener(
    'afterprint',
    () => {
      if (id) {
        clearChannelPrintDocument(id);
      }

      if (isTauriRuntime()) {
        void import('@tauri-apps/api/webviewWindow').then(({ WebviewWindow }) => {
          void WebviewWindow.getCurrent().close();
        });
      } else {
        window.close();
      }
    },
    { once: true },
  );
});
</script>

<template>
  <div v-if="document" class="channel-print-page px-8 py-6 text-[11pt] text-black">
    <header class="mb-4 border-b border-black/20 pb-3">
      <h1 class="text-lg font-semibold">{{ document.title }}</h1>
      <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <template v-for="line in document.headerLines" :key="line.label">
          <dt class="font-medium">{{ line.label }}</dt>
          <dd>{{ line.value }}</dd>
        </template>
      </dl>
    </header>

    <table v-if="document.layout === 'full'" class="w-full border-collapse text-xs">
      <thead>
        <tr>
          <th
            v-for="column in document.columns"
            :key="column.id"
            class="border border-black/30 px-2 py-1 text-left font-semibold"
          >
            {{ column.header }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, index) in document.rows" :key="index">
          <td
            v-for="column in document.columns"
            :key="column.id"
            class="border border-black/20 px-2 py-1 align-top tabular-nums"
          >
            {{ row[column.id] ?? '' }}
          </td>
        </tr>
      </tbody>
    </table>

    <div v-else class="wallet-columns text-[8pt] leading-tight">
      <div v-for="(line, index) in document.walletLines" :key="index" class="wallet-line mb-1 break-inside-avoid">
        <span v-if="line.slot" class="tabular-nums">{{ line.slot }}</span>
        <span v-if="line.slot">&nbsp;</span>
        <span class="font-medium">{{ line.name }}</span>
        <span>&nbsp;{{ line.rx }}</span>
        <span>&nbsp;{{ line.offset }}</span>
        <span>&nbsp;{{ line.tone }}</span>
        <div v-if="line.notes" class="text-[7pt] text-black/80">{{ line.notes }}</div>
      </div>
    </div>
  </div>
  <p v-else class="p-8 text-sm text-black">Print data is missing or expired.</p>
</template>

<style scoped>
.channel-print-page {
  color-scheme: light;
}

.wallet-columns {
  column-count: 3;
  column-gap: 1rem;
}

.wallet-line {
  break-inside: avoid;
  page-break-inside: avoid;
}

@page {
  margin: 0.5in;
}

@media print {
  .channel-print-page {
    padding: 0;
  }
}
</style>
