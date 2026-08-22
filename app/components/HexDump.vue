<script setup lang="ts">
import type { RadioMemory } from '@springfield/ham-radio-api';

const props = defineProps<{
  memory: RadioMemory;
}>();

interface HexRow {
  address: string;
  bytes: string[];
  ascii: string;
}

const BYTES_PER_ROW = 16;

const formattedRows = computed(() => {
  const rows: HexRow[] = [];
  const contents = props.memory.contents;

  for (let i = 0; i < contents.length; i += BYTES_PER_ROW) {
    const rowBytes = contents.slice(i, i + BYTES_PER_ROW);
    const bytes: string[] = [];
    const asciiChars: string[] = [];

    for (let j = 0; j < rowBytes.length; j++) {
      const byte = rowBytes[j] ?? 0;
      bytes.push(byte.toString(16).padStart(2, '0').toUpperCase());
      asciiChars.push(byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.');
    }

    rows.push({
      address: i.toString(16).padStart(8, '0').toUpperCase(),
      bytes,
      ascii: asciiChars.join(''),
    });
  }

  return rows;
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-default font-mono text-sm ring-1 ring-default">
    <div class="flex border-b border-default bg-elevated px-4 py-2 text-muted">
      <div class="mr-8 min-w-[8ch]">Address</div>
      <div class="mr-8 min-w-[48ch]">Data</div>
      <div class="min-w-[16ch]">ASCII</div>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto px-4 py-2">
      <div v-for="(row, index) in formattedRows" :key="index" class="mb-0.5 flex">
        <div class="mr-8 min-w-[8ch] text-toned">{{ row.address }}</div>
        <div class="mr-8 flex min-w-[48ch]">
          <span v-for="(byte, byteIndex) in row.bytes" :key="byteIndex" class="mr-2 w-[2ch] text-center text-highlighted">
            {{ byte }}
          </span>
        </div>
        <div class="min-w-[16ch] text-warning">{{ row.ascii }}</div>
      </div>
    </div>
  </div>
</template>
