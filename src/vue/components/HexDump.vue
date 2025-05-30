<template>
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
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RadioMemory } from '@springfield/ham-radio-api';
import { RadioSegmentedMemory } from '@springfield/ham-radio-driver-utils';

interface SerializedRadioMemorySegment {
  startAddress: number;
  length: number;
  data: Uint8Array;
}

interface SerializedRadioSegmentedMemory {
  segments: SerializedRadioMemorySegment[];
}

const props = defineProps<{
  memory: RadioMemory;
}>();

interface HexRow {
  address: string;
  bytes: string[];
  ascii: string;
}

const BYTES_PER_ROW = 16;

function reconstructSegmentedMemory(contents: RadioMemorySegment[]): RadioSegmentedMemory {
  return new RadioSegmentedMemory(contents);
}

const formattedRows = computed(() => {
  const rows: HexRow[] = [];
  const contents = props.memory.contents;

  if (contents instanceof Uint8Array) {
    // Handle plain Uint8Array case
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
  } else {
    // Handle RadioSegmentedMemory case
    const segmentedMemory = reconstructSegmentedMemory(contents);

    for (const segment of segmentedMemory.getSegments()) {
      const data = segment.data;
      const baseAddress = segment.startAddress;

      for (let i = 0; i < data.length; i += BYTES_PER_ROW) {
        const rowBytes = data.slice(i, i + BYTES_PER_ROW);
        const bytes: string[] = [];
        const asciiChars: string[] = [];

        for (let j = 0; j < rowBytes.length; j++) {
          const byte = rowBytes[j];
          bytes.push(byte.toString(16).padStart(2, '0').toUpperCase());
          asciiChars.push((byte >= 32 && byte <= 126) ? String.fromCharCode(byte) : '.');
        }

        rows.push({
          address: (baseAddress + i).toString(16).padStart(8, '0').toUpperCase(),
          bytes,
          ascii: asciiChars.join('')
        });
      }
    }
  }

  return rows;
});
</script>

<style scoped>
.hex-dump {
  font-family: monospace;
  white-space: pre;
  background-color: #1e1e1e;
  color: #d4d4d4;
  padding: 1rem;
  border-radius: 4px;
}

.hex-row {
  display: flex;
  margin-bottom: 4px;
}

.address {
  color: #569cd6;
  margin-right: 2rem;
  min-width: 8ch;
}

.hex-values {
  margin-right: 2rem;
}

.byte {
  margin-right: 0.5rem;
}

.ascii {
  color: #ce9178;
}
</style>