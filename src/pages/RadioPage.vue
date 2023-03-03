<template>
  <q-page class="">
    <h1>Radio</h1>
    <div class="q-pa-md q-gutter-sm">
      <radio-selection-dialog @radio-selected="importFromRadio"/>
      <q-dialog v-model="importing">
        <q-card style="width: 500px">
          <q-card-section class="col items-center">
            Importing from {{ radioConnection.model.name }}
            <q-linear-progress instant-feedback :value="progress" class="q-mt-md" />
          </q-card-section>

          <q-card-actions align="right">
            <q-btn flat label="Cancel" color="primary" @click="cancelImport"  v-close-popup />
          </q-card-actions>
        </q-card>
      </q-dialog>
      <q-table v-if="program" title="Channels" :rows="program.channels" :columns="columns" row-key="name" />
    </div>
  </q-page>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import RadioSelectionDialog from 'src/components/radio/RadioSelectionDialog.vue';

interface RadioModel {
  id: string,
  name: string,
  manufacturerId: string,
}

interface RadioConnection {
  serialPortPath: string,
  model: RadioModel,
}

export default defineComponent({
  name: 'ChannelsPage',
  components: { RadioSelectionDialog },

  data() {
    return {
      radioConnection: { model: { name: 'UNKNOWN' } },
      importing: false,
      progress: 0,
      program: null,
      columns: [
        { name: 'number', required: true, label: 'Number', align: 'left', field: (row) => row.channelNumber, sortable: true },
        { name: 'name', required: true, label: 'Name', align: 'left', field: (row) => row.radioChannel.channelName, sortable: true },
        { name: 'tx', required: true, label: 'TX Frequency', align: 'left', field: (row) => row.radioChannel.transmitFrequency, sortable: true, format: val => `${val/1000000}` },
        { name: 'rx', required: true, label: 'RX Frequency', align: 'left', field: (row) => row.radioChannel.receiveFrequency, sortable: true, format: val => `${val/1000000}` },
        { name: 'tx-tone', required: true, label: 'TX Tone', align: 'left', field: (row) => row.radioChannel.transmitTone, sortable: true },
        { name: 'rx-tone', required: true, label: 'RX Tone', align: 'left', field: (row) => row.radioChannel.receiveTone, sortable: true },
      ],
    }
  },

  mounted() {
    window.electronAPI.onRenderRadioProgram((_event, program) => {
      this.importing = false;
      this.program = program;
    });

    window.electronAPI.onRadioProgressIndicator((_event, progress) => this.progress = progress);
  },

  methods: {
    async importFromRadio(radioConnection: RadioConnection) {
      this.radioConnection = radioConnection;
      window.console.log(radioConnection.serialPortPath);
      this.importing = true;
      window.radio.importFromRadio(radioConnection.serialPortPath.path);
    },

    cancelImport() {
      window.console.log('cancelImport()');
    }
  }
});
</script>
