<template>
  <div class="row items-center">
    <q-select class="col" outlined label="Serial Port" v-model="model" :options="serialPorts" option-label="path" />
    <q-btn class="q-ma-md" round @click="refresh" icon="refresh">
      <q-tooltip>
        Refresh serial ports
      </q-tooltip>
    </q-btn>
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
    this.refresh();
  },

  methods: {
    async refresh() {
      this.serialPorts = await window.serialport.list();
    }
  }
});
</script>
