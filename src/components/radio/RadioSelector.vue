<template>
  <q-select class="col" outlined label="Manufacturer" v-model="manufacturer" :options="manufacturers" option-label="name" />
  <q-select class="col" outlined label="Model" v-model="model" :options="filteredModels" option-label="name" />
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { useRadiosStore } from 'stores/radios-store';

interface Manufacturer {
  id: string;
  name: string;
}

export default defineComponent({
  name: 'RadioSelector',

  data () {
    return {
      ...useRadiosStore(),
      manufacturer: undefined,
      model: undefined,
    };
  },

  emits: ['radioSelected'],

  computed: {
    filteredModels() {
      if (this.manufacturer == undefined) {
        return [];
      }

      const manufacturer: Manufacturer = this.manufacturer;
      return this.models.filter((model) => model.manufacturerId == manufacturer.id);
    }
  },

  watch: {
    manufacturer() {
      this.model = undefined;
    },

    model(value) {
      this.$emit('radioSelected', value);
    }
  }
});
</script>
