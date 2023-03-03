<template>
  <q-dialog v-model="showDialog">
    <q-card style="width: 500px">
      <q-card-section class="col items-center">
        <q-linear-progress :value="progress" class="q-mt-md" />
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Cancel" color="primary" @click="$emit('cancelled')"  v-close-popup />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
const electron = window.require('electron');

export default defineComponent({
  data() {
    return {
      showDialog: this.show,
      progress: 0,
    }
  },

  props: {
    show: {
      type: Boolean,
      required: true,
    }
  },

  mounted() {
    electron.ipcRenderer.on('radioImportProgress', (_event, value)=>{
      this.progress = value;
    });
  },

  emits: ['cancelled'],
});
</script>