function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]);
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function scale(value, min, max, start, end) {
  if (max === min) return (start + end) / 2;
  return start + ((number(value) - min) / (max - min)) * (end - start);
}

function text(x, y, value, anchor = "start", className = "label") {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" class="${className}">${escapeHtml(value)}</text>`;
}

function barChart(points) {
  const values = points.map((point) => Math.max(number(point.value), 0));
  const max = Math.max(...values, 1);
  return points.map((point, index) => {
    const y = 32 + index * 34;
    const width = scale(Math.max(number(point.value), 0), 0, max, 0, 500);
    return `${text(168, y + 15, point.label, "end")}<rect x="180" y="${y}" width="${width}" height="20" rx="2" class="primary"/>${text(188 + width, y + 15, number(point.value).toLocaleString("ko-KR"))}`;
  }).join("");
}

function stackedChart(points) {
  const totals = points.map((point) => Math.max(number(point.value), 0) + Math.max(number(point.secondaryValue), 0));
  const max = Math.max(...totals, 1);
  return points.map((point, index) => {
    const y = 32 + index * 34;
    const first = scale(Math.max(number(point.value), 0), 0, max, 0, 500);
    const second = scale(Math.max(number(point.secondaryValue), 0), 0, max, 0, 500);
    return `${text(168, y + 15, point.label, "end")}<rect x="180" y="${y}" width="${first}" height="20" rx="2" class="primary"/><rect x="${180 + first}" y="${y}" width="${second}" height="20" rx="2" class="secondary"/>`;
  }).join("");
}

function lineChart(points) {
  const values = points.map((point) => number(point.value));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const coords = points.map((point, index) => ({x: scale(index, 0, Math.max(points.length - 1, 1), 70, 710), y: scale(number(point.value), min, max, 245, 35), point}));
  return `<line x1="70" y1="250" x2="710" y2="250" class="axis"/><polyline points="${coords.map(({x,y}) => `${x},${y}`).join(" ")}" class="line"/>${coords.map(({x,y,point}) => `<circle cx="${x}" cy="${y}" r="5" class="dot"/>${text(x, 274, point.label, "middle")}${text(x, y - 10, number(point.value).toLocaleString("ko-KR"), "middle", "value")}`).join("")}`;
}

function scatterChart(points) {
  const xs = points.map((point) => number(point.value));
  const ys = points.map((point) => number(point.secondaryValue));
  const minX = Math.min(...xs, 0), maxX = Math.max(...xs, 1), minY = Math.min(...ys, 0), maxY = Math.max(...ys, 1);
  return `<line x1="70" y1="250" x2="710" y2="250" class="axis"/><line x1="70" y1="30" x2="70" y2="250" class="axis"/>${points.map((point) => {
    const x = scale(point.value, minX, maxX, 85, 700);
    const y = scale(point.secondaryValue, minY, maxY, 235, 40);
    return `<circle cx="${x}" cy="${y}" r="8" class="dot"/>${text(x + 11, y + 4, point.label)}`;
  }).join("")}`;
}

function rangeChart(points) {
  const lows = points.map((point) => number(point.low));
  const highs = points.map((point) => number(point.high));
  const min = Math.min(...lows, 0), max = Math.max(...highs, 1);
  return points.map((point, index) => {
    const y = 42 + index * 38;
    const low = scale(point.low, min, max, 190, 700);
    const high = scale(point.high, min, max, 190, 700);
    const base = scale(point.value, min, max, 190, 700);
    return `${text(175, y + 5, point.label, "end")}<line x1="${low}" y1="${y}" x2="${high}" y2="${y}" class="range"/><circle cx="${base}" cy="${y}" r="6" class="dot"/>`;
  }).join("");
}

function chartBody(chart, points) {
  if (chart.type === "bar") return barChart(points);
  if (chart.type === "stacked") return stackedChart(points);
  if (chart.type === "line") return lineChart(points);
  if (chart.type === "range") return rangeChart(points);
  return scatterChart(points);
}

export function renderCharts(charts = [], sourceLinks = () => "") {
  return charts.map((chart) => {
    const points = (chart.points || []).slice(0, 8);
    if (!points.length) return "";
    return `<article class="report-chart"><div class="report-chart-head"><div><h3>${escapeHtml(chart.title)}</h3><p>${escapeHtml(chart.note)}</p></div><span>${escapeHtml(chart.unit)}</span></div><svg viewBox="0 0 760 300" role="img" aria-label="${escapeHtml(chart.title)}"><style>.label{font:12px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;fill:#4d5a53}.value{font:10px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;fill:#65716a}.primary{fill:#1f6d5c}.secondary{fill:#d6a13d}.axis{stroke:#aab6af;stroke-width:1}.line{fill:none;stroke:#315f87;stroke-width:3}.dot{fill:#b64d39}.range{stroke:#315f87;stroke-width:6;stroke-linecap:round}</style>${chartBody(chart, points)}</svg><div class="sources">${sourceLinks(chart.sourceRefs)}</div></article>`;
  }).join("");
}
