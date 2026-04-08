import { definePreset } from "@primevue/themes";
import Aura from "@primevue/themes/aura";

/**
 * GalaxyPreset — PrimeVue theme aligned with Galaxy / IWC brand.
 *
 * Primary: Hokey Pokey gold (#d0bd2a) with dark (ebony-clay) contrast text.
 * Surface: Chicago grey palette for backgrounds, borders, and dividers.
 */
const GalaxyPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: "#faf8e8",
      100: "#f0ecbe",
      200: "#e3d97e",
      300: "#e1d36b",
      400: "#d8c842",
      500: "#d0bd2a", // hokey-pokey base
      600: "#a19321",
      700: "#736817",
      800: "#4a4210",
      900: "#2a250a",
      950: "#151304",
    },
    colorScheme: {
      light: {
        primary: {
          color: "{primary.500}",
          contrastColor: "#2c3143", // ebony-clay — dark text on gold buttons
          hoverColor: "{primary.600}",
          activeColor: "{primary.700}",
        },
        highlight: {
          background: "{primary.500}",
          focusBackground: "{primary.600}",
          color: "#2c3143",
          focusColor: "#2c3143",
        },
        surface: {
          0: "#ffffff",
          50: "#f5f5f6", // chicago-50
          100: "#e6e6e7", // chicago-100
          200: "#d0d0d1", // chicago-200
          300: "#afafb1", // chicago-300
          400: "#878789", // chicago-400
          500: "#6c6c6e", // chicago-500
          600: "#58585a", // chicago-600
          700: "#4f4e50", // chicago-700
          800: "#3c435c", // ebony-clay-800
          900: "#2c3143", // ebony-clay (dark navy, code block bg etc.)
          950: "#1a1f2e", // darkest navy
        },
      },
    },
  },
});

export default GalaxyPreset;
