import { createApp } from "vue";
import PrimeVue from "primevue/config";
import Aura from "@primevue/themes/aura";
import "primeicons/primeicons.css";

import App from "./App.vue";
import router from "./router/index";

const app = createApp(App);
app.use(router);
app.use(PrimeVue, { theme: { preset: Aura } });
app.mount("#app");
