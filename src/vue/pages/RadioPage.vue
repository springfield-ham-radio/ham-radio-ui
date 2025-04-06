<template>
  <div class="card">
    <DataTable :value="program.channels" tableStyle="min-width: 50rem">
      <Column field="channelNumber" header="Number"></Column>
      <Column field="radioChannel.name" header="Name"></Column>
      <Column field="radioChannel.transmitFrequency" header="Transmit"></Column>
      <Column field="radioChannel.receiveFrequency" header="Receive"></Column>
    </DataTable>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { RadioProgram } from '@springfield/ham-radio-api';

const program = ref<RadioProgram>();
</script>
