import { describe, it, expect } from "vitest";
import gxwfDark from "../src/editor/themes/gxwf-dark.json";
import gxwfLight from "../src/editor/themes/gxwf-light.json";

// Chrome keys we explicitly brand per THEME_OVERHAUL_PLAN §3. VS Code silently
// ignores unknown keys and falls back to the ui-theme default for missing ones,
// so this assertion is our only guard against a typo or a dropped entry.
const REQUIRED_CHROME_KEYS = [
  "editor.background",
  "editor.foreground",
  "editor.lineHighlightBackground",
  "editor.selectionBackground",
  "editor.inactiveSelectionBackground",
  "editorCursor.foreground",
  "editorLineNumber.foreground",
  "editorLineNumber.activeForeground",
  "editorIndentGuide.background1",
  "editorIndentGuide.activeBackground1",
  "editorWhitespace.foreground",
  "editorBracketMatch.background",
  "editorBracketMatch.border",
  "editorError.foreground",
  "editorWarning.foreground",
  "editorInfo.foreground",
  "editorWidget.background",
  "editorWidget.border",
  "editorHoverWidget.background",
  "editorHoverWidget.border",
  "editorSuggestWidget.background",
  "editorSuggestWidget.foreground",
  "editorSuggestWidget.selectedBackground",
  "editorSuggestWidget.highlightForeground",
  "focusBorder",
  "scrollbarSlider.background",
  "scrollbarSlider.hoverBackground",
  "scrollbarSlider.activeBackground",
  "foreground",
  "errorForeground",
];

interface TokenColor {
  name?: string;
  scope: string | string[];
  settings: { foreground?: string; fontStyle?: string };
}

interface Theme {
  name: string;
  type: "dark" | "light";
  colors: Record<string, string>;
  tokenColors: TokenColor[];
}

function findTokenRuleForScope(theme: Theme, scope: string): TokenColor | undefined {
  return theme.tokenColors.find((rule) => {
    const scopes = Array.isArray(rule.scope) ? rule.scope : [rule.scope];
    return scopes.includes(scope);
  });
}

function assertThemeShape(theme: Theme, expectedType: "dark" | "light"): void {
  expect(theme.type).toBe(expectedType);
  for (const key of REQUIRED_CHROME_KEYS) {
    expect(theme.colors[key], `missing chrome key: ${key}`).toMatch(/^#[0-9a-f]{6,8}$/i);
  }
}

describe("gxwf-dark theme", () => {
  const theme = gxwfDark as unknown as Theme;

  it("has type 'dark' and every required chrome key", () => {
    assertThemeShape(theme, "dark");
  });

  it("renders YAML keys in gold-bold", () => {
    const rule = findTokenRuleForScope(theme, "entity.name.tag.yaml");
    expect(rule?.settings.foreground?.toLowerCase()).toBe("#d0bd2a");
    expect(rule?.settings.fontStyle).toBe("bold");
  });

  it("renders JSON keys in gold-bold", () => {
    const rule = findTokenRuleForScope(theme, "support.type.property-name.json");
    expect(rule?.settings.foreground?.toLowerCase()).toBe("#d0bd2a");
    expect(rule?.settings.fontStyle).toBe("bold");
  });
});

describe("gxwf-light theme", () => {
  const theme = gxwfLight as unknown as Theme;

  it("has type 'light' and every required chrome key", () => {
    assertThemeShape(theme, "light");
  });

  it("renders YAML keys in deep-gold-bold", () => {
    const rule = findTokenRuleForScope(theme, "entity.name.tag.yaml");
    expect(rule?.settings.foreground?.toLowerCase()).toBe("#736817");
    expect(rule?.settings.fontStyle).toBe("bold");
  });

  it("renders JSON keys in deep-gold-bold", () => {
    const rule = findTokenRuleForScope(theme, "support.type.property-name.json");
    expect(rule?.settings.foreground?.toLowerCase()).toBe("#736817");
    expect(rule?.settings.fontStyle).toBe("bold");
  });
});
