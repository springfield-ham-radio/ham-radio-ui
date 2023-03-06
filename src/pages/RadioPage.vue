<template>
  <q-page class="">
    <div class="q-pa-md row items-center justify-between" style="font-size: 24px">
      <div>Radio</div>
      <div>
        <q-btn class="q-mr-md" round color="primary" @click="save" icon="save" :disable="program == undefined">
          <q-tooltip>
            Save program to file
          </q-tooltip>
       </q-btn>
        <radio-import-dialog @import-from-radio="importFromRadio"/>
      </div>
    </div>

    <div class="q-pa-md q-gutter-sm">
      <q-dialog v-model="importing">
        <q-card style="width: 500px">
          <q-card-section class="col items-center">
            Importing from {{ radioConnection?.model }}
            <q-linear-progress instant-feedback :value="progress" class="q-mt-md" />
          </q-card-section>

          <q-card-actions align="right">
            <q-btn label="Cancel" color="primary" @click="cancelImport"  v-close-popup />
          </q-card-actions>
        </q-card>
      </q-dialog>
      <q-table v-if="program" title="Channels" :rows="program.channels" :columns="columns" row-key="name" dense :pagination="pagination" />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted, ref, toRaw } from 'vue';
import { RadioConnection, RadioProgram } from '@springfield/ham-radio-api';
import RadioImportDialog from 'src/components/radio/RadioImportDialog.vue';
import { formatFrequency } from 'src/utils/frequency';

const importing = ref(false);
const program = ref<RadioProgram>();
const progress = ref(0);
const radioConnection = ref<RadioConnection>();
const pagination = { rowsPerPage: 20};

const columns = [
  { name: 'number', required: true, label: 'Number', align: 'left', field: (row) => row.channelNumber, sortable: true },
  { name: 'name', required: true, label: 'Name', align: 'left', field: (row) => row.radioChannel.name, sortable: true },
  { name: 'tx', required: true, label: 'TX Frequency', align: 'left', field: (row) => row.radioChannel.transmitFrequency, sortable: true, format: val => formatFrequency(val) },
  { name: 'rx', required: true, label: 'RX Frequency', align: 'left', field: (row) => row.radioChannel.receiveFrequency, sortable: true, format: val => formatFrequency(val) },
  { name: 'tx-tone', required: true, label: 'TX Tone', align: 'left', field: (row) => row.radioChannel.transmitTone, sortable: true },
  { name: 'rx-tone', required: true, label: 'RX Tone', align: 'left', field: (row) => row.radioChannel.receiveTone, sortable: true },
];

function importFromRadio(connection: RadioConnection) {
  radioConnection.value = connection;
  importing.value = true;
  window.radio.importFromRadio(toRaw(connection));
};

function cancelImport() {
  window.radio.cancelImport();
};

async function save() {
  await window.radio.save(toRaw(program.value));
}
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
