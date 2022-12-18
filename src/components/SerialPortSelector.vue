<template>
  <q-select outlined label="Serial Port" v-model="model" :options="serialPorts" option-label="path" />
  <q-btn @click="refresh">Refresh</q-btn>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';

export default defineComponent({
  data() {
    return {
      model: ref(null),
      serialPorts: [],
    }
  },

  async created() {
    this.serialPorts = await window.serialport.list();
  },

  methods: {
    async refresh() {
      window.console.log('refresh()');
      this.serialPorts = await window.serialport.list();
      window.console.log(this.serialPorts);
    }
  }
});
</script>
