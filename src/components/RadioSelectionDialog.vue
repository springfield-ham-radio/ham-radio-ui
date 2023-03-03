<template>
  <q-btn round color="primary" icon="input" @click="showDialog = true">
    <q-tooltip>
      Import from radio
    </q-tooltip>
  </q-btn>

  <q-dialog v-model="showDialog">
    <q-card style="width: 500px">
      <q-card-section class="col items-center">
        <radio-selector @radio-selected="updateRadioSelection"/>
        <serial-port-selector @port-selected="updateSerialPort"/>
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

interface RadioModel {
  id: string,
  name: string,
  manufacturerId: string,
}

export default defineComponent({
  components: { SerialPortSelector, RadioSelector },

  data() {
    return {
      showDialog: false,
      radioConnection: {
        serialPortPath: '',
        model: {},
      },
    }
  },

  emits: ['radioSelected'],

  methods: {
    async updateSerialPort(path: string) {
      this.radioConnection.serialPortPath = path;
      await window.serialport.reset(path.path);
    },

    updateRadioSelection(model: RadioModel) {
      this.radioConnection.model = model;
    },

    importFromRadio() {
      this.$emit('radioSelected', this.radioConnection);
    }
  }
});
</script>
