let payload = null;
let rows = [];
let detailSeries = {};
let currentMonthLabel = null;

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

  // Missed units expandable section
  const missed = summary.missed_unit_names || [];
  const countEl = document.getElementById("missed-count");
  const listEl = document.getElementById("missed-units-list");
  const section = document.getElementById("missed-units-section");
  if (countEl) countEl.textContent = `(${missed.length})`;
  if (listEl) {
    listEl.innerHTML = missed.length
      ? missed.map((u) => `<span class="missed-tag">${esc(u)}</span>`).join("")
      : '<span class="muted">None — all expected units are present.</span>';
  }
  if (section) section.style.display = missed.length === 0 ? "none" : "";
}

function populateOutcomeFilter() {
  const select = document.getElementById("outcome-filter");
  const outcomes = Array.from(new Set(rows.map((item) => item.outcome))).sort();
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

function detailUrl(gid, outcome) {
  const query = new URLSearchParams({ gadm: gid, outcome });
  if (currentMonthLabel) query.set("month", currentMonthLabel);
  return `detail.html?${query.toString()}`;
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
        ? `<a class="gadm-link" href="${detailUrl(row.gid_1, row.outcome)}">${esc(row.gid_1)}</a>`
        : esc(row.gid_1);
      const detailBtn = hasDetail
        ? `<a class="detail-btn" href="${detailUrl(row.gid_1, row.outcome)}">Open →</a>`
        : ``;
      return `
        <tr>
          <td>${gidCell}</td>
          <td>${esc(row.outcome)}</td>
          <td>${fmt(row.predicted_current)}</td>
          <td>${fmt(row.predicted_avg)}</td>
          <td>${fmt(row.predicted_change)}</td>
          <td class="${pct >= 0 ? "pos" : ""}">${pct.toFixed(2)}%</td>
          <td>${row.significant_count_12m}</td>
          <td>${detailBtn}</td>
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
}

function renderFooter() {
  const footer = document.getElementById("footer-meta");
  const generated = payload?.generated_at_utc || "unknown";
  const detailType = payload?.detail_data_type || "unknown";
  footer.textContent = `Generated UTC: ${generated} | Detail FB data type: ${detailType} | Click a GID to open detail page`;
}

async function loadMonth(file, label) {
  const response = await fetch(`data/${file}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load data/${file} (${response.status})`);
  payload = await response.json();
  currentMonthLabel = label;
  rows = payload?.rows || [];
  detailSeries = payload?.detail_series || {};
  renderCards();
  populateOutcomeFilter();
  renderTable();
  renderFooter();
}

async function init() {
  const idxResp = await fetch("data/index.json", { cache: "no-store" });
  if (!idxResp.ok) throw new Error(`Failed to load data/index.json (${idxResp.status})`);
  const index = await idxResp.json();
  const months = index.months || [];

  if (!months.length) throw new Error("No months found in index.json");

  const select = document.getElementById("month-selector");
  select.innerHTML = months
    .map((m) => `<option value="${m.file}" data-label="${esc(m.label)}">${esc(m.label)}</option>`)
    .join("");
  select.value = months[0].file;

  select.addEventListener("change", () => {
    const opt = select.options[select.selectedIndex];
    loadMonth(select.value, opt.dataset.label);
  });

  bindControls();
  await loadMonth(months[0].file, months[0].label);
}

init().catch((error) => {
  const table = document.getElementById("rows-table");
  table.innerHTML = `<tr><td colspan="7">Failed to load report data: ${error.message}</td></tr>`;
});
