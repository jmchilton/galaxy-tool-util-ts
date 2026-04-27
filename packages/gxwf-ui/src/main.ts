import { createApp } from "vue";
import PrimeVue from "primevue/config";
import Tooltip from "primevue/tooltip";
import ToastService from "primevue/toastservice";
import ConfirmationService from "primevue/confirmationservice";
import "primeicons/primeicons.css";
import "./styles/galaxy.css";

import App from "./App.vue";
import router from "./router/index";
import GalaxyPreset from "./theme";

const app = createApp(App);
app.use(router);
app.use(PrimeVue, { theme: { preset: GalaxyPreset, options: { darkModeSelector: ".dark" } } });
app.use(ToastService);
app.use(ConfirmationService);
app.directive("tooltip", Tooltip);
app.mount("#app");
