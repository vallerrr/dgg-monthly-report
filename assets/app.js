let payload = null;
let rows = [];
let detailSeries = {};
let predChart = null;
let avgChart = null;
let rawChart = null;

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function fmt(value, digits = 4) {
  const n = toNumber(value, 0);
  return n.toFixed(digits);
}

function renderCards() {
  const summary = payload?.summary || {};
  const selected = payload?.selected_month?.label || "unknown";
  const cards = [
    { label: "Report Month", value: selected },
    { label: "Rows Exported", value: String(payload?.row_count || 0) },
    { label: "Unique Units", value: String(summary.unique_units || 0) },
    { label: "Missed Units", value: String(summary.missed_units || 0) },
    { label: "Detail Series", value: String(payload?.detail_count || 0) },
  ];

  const container = document.getElementById("summary-cards");
  container.innerHTML = cards
    .map(
      (card) => `<article class="card"><div class="label">${card.label}</div><div class="value">${card.value}</div></article>`,
    )
    .join("");
}

function populateOutcomeFilter() {
  const select = document.getElementById("outcome-filter");
  const outcomes = Array.from(new Set(rows.map((x) => x.outcome))).sort();
  const options = ["all", ...outcomes]
    .map((outcome) => `<option value="${outcome}">${outcome}</option>`)
    .join("");
  select.innerHTML = options;
}

function filteredRows() {
  const outcome = document.getElementById("outcome-filter").value;
  const gid = document.getElementById("gid-filter").value.trim().toLowerCase();
  const minDelta = toNumber(document.getElementById("delta-filter").value, 0);

  return rows.filter((row) => {
    if (outcome !== "all" && row.outcome !== outcome) return false;
    if (gid && !String(row.gid_1).toLowerCase().includes(gid)) return false;
    if (toNumber(row.predicted_change, 0) < minDelta) return false;
    return true;
  });
}

function renderTable() {
  const table = document.getElementById("rows-table");
  const filtered = filteredRows();

  if (!filtered.length) {
    table.innerHTML = '<tr><td colspan="7">No rows match current filters.</td></tr>';
    return;
  }

  table.innerHTML = filtered
    .map((row) => {
      const pct = toNumber(row.percent_change, 0);
      const detailKey = `${row.gid_1}||${row.outcome}`;
      const hasDetail = Boolean(detailSeries[detailKey]);
      const gidCell = hasDetail
        ? `<a href="#detail-panel" class="gadm-link" data-detail-key="${esc(detailKey)}">${esc(row.gid_1)}</a>`
        : esc(row.gid_1);
      return `
        <tr>
          <td>${gidCell}</td>
          <td>${esc(row.outcome)}</td>
          <td>${fmt(row.predicted_current)}</td>
          <td>${fmt(row.predicted_avg)}</td>
          <td>${fmt(row.predicted_change)}</td>
          <td class="${pct >= 0 ? "pos" : ""}">${pct.toFixed(2)}%</td>
          <td>${row.significant_count_12m}</td>
        </tr>
      `;
    })
    .join("");
}

function bindControls() {
  ["outcome-filter", "gid-filter", "delta-filter"].forEach((id) => {
    const element = document.getElementById(id);
    element.addEventListener("input", renderTable);
    element.addEventListener("change", renderTable);
  });

  const detailKey = document.getElementById("detail-key");
  detailKey.addEventListener("input", renderDetail);
  detailKey.addEventListener("change", renderDetail);

  const table = document.getElementById("rows-table");
  table.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const link = target.closest("[data-detail-key]");
    if (!link) return;
    event.preventDefault();

    const key = link.getAttribute("data-detail-key") || "";
    const select = document.getElementById("detail-key");
    if (!key || !detailSeries[key]) return;

    select.value = key;
    renderDetail();
    document.getElementById("detail-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function renderFooter() {
  const footer = document.getElementById("footer-meta");
  const generated = payload?.generated_at_utc || "unknown";
  const detailType = payload?.detail_data_type || "unknown";
  footer.textContent = `Generated UTC: ${generated} | Detail FB data type: ${detailType}`;
}

function toPointList(labels, values) {
  if (!Array.isArray(labels) || !Array.isArray(values)) return [];
  return labels.map((label, idx) => ({ x: label, y: toNumber(values[idx], 0) }));
}

function chartOptions(yMin = 0, yMax = null) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true,
        min: yMin,
        ...(yMax === null ? {} : { max: yMax }),
      },
    },
    plugins: {
      legend: {
        display: true,
      },
    },
  };
}

function upsertLineChart(existingChart, canvasId, labels, datasets, options) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return existingChart;

  const cfg = {
    type: "line",
    data: {
      labels,
      datasets,
    },
    options,
  };

  if (existingChart) {
    existingChart.data = cfg.data;
    existingChart.options = cfg.options;
    existingChart.update();
    return existingChart;
  }

  return new Chart(canvas.getContext("2d"), cfg);
}

function populateDetailSelector() {
  const select = document.getElementById("detail-key");
  const keys = Object.keys(detailSeries).sort();
  if (!keys.length) {
    select.innerHTML = '<option value="">No detail series available</option>';
    return;
  }

  const options = ['<option value="">Select from table or dropdown...</option>'];
  keys.forEach((key) => {
    const item = detailSeries[key];
    options.push(`<option value="${esc(key)}">${esc(item.gid_1)} | ${esc(item.outcome)}</option>`);
  });
  select.innerHTML = options.join("");
}

function renderDetail() {
  const select = document.getElementById("detail-key");
  const key = select.value;
  const item = detailSeries[key];

  const detailContent = document.getElementById("detail-content");

  if (!item) {
    detailContent?.classList.add("hidden");
    predChart = upsertLineChart(predChart, "pred-chart", [], [], chartOptions(0, 1));
    avgChart = upsertLineChart(avgChart, "avg-chart", [], [], chartOptions(0, null));
    rawChart = upsertLineChart(rawChart, "raw-chart", [], [], chartOptions(0, null));
    return;
  }

  detailContent?.classList.remove("hidden");

  const pred = item.prediction || {};
  predChart = upsertLineChart(
    predChart,
    "pred-chart",
    pred.labels || [],
    [
      {
        label: "Predicted",
        data: pred.values || [],
        borderColor: "#2f6feb",
        pointBackgroundColor: pred.point_colors || [],
        tension: 0.15,
      },
    ],
    chartOptions(0, 1),
  );

  const avg = item.averaged_fb || {};
  avgChart = upsertLineChart(
    avgChart,
    "avg-chart",
    avg.labels || [],
    [
      { label: "All", data: avg.all || [], borderColor: "#1f77b4", tension: 0.15 },
      { label: "Men", data: avg.men || [], borderColor: "#2ca02c", tension: 0.15 },
      { label: "Women", data: avg.women || [], borderColor: "#d62728", tension: 0.15 },
    ],
    chartOptions(0, null),
  );

  const raw = item.raw_fb || {};
  rawChart = upsertLineChart(
    rawChart,
    "raw-chart",
    raw.labels || [],
    [
      { label: "All", data: raw.all || [], borderColor: "#1f77b4", tension: 0.15 },
      { label: "Men", data: raw.men || [], borderColor: "#2ca02c", tension: 0.15 },
      { label: "Women", data: raw.women || [], borderColor: "#d62728", tension: 0.15 },
    ],
    chartOptions(0, null),
  );
}

async function init() {
  const response = await fetch("data/latest.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load data/latest.json (${response.status})`);
  }

  payload = await response.json();
  rows = payload?.rows || [];
  detailSeries = payload?.detail_series || {};

  renderCards();
  populateOutcomeFilter();
  populateDetailSelector();
  bindControls();
  renderTable();
  renderDetail();
  renderFooter();
}

init().catch((error) => {
  const table = document.getElementById("rows-table");
  table.innerHTML = `<tr><td colspan="7">Failed to load report data: ${error.message}</td></tr>`;
});
