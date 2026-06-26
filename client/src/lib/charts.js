/**
 * Lightweight SVG chart library for 1ai-ads dashboards.
 * No external dependencies — pure DOM + SVG.
 */

export function renderBarChart(container, { labels, datasets, width = 500, height = 260, title } = {}) {
  const svg = createSvg(width, height);
  const padding = { top: 30, right: 20, bottom: 40, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const allValues = datasets.flatMap(d => d.data);
  const maxVal = Math.max(1, ...allValues);
  const barGroupWidth = chartW / labels.length;
  const barWidth = Math.max(4, (barGroupWidth / datasets.length) - 4);

  if (title) addText(svg, width / 2, 16, title, { anchor: 'middle', size: 13, weight: 'bold', fill: '#c9d1d9' });

  // Y axis labels
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + chartH - (chartH * i / 4);
    addText(svg, padding.left - 8, y + 4, formatNumber(maxVal * i / 4), { anchor: 'end', size: 10, fill: '#8b949e' });
    addLine(svg, padding.left, y, width - padding.right, y, { stroke: '#21262d', strokeWidth: 1 });
  }

  datasets.forEach((ds, di) => {
    ds.data.forEach((val, i) => {
      const x = padding.left + i * barGroupWidth + di * (barWidth + 4) + 4;
      const barH = (val / maxVal) * chartH;
      const y = padding.top + chartH - barH;
      addRect(svg, x, y, barWidth, barH, { fill: ds.color || '#58a6ff', rx: 3 });
    });
  });

  labels.forEach((label, i) => {
    const x = padding.left + i * barGroupWidth + barGroupWidth / 2;
    addText(svg, x, height - 8, label, { anchor: 'middle', size: 10, fill: '#8b949e' });
  });

  container.appendChild(svg);
  return svg;
}

export function renderLineChart(container, { labels, datasets, width = 500, height = 260, title } = {}) {
  const svg = createSvg(width, height);
  const padding = { top: 30, right: 20, bottom: 40, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const allValues = datasets.flatMap(d => d.data);
  const maxVal = Math.max(1, ...allValues);

  if (title) addText(svg, width / 2, 16, title, { anchor: 'middle', size: 13, weight: 'bold', fill: '#c9d1d9' });

  for (let i = 0; i <= 4; i++) {
    const y = padding.top + chartH - (chartH * i / 4);
    addText(svg, padding.left - 8, y + 4, formatNumber(maxVal * i / 4), { anchor: 'end', size: 10, fill: '#8b949e' });
    addLine(svg, padding.left, y, width - padding.right, y, { stroke: '#21262d', strokeWidth: 1 });
  }

  datasets.forEach(ds => {
    const points = ds.data.map((val, i) => {
      const x = padding.left + (i / Math.max(1, labels.length - 1)) * chartW;
      const y = padding.top + chartH - (val / maxVal) * chartH;
      return `${x},${y}`;
    });
    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', points.join(' '));
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', ds.color || '#58a6ff');
    polyline.setAttribute('stroke-width', '2');
    svg.appendChild(polyline);

    ds.data.forEach((val, i) => {
      const x = padding.left + (i / Math.max(1, labels.length - 1)) * chartW;
      const y = padding.top + chartH - (val / maxVal) * chartH;
      addCircle(svg, x, y, 3, { fill: ds.color || '#58a6ff' });
    });
  });

  labels.forEach((label, i) => {
    const x = padding.left + (i / Math.max(1, labels.length - 1)) * chartW;
    if (i % Math.ceil(labels.length / 8) === 0 || i === labels.length - 1) {
      addText(svg, x, height - 8, label, { anchor: 'middle', size: 10, fill: '#8b949e' });
    }
  });

  container.appendChild(svg);
  return svg;
}

export function renderDonutChart(container, { labels, data, colors, width = 260, height = 260, title } = {}) {
  const svg = createSvg(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 20;
  const inner = radius * 0.55;
  const total = Math.max(1, data.reduce((s, v) => s + v, 0));

  if (title) addText(svg, width / 2, 14, title, { anchor: 'middle', size: 12, weight: 'bold', fill: '#c9d1d9' });

  let startAngle = -Math.PI / 2;
  data.forEach((val, i) => {
    const angle = (val / total) * Math.PI * 2;
    const endAngle = startAngle + angle;
    const largeArc = angle > Math.PI ? 1 : 0;

    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy + radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(endAngle);
    const y2 = cy + radius * Math.sin(endAngle);
    const ix1 = cx + inner * Math.cos(endAngle);
    const iy1 = cy + inner * Math.sin(endAngle);
    const ix2 = cx + inner * Math.cos(startAngle);
    const iy2 = cy + inner * Math.sin(startAngle);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${inner} ${inner} 0 ${largeArc} 0 ${ix2} ${iy2} Z`);
    path.setAttribute('fill', (colors && colors[i]) || COLORS[i % COLORS.length]);
    path.setAttribute('stroke', '#0d1117');
    path.setAttribute('stroke-width', '2');
    svg.appendChild(path);
    startAngle = endAngle;
  });

  addText(svg, cx, cy - 4, formatNumber(total), { anchor: 'middle', size: 16, weight: 'bold', fill: '#fff' });
  addText(svg, cx, cy + 14, 'total', { anchor: 'middle', size: 10, fill: '#8b949e' });

  container.appendChild(svg);

  // Legend
  const legend = document.createElement('div');
  legend.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;justify-content:center;';
  labels.forEach((label, i) => {
    legend.innerHTML += `<span style="display:flex;align-items:center;gap:4px;font-size:11px;color:#8b949e;"><span style="width:10px;height:10px;border-radius:2px;background:${(colors && colors[i]) || COLORS[i % COLORS.length]};display:inline-block;"></span>${esc(label)}</span>`;
  });
  container.appendChild(legend);

  return svg;
}

export function renderSparkline(container, values, { color = '#58a6ff', width = 120, height = 32 } = {}) {
  const svg = createSvg(width, height);
  if (!values.length) { container.appendChild(svg); return svg; }
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const range = max - min || 1;
  const points = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });
  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('points', points.join(' '));
  polyline.setAttribute('fill', 'none');
  polyline.setAttribute('stroke', color);
  polyline.setAttribute('stroke-width', '1.5');
  svg.appendChild(polyline);
  container.appendChild(svg);
  return svg;
}

// --- Helpers ---

const COLORS = ['#58a6ff', '#3fb950', '#f78166', '#d2a8ff', '#79c0ff', '#ffa657', '#7ee787', '#ff7b72'];

function createSvg(w, h) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', h);
  return svg;
}

function addText(svg, x, y, text, { anchor = 'start', size = 12, weight = 'normal', fill = '#c9d1d9' } = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  el.setAttribute('x', x);
  el.setAttribute('y', y);
  el.setAttribute('text-anchor', anchor);
  el.setAttribute('font-size', size);
  el.setAttribute('font-weight', weight);
  el.setAttribute('fill', fill);
  el.textContent = text;
  svg.appendChild(el);
}

function addLine(svg, x1, y1, x2, y2, { stroke = '#30363d', strokeWidth = 1 } = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  el.setAttribute('x1', x1); el.setAttribute('y1', y1);
  el.setAttribute('x2', x2); el.setAttribute('y2', y2);
  el.setAttribute('stroke', stroke); el.setAttribute('stroke-width', strokeWidth);
  svg.appendChild(el);
}

function addRect(svg, x, y, w, h, { fill = '#58a6ff', rx = 0 } = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  el.setAttribute('x', x); el.setAttribute('y', y);
  el.setAttribute('width', w); el.setAttribute('height', h);
  el.setAttribute('fill', fill); el.setAttribute('rx', rx);
  svg.appendChild(el);
}

function addCircle(svg, cx, cy, r, { fill = '#58a6ff' } = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  el.setAttribute('cx', cx); el.setAttribute('cy', cy); el.setAttribute('r', r);
  el.setAttribute('fill', fill);
  svg.appendChild(el);
}

function formatNumber(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return Math.round(n).toString();
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
