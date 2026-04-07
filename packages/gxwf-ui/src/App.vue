<template>
  <div class="app-shell">
    <nav class="app-nav">
      <RouterLink to="/">Workflows</RouterLink>
      <RouterLink to="/files">Files</RouterLink>
    </nav>
    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { RouterLink, RouterView } from "vue-router";
</script>

<style>
*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: var(--p-font-family, system-ui, sans-serif);
  background: var(--p-surface-ground, #f8f9fa);
  color: var(--p-text-color, #333);
}

.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-nav {
  background: var(--p-surface-card, #fff);
  border-bottom: 1px solid var(--p-surface-border, #dee2e6);
  padding: 0.75rem 1.5rem;
  display: flex;
  gap: 1.5rem;
}

.app-nav a {
  text-decoration: none;
  color: var(--p-text-color-secondary, #6c757d);
  font-weight: 500;
}

.app-nav a.router-link-active {
  color: var(--p-primary-color, #3b82f6);
}

.app-main {
  flex: 1;
  padding: 1.5rem;
}
</style>
