<template>
  <div class="row items-center">
    <q-select class="col" outlined label="Serial Port" v-model="serialPort" :options="serialPorts" />
    <q-btn class="q-ma-md" round @click="refresh" icon="refresh">
      <q-tooltip>
        Refresh serial ports
      </q-tooltip>
    </q-btn>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';

const serialPort = ref();
const serialPorts = ref([]);

const emit = defineEmits(['portSelected']);

async function refresh() {
  serialPorts.value = await window.serialport.list();
}

onMounted(async () => {
  await refresh();
});

watch(serialPort, (value) => {
  emit('portSelected', value)
});

</script>
