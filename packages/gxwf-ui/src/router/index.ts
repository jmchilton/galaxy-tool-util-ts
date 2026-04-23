import { createRouter, createWebHistory } from "vue-router";
import DashboardView from "../views/DashboardView.vue";

// Route-level lazy-load for WorkflowView (pulls Mermaid) and FileView (pulls
// Monaco + @codingame/vscode-api when VITE_GXWF_MONACO=1). Dashboard stays
// eager since it's the landing route.
export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: DashboardView },
    { path: "/workflow/:path(.*)", component: () => import("../views/WorkflowView.vue") },
    { path: "/files/:path(.*)?", component: () => import("../views/FileView.vue") },
  ],
});
