let payload = null;
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

function keyFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const gadm = params.get("gadm");
  const outcome = params.get("outcome");
  if (!gadm || !outcome) return "";
  return `${gadm}||${outcome}`;
}

function setQueryForKey(key) {
  const item = detailSeries[key];
  if (!item) return;
  const params = new URLSearchParams(window.location.search);
  params.set("gadm", item.gid_1);
  params.set("outcome", item.outcome);
  const next = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, "", next);
}

function populateDetailSelector(preferredKey) {
  const select = document.getElementById("detail-key");
  const keys = Object.keys(detailSeries).sort();

  if (!keys.length) {
    select.innerHTML = '<option value="">No detail series available</option>';
    return "";
  }

  select.innerHTML = keys
    .map((key) => {
      const item = detailSeries[key];
      return `<option value="${esc(key)}">${esc(item.gid_1)} | ${esc(item.outcome)}</option>`;
    })
    .join("");

  const selected = preferredKey && detailSeries[preferredKey] ? preferredKey : keys[0];
  select.value = selected;
  return selected;
}

function renderDetail(key) {
  const item = detailSeries[key];
  const title = document.getElementById("detail-title");
  if (!item) {
    title.textContent = "GADM Detail";
    predChart = upsertLineChart(predChart, "pred-chart", [], [], chartOptions(0, 1));
    avgChart = upsertLineChart(avgChart, "avg-chart", [], [], chartOptions(0, null));
    rawChart = upsertLineChart(rawChart, "raw-chart", [], [], chartOptions(0, null));
    return;
  }

  title.textContent = `${item.gid_1} | ${item.outcome}`;

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

function bindControls() {
  const select = document.getElementById("detail-key");
  select.addEventListener("change", () => {
    const key = select.value;
    renderDetail(key);
    setQueryForKey(key);
  });
}

function renderFooter() {
  const footer = document.getElementById("footer-meta");
  const generated = payload?.generated_at_utc || "unknown";
  const detailType = payload?.detail_data_type || "unknown";
  footer.textContent = `Generated UTC: ${generated} | Detail FB data type: ${detailType}`;
}

async function init() {
  const response = await fetch("data/latest.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load data/latest.json (${response.status})`);
  }

  payload = await response.json();
  detailSeries = payload?.detail_series || {};

  const selectedKey = populateDetailSelector(keyFromQuery());
  bindControls();
  renderDetail(selectedKey);
  setQueryForKey(selectedKey);
  renderFooter();
}

init().catch((error) => {
  const footer = document.getElementById("footer-meta");
  footer.textContent = `Failed to load detail data: ${error.message}`;
});
