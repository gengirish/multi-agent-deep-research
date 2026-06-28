import * as d3 from "d3";

/**
 * Shared D3 chart theme for Chronicle.
 *
 * Centralizes the dark-theme palette, axis/grid colors, a glassy tooltip, and
 * an axis styler so every visualization matches the app's indigo -> sky brand
 * and reads cleanly on the dark surface.
 */

export const CHART = {
  // Categorical palette (indigo -> sky -> cyan -> violet -> pink -> amber)
  categorical: [
    "#818cf8",
    "#38bdf8",
    "#22d3ee",
    "#a78bfa",
    "#f472b6",
    "#fbbf24",
  ],
  // Stable colors for known source / agent types
  byType: {
    web: "#38bdf8",
    papers: "#818cf8",
    news: "#22d3ee",
    unknown: "#64748b",
  } as Record<string, string>,
  bar: "#818cf8",
  barGradient: ["#6366f1", "#38bdf8"] as [string, string],
  axis: "#94a3b8",
  axisStrong: "#cbd5e1",
  grid: "rgba(148, 163, 184, 0.14)",
  label: "#e2e8f0",
  muted: "#64748b",
  success: "#22c55e",
  error: "#ef4444",
} as const;

export const colorForType = (type: string, fallbackIndex = 0): string =>
  CHART.byType[type?.toLowerCase()] ??
  CHART.categorical[fallbackIndex % CHART.categorical.length];

/**
 * Style an axis group: muted tick labels, faint domain/tick lines.
 */
export const styleAxis = (
  axis: d3.Selection<SVGGElement, unknown, null, undefined>,
  { hideDomain = false }: { hideDomain?: boolean } = {}
) => {
  axis.selectAll("text").attr("fill", CHART.axis).style("font-size", "11px");
  axis.selectAll("line").attr("stroke", CHART.grid);
  axis
    .selectAll("path.domain")
    .attr("stroke", hideDomain ? "transparent" : "rgba(148,163,184,0.25)");
};

/**
 * Create (or reuse) a single dark, glassy tooltip appended to <body>.
 * Returns a d3 selection. Callers set .html() and position it.
 */
export const createTooltip = (): d3.Selection<
  HTMLDivElement,
  unknown,
  HTMLElement,
  any
> => {
  d3.select("body").selectAll(".d3-tooltip").remove();
  return d3
    .select("body")
    .append("div")
    .attr("class", "d3-tooltip")
    .style("opacity", "0")
    .style("position", "absolute")
    .style("background", "rgba(15, 23, 42, 0.96)")
    .style("color", "#e2e8f0")
    .style("padding", "10px 12px")
    .style("border", "1px solid rgba(129, 140, 248, 0.35)")
    .style("border-radius", "10px")
    .style("box-shadow", "0 12px 32px rgba(2, 6, 23, 0.6)")
    .style("pointer-events", "none")
    .style("font-size", "12px")
    .style("line-height", "1.5")
    .style("z-index", "1000")
    .style("max-width", "280px")
    .style("backdrop-filter", "blur(6px)") as unknown as d3.Selection<
    HTMLDivElement,
    unknown,
    HTMLElement,
    any
  >;
};

/**
 * Append a left->right linear gradient def and return its url() reference.
 */
export const horizontalBarGradient = (
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  id: string
): string => {
  const grad = svg
    .append("defs")
    .append("linearGradient")
    .attr("id", id)
    .attr("x1", "0%")
    .attr("y1", "0%")
    .attr("x2", "100%")
    .attr("y2", "0%");
  grad
    .append("stop")
    .attr("offset", "0%")
    .attr("stop-color", CHART.barGradient[0]);
  grad
    .append("stop")
    .attr("offset", "100%")
    .attr("stop-color", CHART.barGradient[1]);
  return `url(#${id})`;
};
