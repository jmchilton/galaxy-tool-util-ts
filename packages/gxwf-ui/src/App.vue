<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="header-brand">
        <span class="brand-logo">GXWF</span>
      </div>
      <nav class="header-nav">
        <RouterLink to="/" class="nav-link">Workflows</RouterLink>
        <RouterLink to="/files" class="nav-link">Files</RouterLink>
        <a
          href="https://iwc.galaxyproject.org/"
          target="_blank"
          rel="noopener noreferrer"
          class="nav-link external-link"
          v-tooltip.bottom="'Intergalactic Workflow Commission (opens in new tab)'"
        >
          IWC <i class="pi pi-external-link" />
        </a>
      </nav>
      <div class="header-right">
        <button
          class="dark-toggle"
          @click="toggleDark"
          :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          v-tooltip.bottom="isDark ? 'Light mode' : 'Dark mode'"
        >
          <i :class="isDark ? 'pi pi-sun' : 'pi pi-moon'" />
        </button>
      </div>
    </header>
    <main class="app-main">
      <RouterView />
    </main>
    <Toast position="bottom-right" />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { RouterLink, RouterView } from "vue-router";
import Toast from "primevue/toast";

const STORAGE_KEY = "gxwf-dark";
const stored = localStorage.getItem(STORAGE_KEY);
const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
const isDark = ref(stored === null ? prefersDark : stored === "1");

if (isDark.value) document.documentElement.classList.add("dark");

if (stored === null && window.matchMedia) {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (localStorage.getItem(STORAGE_KEY) !== null) return;
    isDark.value = e.matches;
    document.documentElement.classList.toggle("dark", e.matches);
  });
}

function toggleDark() {
  isDark.value = !isDark.value;
  document.documentElement.classList.toggle("dark", isDark.value);
  localStorage.setItem(STORAGE_KEY, isDark.value ? "1" : "0");
}
</script>

<style>
*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: "Atkinson Hyperlegible", system-ui, sans-serif;
  background: var(--gx-grey-50, #f5f5f6);
  color: var(--gx-grey-700, #4f4e50);
}

.dark body {
  background: #1a1f2e;
  color: #e6e6e7;
}

.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* ── Header ──────────────────────────────────────────────── */

.app-header {
  height: 52px;
  padding: 0 var(--gx-sp-6);
  display: flex;
  align-items: center;
  gap: var(--gx-sp-8);
  background: var(--gx-navy, #2c3143);
  border-bottom: 1px solid var(--gx-gold, #d0bd2a);
  z-index: 100;
}

.header-brand {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  flex-shrink: 0;
}

.brand-logo {
  font-weight: 700;
  font-size: 1.1rem;
  letter-spacing: 0.08em;
  color: var(--gx-gold, #d0bd2a);
}

.header-nav {
  display: flex;
  gap: var(--gx-sp-1);
}

.header-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: var(--gx-sp-2);
}

.nav-link {
  text-decoration: none;
  color: rgba(255, 255, 255, 0.65);
  font-size: var(--gx-fs-sm);
  font-weight: 500;
  padding: 0.3rem var(--gx-sp-3);
  border-radius: 4px;
  transition:
    color 0.15s ease,
    background 0.15s ease;
}

.nav-link:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}

.nav-link.router-link-active {
  color: #fff;
  background: rgba(208, 189, 42, 0.18);
}

.external-link {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
}

.external-link .pi {
  font-size: 0.7rem;
  opacity: 0.7;
}

.dark-toggle {
  background: none;
  border: none;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.65);
  font-size: var(--gx-fs-base);
  padding: 0.3rem var(--gx-sp-2);
  border-radius: 4px;
  transition:
    color 0.15s ease,
    background 0.15s ease;
}

.dark-toggle:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}

/* ── Main content ────────────────────────────────────────── */

.app-main {
  flex: 1;
  padding: var(--gx-sp-6);
}
</style>
