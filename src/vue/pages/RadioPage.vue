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
                <Column field="radioChannel.transmitFrequency" header="Transmit">
                  <template #body="{ data }">
                    {{ getFrequencyDisplay(data.radioChannel.transmitFrequency) }}
                  </template>
                </Column>
                <Column field="radioChannel.receiveFrequency" header="Receive">
                  <template #body="{ data }">
                    {{ getFrequencyDisplay(data.radioChannel.receiveFrequency) }}
                  </template>
                </Column>
                <Column field="radioChannel.transmitTone" header="TX Tone">
                  <template #body="{ data }">
                    {{ getToneDisplay(data.radioChannel.transmitTone) }}
                  </template>
                </Column>
                <Column field="radioChannel.receiveTone" header="RX Tone">
                  <template #body="{ data }">
                    {{ getToneDisplay(data.radioChannel.receiveTone) }}
                  </template>
                </Column>
                <Column field="radioChannel.receiveTone" header="Tone Type">
                  <template #body="{ data }">
                    {{ getToneTypeDisplay(data.radioChannel.transmitTone) }}
                  </template>
                </Column>
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
import { RadioMemory, RadioProgram, RadioId, RadioToneType, type RadioTone, type Frequency } from "@springfield/ham-radio-api";
import { BandPlan, frequencyDisplay } from "@springfield/ham-radio-utils";
import HexDump from "../components/HexDump.vue";
import { useRadioStore } from "../stores/radios";

const bandPlan = new BandPlan();

const radioId = ref<RadioId>();
const memory = ref<RadioMemory>();
const program = ref<RadioProgram>();
const radioStore = useRadioStore();

const getFrequencyDisplay = (frequency: Frequency) => {
  if (frequency === undefined) {
    return "N/A";
  }

  const band = bandPlan.findBandByFrequency(frequency);
  return band ? frequencyDisplay(frequency, band) : frequency.toString();
}

const getToneDisplay = (tone: RadioTone) => {
  if (!tone || tone.tone === 0) {
    return "";
  }

  return tone.type === RadioToneType.CTCSS ? (tone.tone / 10).toFixed(1) : tone.tone.toString();
}

const getToneTypeDisplay = (tone: RadioTone) => {
  if (!tone || tone.tone === 0) {
    return "";
  }

  return tone.type === RadioToneType.CTCSS ? "CTCSS" : "DCS";
}

onMounted(() => {
  window.radio.onRadioMemory(
    (_event, receivedRadioId: RadioId, radioMemory: RadioMemory, decodedProgram?: RadioProgram) => {
      console.log("📻 Received radio memory event", receivedRadioId);
      radioId.value = receivedRadioId;
      memory.value = radioMemory;
      program.value = decodedProgram;
      
      if (decodedProgram) {
        console.log("✅ Received decoded radio memory", {
          channelCount: decodedProgram.channels?.length || 0,
          settingsKeys: Object.keys(decodedProgram.settings || {})
        });
      } else {
        console.warn("⚠️ No decoded program received - channels tab will be empty");
      }
    }
  );
});
</script>
