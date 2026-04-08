<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="header-brand">
        <span class="brand-logo">GXWF</span>
        <span class="brand-sub">Galaxy Workflow Dev</span>
      </div>
      <nav class="header-nav">
        <RouterLink to="/" class="nav-link">Workflows</RouterLink>
        <RouterLink to="/files" class="nav-link">Files</RouterLink>
      </nav>
    </header>
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
  font-family: "Atkinson Hyperlegible", system-ui, sans-serif;
  background: var(--gx-grey-50, #f5f5f6);
  color: var(--gx-grey-700, #4f4e50);
}

.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* ── Header ──────────────────────────────────────────────── */

.app-header {
  position: relative;
  height: 52px;
  padding: 0 1.5rem;
  display: flex;
  align-items: center;
  gap: 2rem;
  background: linear-gradient(
    to bottom,
    var(--gx-navy, #2c3143) 0%,
    var(--gx-navy-dark, #1a1f2e) 100%
  );
  border-bottom: 3px solid var(--gx-gold, #d0bd2a);
  z-index: 100;
}

/* Subtle grid overlay — matches IWC header pattern */
.app-header::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(to right, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
  background-size: 24px 24px;
}

.header-brand {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}

.brand-logo {
  font-weight: 700;
  font-size: 1.1rem;
  letter-spacing: 0.08em;
  color: var(--gx-gold, #d0bd2a);
}

.brand-sub {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.45);
  letter-spacing: 0.01em;
}

.header-nav {
  display: flex;
  gap: 0.25rem;
  position: relative;
  z-index: 1;
}

.nav-link {
  text-decoration: none;
  color: rgba(255, 255, 255, 0.65);
  font-size: 0.875rem;
  font-weight: 500;
  padding: 0.3rem 0.75rem;
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
  border-bottom: 2px solid var(--gx-gold, #d0bd2a);
}

/* ── Main content ────────────────────────────────────────── */

.app-main {
  flex: 1;
  padding: 1.5rem;
}
</style>
