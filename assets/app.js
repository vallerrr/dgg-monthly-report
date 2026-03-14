let payload = null;
let rows = [];
let detailSeries = {};

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
}

function renderFooter() {
  const footer = document.getElementById("footer-meta");
  const generated = payload?.generated_at_utc || "unknown";
  const detailType = payload?.detail_data_type || "unknown";
  footer.textContent = `Generated UTC: ${generated} | Detail FB data type: ${detailType} | Click a GID to open detail page`;
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
  bindControls();
  renderTable();
  renderFooter();
}

init().catch((error) => {
  const table = document.getElementById("rows-table");
  table.innerHTML = `<tr><td colspan="7">Failed to load report data: ${error.message}</td></tr>`;
});
