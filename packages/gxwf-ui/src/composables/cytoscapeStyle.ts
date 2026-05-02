export type CytoscapeTheme = "light" | "dark";

interface ThemeColors {
  nodeLabel: string;
  inputFill: string;
  runnableFill: string;
  edge: string;
  arrow: string;
  mapover: string;
  reduction: string;
}

const LIGHT: ThemeColors = {
  nodeLabel: "#1f2937",
  inputFill: "#d0bb46",
  runnableFill: "#2c3143",
  edge: "#6b7280",
  arrow: "#6b7280",
  mapover: "#5a8",
  reduction: "#a55",
};

const DARK: ThemeColors = {
  nodeLabel: "#e5e7eb",
  inputFill: "#d0bb46",
  runnableFill: "#4c5574",
  edge: "#9ca3af",
  arrow: "#9ca3af",
  mapover: "#5a8",
  reduction: "#a55",
};

export function cytoscapeStyle(theme: CytoscapeTheme): unknown[] {
  const c = theme === "dark" ? DARK : LIGHT;
  return [
    {
      selector: "node",
      style: {
        label: "data(label)",
        color: c.nodeLabel,
        "text-outline-color": theme === "dark" ? "#1a1f2e" : "#ffffff",
        "text-outline-width": 2,
        "font-size": 12,
      },
    },
    {
      selector: "edge",
      style: {
        "curve-style": "bezier",
        "target-arrow-shape": "vee",
        "arrow-scale": 1.6,
        "line-color": c.edge,
        "target-arrow-color": c.arrow,
        width: 2,
      },
    },
    { selector: ".input", style: { shape: "diamond", "background-color": c.inputFill } },
    {
      selector: ".runnable",
      style: { shape: "round-rectangle", "background-color": c.runnableFill },
    },
    { selector: "edge.mapover_1", style: { width: 4, "line-color": c.mapover } },
    { selector: "edge.mapover_2", style: { width: 6, "line-color": c.mapover } },
    { selector: "edge.mapover_3", style: { width: 8, "line-color": c.mapover } },
    {
      selector: "edge.reduction",
      style: {
        "line-style": "dashed",
        "line-color": c.reduction,
        "target-arrow-shape": "tee",
        "target-arrow-color": c.reduction,
      },
    },
  ];
}
