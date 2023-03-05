<template>
  <q-page class="">
    <div class="q-pa-md row items-center justify-between" style="font-size: 24px">
      <div>Radio</div>
      <radio-selection-dialog @radio-selected="importFromRadio"/>
    </div>

    <div class="q-pa-md q-gutter-sm">
      <q-dialog v-model="importing">
        <q-card style="width: 500px">
          <q-card-section class="col items-center">
            Importing from {{ radioConnection ? radioConnection.model.modelName : 'UNKNOWN' }}
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

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RadioConnection, RadioProgram } from '@springfield/ham-radio-api';
import RadioSelectionDialog from 'src/components/radio/RadioSelectionDialog.vue';
import { formatFrequency } from 'src/utils/frequency';

const importing = ref(false);
const program = ref<RadioProgram<void>>();
const progress = ref(0);
const radioConnection = ref<RadioConnection>();

const columns = [
  { name: 'number', required: true, label: 'Number', align: 'left', field: (row) => row.channelNumber, sortable: true },
  { name: 'name', required: true, label: 'Name', align: 'left', field: (row) => row.radioChannel.channelName, sortable: true },
  { name: 'tx', required: true, label: 'TX Frequency', align: 'left', field: (row) => row.radioChannel.transmitFrequency, sortable: true, format: val => formatFrequency(val) },
  { name: 'rx', required: true, label: 'RX Frequency', align: 'left', field: (row) => row.radioChannel.receiveFrequency, sortable: true, format: val => formatFrequency(val) },
  { name: 'tx-tone', required: true, label: 'TX Tone', align: 'left', field: (row) => row.radioChannel.transmitTone, sortable: true },
  { name: 'rx-tone', required: true, label: 'RX Tone', align: 'left', field: (row) => row.radioChannel.receiveTone, sortable: true },
];

function importFromRadio(connection: RadioConnection) {
  radioConnection.value = connection;
  importing.value = true;
  window.radio.importFromRadio(connection.serialPortPath);
};

 function cancelImport() {
   window.radio.cancelImport();
};

onMounted(() => {
  window.electronAPI.onRenderRadioProgram((_event, value) => {
    importing.value = false;

    if (value != null) {
      program.value = value;
    }
  });

  window.electronAPI.onRadioProgressIndicator((_event, value) => {
    progress.value = value;
  });
});

</script>
