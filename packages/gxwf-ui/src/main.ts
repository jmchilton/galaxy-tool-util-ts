import { createApp } from "vue";
import PrimeVue from "primevue/config";
import "primeicons/primeicons.css";
import "./styles/galaxy.css";

import App from "./App.vue";
import router from "./router/index";
import GalaxyPreset from "./theme";

const app = createApp(App);
app.use(router);
app.use(PrimeVue, { theme: { preset: GalaxyPreset } });
app.mount("#app");
