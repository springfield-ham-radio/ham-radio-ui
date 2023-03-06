<template>
  <q-layout view="lHh Lpr lFf">
    <q-header elevated>
      <q-toolbar>
        <q-btn
          flat
          dense
          round
          icon="menu"
          aria-label="Menu"
          @click="toggleLeftDrawer"
        />

        <q-toolbar-title> Ham Delux </q-toolbar-title>

        <div>{{ "1.0.0" }}</div>
      </q-toolbar>
    </q-header>

    <q-drawer v-model="leftDrawerOpen" show-if-above bordered>
      <q-list>
        <q-item clickable v-ripple v-for="route in routes" :key="route.path" :to="route.path">
          <q-item-section>{{ route.name }}</q-item-section>
        </q-item>
      </q-list>
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script lang="ts">
import { RadioManufacturer, RadioModel } from '@springfield/ham-radio-api';
import { useRadioStore } from 'src/stores/radio-store';
import { defineComponent, ref } from 'vue';
import { useRouter } from 'vue-router';

export default defineComponent({
  name: 'MainLayout',


  setup() {
    const leftDrawerOpen = ref(false);
    window.electronAPI.onManufacturers((_event: unknown, value: RadioManufacturer[]) => {
      useRadioStore().manufacturers = value;
    });

    window.electronAPI.onModels((_event: unknown, value: RadioModel[]) => {
      useRadioStore().models = value;
    });

    return {
      routes: useRouter().options.routes[0].children,
      leftDrawerOpen,
      toggleLeftDrawer() {
        leftDrawerOpen.value = !leftDrawerOpen.value;
      },
    };
  },
});
</script>
