<template>
  <q-btn round color="primary" icon="input" @click="showDialog = true">
    <q-tooltip>
      Import from radio
    </q-tooltip>
  </q-btn>

  <q-dialog v-model="showDialog">
    <q-card style="width: 500px">
      <q-card-section class="col items-center">
        <radio-selector />
        <serial-port-selector />
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Cancel" color="primary" v-close-popup />
        <q-btn flat label="Import" color="primary" @click="importFromRadio" v-close-popup />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import RadioSelector from 'components/RadioSelector.vue';
import SerialPortSelector from 'components/SerialPortSelector.vue';


export default defineComponent({
  components: { SerialPortSelector, RadioSelector },

  data() {
    return {
      showDialog: false,
    }
  },

  methods: {
    importFromRadio() {
      window.console.log('import()');
    }
  }
});
</script>