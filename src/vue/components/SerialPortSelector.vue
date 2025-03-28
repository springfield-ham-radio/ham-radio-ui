<template>
  <div class="flex flex-row items-center">
    <Select class="grow" v-model="model" :options="serialPorts" optionLabel="path" placeholder="Select a Serial Port" />
    <Button class="ml-2" @click="refresh" icon="pi pi-refresh" v-tooltip="'Refresh serial ports'" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Button, Select } from 'primevue';
import { PortInfo } from '@serialport/bindings-interface';

const serialPorts = ref([]);

const model = defineModel<PortInfo>();

async function refresh() {
  serialPorts.value = await window.electron.serialPort.list();
}

onMounted(async () => {
  await refresh();
});
</script>
