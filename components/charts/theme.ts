export const chart = {
  series1: "#3987e5",
  series2: "#d95926",
  series3: "#199e70",
  grid: "rgba(255,255,255,0.06)",
  axis: "#6f7584",
  ink: "#eceef3",
  ink2: "#a9aebb",
  surface: "#11141b",
  font: 11,
};

export const axisProps = {
  stroke: chart.axis,
  tick: { fill: chart.axis, fontSize: chart.font },
  tickLine: false,
  axisLine: false,
} as const;
