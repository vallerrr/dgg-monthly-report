// DGG national outliers: reads data/index.json, data/national/<YYYY-MM>.json (per month: summary, counts, country
// table) and data/national/series.json (whole history per country), written by dgg_pipeline stage national_outliers
// and src/report_web/national_payload.py

const KIND_LABEL = { fb: "FB counts", model: "Model outputs" };
const state = { kind: "fb", index: null, month: null, payload: null, series: null, country: null, chart: null };

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("data-") || k.startsWith("aria-") || k === "scope") node.setAttribute(k, v);
    else node[k] = v;
  }
  for (const c of children.flat()) if (c != null) node.append(c);
  return node;
};
const pctDev = (d) => (d == null ? "–" : `${d > 0 ? "+" : ""}${(d * 100).toFixed(1)}%`);
const fmt = (v) => (v == null ? "–" : Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-GB") : v.toFixed(3));
const css = (name) => getComputedStyle(document.body).getPropertyValue(name).trim();
const shortVar = (v) => v.replace(/^FB_age_18_plus_/, "18+ ").replace(/^FB_all$/, "all ages");

async function getJSON(path) {
  try {
    const r = await fetch(path, { cache: "no-store" });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- summary cards
function renderCards() {
  const box = document.getElementById("nat-cards");
  box.replaceChildren();
  for (const kind of ["fb", "model"]) {
    const b = state.payload[kind], s = b.summary;
    if (!s) continue;
    const t = b.thresholds;
    const card = el("div", { class: "card" },
      el("div", { class: "label" }, `${KIND_LABEL[kind]} · ${state.payload.selected_month.label}`),
      el("div", { class: "value" }, s.between_flag ? "Between-country outlier" : s.n_within ? `${s.n_within} within-country` : "No outliers"),
      el("div", { class: "muted kb-small" },
        `${s.n_deviating} of ${s.n_units} countries deviate > ${Math.round(t.between_dev * 100)}% ` +
        `(between if > ${t.between_min_countries}); within threshold ${Math.round(t.within_dev * 100)}%`));
    box.append(card);
  }
}

// ---------------------------------------------------------------- country table
function renderTable() {
  const b = state.payload[state.kind];
  const q = document.getElementById("nat-search").value.trim().toUpperCase();
  const onlyFlagged = document.getElementById("nat-filter").value === "flagged";
  const rows = b.countries.filter((r) => (!onlyFlagged || r.flag) && (!q || r.country.includes(q)));
  const vars = b.variables;
  const wrap = document.getElementById("nat-table");
  const head = el("tr", {}, el("th", { class: "name", scope: "col" }, "Country"), el("th", { scope: "col" }, "Flag"),
    el("th", { class: "num", scope: "col" }, "Max |dev|"),
    vars.map((v) => el("th", { class: "num", scope: "col" }, shortVar(v))),
    el("th", { class: "num", scope: "col", title: "within-country outlier months in the last 12" }, "Flags 12m"));
  const body = el("tbody");
  for (const r of rows) {
    const tr = el("tr", { class: `nat-row${r.country === state.country ? " selected" : ""}` },
      el("th", { class: "name", scope: "row" }, r.country),
      el("td", {}, el("span", { class: `nat-flag f${r.flag}` }, String(r.flag))),
      el("td", { class: "num" }, r.max_abs_dev == null ? "–" : `${(r.max_abs_dev * 100).toFixed(1)}%`),
      vars.map((v) => {
        const d = r.dev[v];
        return el("td", { class: `num ${d == null ? "" : d < 0 ? "nat-dev-neg" : "nat-dev-pos"}`,
          title: `value ${fmt(r.value[v])} · baseline ${fmt(r.baseline[v])}` }, pctDev(d));
      }),
      el("td", { class: "num" }, String(r.within_12m)));
    tr.addEventListener("click", () => selectCountry(r.country));
    body.append(tr);
  }
  if (!rows.length) body.append(el("tr", {}, el("td", { colSpan: vars.length + 4, class: "muted" },
    onlyFlagged ? "No flagged countries this month." : "No countries match.")));
  wrap.replaceChildren(el("table", { class: "kb-table" }, el("thead", {}, head), body));
}

// ---------------------------------------------------------------- time series
const PALETTE = ["--kb-series-1", "--kb-series-2", "--kb-series-3", "--kb-series-4", "--kb-other", "--muted"];

async function renderChart() {
  const title = document.getElementById("nat-chart-title");
  const note = document.getElementById("nat-chart-note");
  if (!state.country) return;
  if (!state.series) state.series = await getJSON("data/national/series.json");
  const s = state.series && state.series[state.kind][state.country];
  title.textContent = `${state.country} · ${KIND_LABEL[state.kind]}`;
  if (!s) {
    note.textContent = "No series for this country.";
    if (state.chart) { state.chart.destroy(); state.chart = null; }
    return;
  }
  const labels = state.series.months;
  const vars = state.payload[state.kind].variables;
  const red = css("--kb-critical"), grey = css("--kb-other");
  const flagColor = (f) => (f === 3 ? red : f === 1 ? css("--kb-warning") : f === 2 ? grey : "transparent");
  const datasets = [];
  vars.forEach((v, i) => {
    const color = css(PALETTE[i % PALETTE.length]);
    if (!s[v]) return;
    datasets.push({
      label: shortVar(v), data: s[v], borderColor: color, backgroundColor: color, borderWidth: 1.6, spanGaps: true,
      pointRadius: s.flag.map((f, k) => (f ? 4 : labels[k] === state.month ? 3 : 0)),
      pointBackgroundColor: s.flag.map((f) => (f ? flagColor(f) : color)),
      pointBorderColor: s.flag.map((f) => (f ? flagColor(f) : color)),
    });
    if (state.kind === "fb" && s[`${v}_baseline`]) {
      datasets.push({ label: `${shortVar(v)} baseline`, data: s[`${v}_baseline`], borderColor: color, borderDash: [4, 3],
        borderWidth: 1, pointRadius: 0, spanGaps: true });
    }
  });
  note.textContent = "Coloured points: outlier months (yellow within country, red both, grey between-country month)." +
    (state.kind === "fb" ? " Dashed: rolling baseline." : "");
  const cfg = {
    type: "line", data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: "index", intersect: false },
      scales: { y: { beginAtZero: false }, x: { ticks: { maxTicksLimit: 14 } } },
      plugins: { tooltip: { callbacks: { afterTitle: (items) => {
        const f = s.flag[items[0].dataIndex];
        return f ? `outlier flag ${f}` : "";
      } } } },
    },
  };
  if (state.chart) state.chart.destroy();
  state.chart = new Chart(document.getElementById("nat-chart"), cfg);
}

function selectCountry(country) {
  state.country = country;
  const url = new URL(window.location);
  url.searchParams.set("country", country);
  url.searchParams.set("kind", state.kind);
  history.replaceState(null, "", url);
  renderTable();
  renderChart();
}

// ---------------------------------------------------------------- month / kind
async function loadMonth(label) {
  const entry = state.index.find((m) => m.label === label);
  state.payload = await getJSON(`data/${entry.national_file}`);
  state.month = label;
  document.getElementById("nat-meta").textContent =
    `${label} · baseline: previous ${state.payload.baseline.baseline_months} months (at least ` +
    `${state.payload.baseline.baseline_min_months}), the country's own outlier months left out`;
  document.getElementById("nat-footer").textContent = `Generated ${state.payload.generated_at_utc} by dgg_pipeline (national_outliers)`;
  renderCards();
  renderTable();
  if (state.country) renderChart();
}

function setKind(kind) {
  state.kind = kind;
  document.querySelectorAll(".nat-tabs button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.kind === kind)));
  renderTable();
  if (state.country) renderChart();
}

(async function main() {
  const index = await getJSON("data/index.json");
  state.index = (index?.months || []).filter((m) => m.national_file);
  if (!state.index.length) {
    document.getElementById("nat-meta").textContent = "No national outlier data yet (dgg_pipeline stage national_outliers).";
    return;
  }
  const params = new URLSearchParams(window.location.search);
  if (params.get("kind") in KIND_LABEL) state.kind = params.get("kind");
  state.country = params.get("country");
  const sel = document.getElementById("nat-month");
  for (const m of state.index) sel.append(el("option", { value: m.label }, m.label));
  sel.addEventListener("change", () => loadMonth(sel.value));
  document.querySelectorAll(".nat-tabs button").forEach((b) => b.addEventListener("click", () => setKind(b.dataset.kind)));
  document.getElementById("nat-search").addEventListener("input", renderTable);
  document.getElementById("nat-filter").addEventListener("change", renderTable);
  document.querySelectorAll(".nat-tabs button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.kind === state.kind)));
  await loadMonth(params.get("month") && state.index.some((m) => m.label === params.get("month")) ? params.get("month") : state.index[0].label);
})();
