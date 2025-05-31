<template>
  <div class="flex flex-col h-screen overflow-hidden">
    <Tabs value="0" class="flex flex-col h-full">
      <TabList>
        <Tab value="0">Channels</Tab>
        <Tab value="1">Settings</Tab>
        <Tab value="2">Hex Dump</Tab>
      </TabList>
      <div class="flex-1 min-h-0">
        <TabPanels class="h-full">
          <TabPanel value="0" class="h-full p-4">
            <div class="h-full card">
              <DataTable
                :value="program?.channels"
                size="small"
                tableStyle="min-width: 50rem"
                scrollable
                scrollHeight="calc(100vh - 10rem)"
                class="h-full">
                <Column field="channelNumber" header="Number" />
                <Column field="radioChannel.name" header="Name" />
                <Column field="radioChannel.transmitFrequency" header="Transmit" />
                <Column field="radioChannel.receiveFrequency" header="Receive" />
                <template #empty>
                  <div class="text-center text-gray-400">No radio data</div>
                </template>
              </DataTable>
            </div>
          </TabPanel>
          <TabPanel value="1" class="h-full p-4">
            Settings
          </TabPanel>
          <TabPanel value="2" class="h-full p-4">
            <div class="h-full card">
              <HexDump v-if="memory" :memory="memory" />
            </div>
          </TabPanel>
        </TabPanels>
      </div>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import {
  Column,
  DataTable,
  Tab,
  Tabs,
  TabList,
  TabPanels,
  TabPanel,
} from "primevue";
import { RadioMemory, RadioProgram, RadioId } from "@springfield/ham-radio-api";
import HexDump from "../components/HexDump.vue";
import { useRadioStore } from "../stores/radios";
const radioId = ref<RadioId>();
const memory = ref<RadioMemory>();
const program = ref<RadioProgram>();
const radioStore = useRadioStore();

onMounted(() => {
  window.radio.onRadioMemory(
    (_event, radioId: RadioId, radioMemory: RadioMemory) => {
      console.log("radioMemory", radioId);
      radioId.value = radioId;
      memory.value = radioMemory;
      program.value = radioStore.radiosById
        .get(radioId.model)
        ?.decodeMemory(radioMemory);
    }
  );
});
</script>
