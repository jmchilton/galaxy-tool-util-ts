import { createRouter, createWebHistory } from "vue-router";
import DashboardView from "../views/DashboardView.vue";
import WorkflowView from "../views/WorkflowView.vue";
import FileView from "../views/FileView.vue";

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: DashboardView },
    { path: "/workflow/:path(.*)", component: WorkflowView },
    { path: "/files/:path(.*)?", component: FileView },
  ],
});
