<template>
  <div class="hex-dump-container">
    <div class="hex-header">
      <div class="address">Address</div>
      <div class="hex-values">Data</div>
      <div class="ascii">ASCII</div>
    </div>
    <div class="hex-dump">
      <div v-for="(row, index) in formattedRows" :key="index" class="hex-row">
        <div class="address">{{ row.address }}</div>
        <div class="hex-values">
          <span v-for="(byte, byteIndex) in row.bytes" :key="byteIndex" class="byte">
            {{ byte }}
          </span>
        </div>
        <div class="ascii">{{ row.ascii }}</div>
      </div>
    </div>
    <div class="hex-spacer"></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RadioMemory } from '@springfield/ham-radio-api';

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

  // Handle Uint8Array case (the new format from RadioDriver)
  for (let i = 0; i < contents.length; i += BYTES_PER_ROW) {
    const rowBytes = contents.slice(i, i + BYTES_PER_ROW);
    const bytes: string[] = [];
    const asciiChars: string[] = [];

    for (let j = 0; j < rowBytes.length; j++) {
      const byte = rowBytes[j];
      bytes.push(byte.toString(16).padStart(2, '0').toUpperCase());
      asciiChars.push((byte >= 32 && byte <= 126) ? String.fromCharCode(byte) : '.');
    }

    rows.push({
      address: i.toString(16).padStart(8, '0').toUpperCase(),
      bytes,
      ascii: asciiChars.join('')
    });
  }

  return rows;
});
</script>

<style scoped>
.hex-dump-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: #1e1e1e;
  border-radius: 4px;
  overflow: hidden;
  box-sizing: border-box;
}

.hex-header {
  display: flex;
  padding: 0.75rem 1rem 0.5rem 1rem;
  background-color: #252526;
  border-bottom: 1px solid #3c3c3c;
  position: sticky;
  top: 0;
  z-index: 1;
  flex-shrink: 0;
  font-family: monospace;
}

.hex-dump {
  font-family: monospace;
  white-space: pre;
  color: #d4d4d4;
  padding: 0.5rem 1rem 0.5rem 1rem;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  box-sizing: border-box;
}

.hex-row {
  display: flex;
  margin-bottom: 2px;
}

.address {
  color: #569cd6;
  margin-right: 2rem;
  min-width: 8ch;
  flex-shrink: 0;
}

.hex-values {
  margin-right: 2rem;
  display: flex;
  flex-wrap: wrap;
  min-width: 48ch; /* 16 bytes * 3 chars per byte (2 hex + space) */
  flex-shrink: 0;
}

.byte {
  margin-right: 0.5rem;
  width: 2ch;
  text-align: center;
}

.ascii {
  color: #ce9178;
  min-width: 16ch; /* 16 characters */
  flex-shrink: 0;
}

.hex-spacer {
  height: 2rem;
  flex-shrink: 0;
  background-color: #1e1e1e;
}
</style>