import { onBeforeUnmount, onMounted, ref } from "vue";

export type Theme = "light" | "dark";

export function detectTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function useTheme() {
  const theme = ref<Theme>(detectTheme());
  let observer: MutationObserver | null = null;

  onMounted(() => {
    if (typeof MutationObserver === "undefined") return;
    observer = new MutationObserver(() => {
      const next = detectTheme();
      if (next !== theme.value) theme.value = next;
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
  });

  onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;
  });

  return { theme };
}
