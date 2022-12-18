<template>
  <q-select outlined label="Serial Port" v-model="model" :options="serialPorts" option-label="path" />
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';

export default defineComponent({
  async setup() {
    const serialPorts = await window.serialport.list();
    return { model: ref(null), serialPorts };
  },
});
</script>
