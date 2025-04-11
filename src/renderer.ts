import './vue/assets/main.css';

import { createApp } from "vue";
import App from "./vue/App.vue";
import PrimeVue from "primevue/config";
import Aura from "@primeuix/themes/aura";
import { createPinia } from "pinia";
import Tooltip from "primevue/tooltip";
import { useRadioStore } from "./vue/stores/radios";

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      prefix: "p",
      darkModeSelector: "system",
      cssLayer: false,
    },
  },
});

app.directive("tooltip", Tooltip);

await useRadioStore().initialize();

app.mount("#app");
