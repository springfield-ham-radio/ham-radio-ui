<template>
  <div class="row items-center">
    <q-select class="col" outlined label="Serial Port" v-model="model" :options="serialPorts" option-label="path" />
    <q-btn class="q-ma-md" round @click="refresh" icon="refresh"/>
  </div>
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
