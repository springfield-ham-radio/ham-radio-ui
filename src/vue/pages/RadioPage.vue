<template>
  <Tabs value="0">
    <TabList>
      <Tab value="0">Channels</Tab>
      <Tab value="1">Settings</Tab>
      <Tab value="2">Hex Dump</Tab>
    </TabList>
    <TabPanels>
      <TabPanel value="0">
        <div class="card">
          <DataTable :value="program?.channels" size="small" tableStyle="min-width: 50rem">
            <Column field="channelNumber" header="Number"></Column>
            <Column field="radioChannel.name" header="Name"></Column>
            <Column field="radioChannel.transmitFrequency" header="Transmit"></Column>
            <Column field="radioChannel.receiveFrequency" header="Receive"></Column>
          </DataTable>
        </div>
      </TabPanel>
      <TabPanel value="1">
        Settings
      </TabPanel>
      <TabPanel value="2">
        <div class="card">
          <HexDump v-if="memory" :memory="memory" />
        </div>
      </TabPanel>
    </TabPanels>
  </Tabs>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Column, DataTable, Tab, Tabs, TabList, TabPanels, TabPanel } from 'primevue';
import { RadioMemory, RadioProgram, RadioId } from '@springfield/ham-radio-api';
import HexDump from '../components/HexDump.vue';
import { useRadioStore } from '../stores/radios';
const radioId = ref<RadioId>();
const memory = ref<RadioMemory>();
const program = ref<RadioProgram>();
const radioStore = useRadioStore();

onMounted(() => {
  window.radio.onRadioMemory((_event, radioId: RadioId, radioMemory: RadioMemory) => {
    console.log('radioMemory', radioId);
    radioId.value = radioId;
    memory.value = radioMemory;
    program.value = radioStore.radiosById.get(radioId.model)?.decodeMemory(radioMemory);
  });
});
</script>
