// DGG kanban: reads kanban/monitor.json, kanban/history.json (written by dgg_pipeline/main_monitor.py)
// and data/index.json (monthly report pages)

const STATUS = {
  down: { tone: "critical", icon: "✕" },
  stuck: { tone: "serious", icon: "!" },
  "not-in-db": { tone: "serious", icon: "!" },
  degraded: { tone: "warning", icon: "!" },
  healthy: { tone: "good", icon: "✓" },
};
const BREAKDOWN = [
  ["finished_data", "Finished data", "var(--kb-series-1)"],
  ["collector_logs", "Collector logs", "var(--kb-series-2)"],
  ["crawler", "Crawler", "var(--kb-series-3)"],
  ["docker", "Docker", "var(--kb-series-4)"],
  ["other", "Other", "var(--kb-other)"],
];

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "style") node.style.cssText = v;
    else if (k.startsWith("data-") || k.startsWith("aria-") || k === "role") node.setAttribute(k, v);
    else node[k] = v;
  }
  for (const c of children.flat()) if (c != null) node.append(c);
  return node;
};
// sparse mau_audience_upper_bound categories (status sparse_7d from collector_status.py); api_1000 is context only
const SPARSE = [
  ["imputed_1000", "imputed 1000", "optimiser deduced the query as sparse and never asked Facebook (upper 1000, lower −1)"],
  ["zero", "0", "better-estimates subtraction gave 0"],
  ["placeholder", "−1", "placeholder row never collected (run cut short, file still written)"],
  ["nan", "NaN", "empty or not a number"],
];
const SPARSE_API = ["api_1000", "API 1000", "Facebook's own floor value (context, not a problem)"];
const SPARSE_KINDS = ["raw", "better"];

const pct = (x) => (x == null ? "–" : `${Math.round(x * 100)}%`);
const fmtN = (n) => n.toLocaleString("en-GB");
const share = (n, rows) => (rows ? (100 * n) / rows : null);
const countPct = (n, rows) => `${fmtN(n)} (${rows ? share(n, rows).toFixed(1) : "–"}%)`;
const shortName = (n) => n.replace(/^dgg_subnational_/, "").replace(/^dgg_/, "");

async function getJSON(path) {
  try {
    const r = await fetch(path, { cache: "no-store" });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- tooltip
const tip = document.getElementById("kb-tooltip");
function attachTip(node, html) {
  node.addEventListener("mouseenter", () => { tip.innerHTML = html; tip.hidden = false; });
  node.addEventListener("mousemove", (e) => {
    const x = Math.min(e.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = `${x}px`;
    tip.style.top = `${e.clientY + 14}px`;
  });
  node.addEventListener("mouseleave", () => { tip.hidden = true; });
}

// ---------------------------------------------------------------- banners
function renderBanners(m) {
  const box = document.getElementById("kb-banners");
  const d = m.disk;
  if (d.flags.includes("backup-reminder")) {
    box.append(el("div", { class: "kb-banner serious" },
      el("span", { class: "kb-status-icon serious" }, "!"),
      el("div", {}, el("b", {}, `Disk ${pct(d.used_share)} full. `),
        "It's at or above 2/3: make a local copy of the data (", el("code", {}, "utils/dgg_collectors_backup.sh"), ").")));
  }
  if (d.flags.includes("log-intervention")) {
    box.append(el("div", { class: "kb-banner warning" },
      el("span", { class: "kb-status-icon warning" }, "!"),
      el("div", {}, el("b", {}, `Logs take ${d.breakdown_gb.collector_logs} GB. `),
        "Check for a stuck collector; after a backup, free space with ",
        el("code", {}, './utils/collectors_cleanup.sh "" 7 30'), ".")));
  }
  const stuck = m.collections.filter((c) => c.stuck_specs.length);
  if (stuck.length) {
    const n = stuck.reduce((s, c) => s + c.stuck_specs.length, 0);
    box.append(el("div", { class: "kb-banner serious" },
      el("span", { class: "kb-status-icon serious" }, "!"),
      el("div", {}, el("b", {}, `${n} specs blocked in ${stuck.length} collections. `),
        "A left-over collecting/ file makes the collector skip the spec on every run; see the cards below.")));
  }
}

// ---------------------------------------------------------------- VM panel
function renderVM(m, history) {
  const d = m.disk;
  document.getElementById("kb-disk-value").textContent =
    `${pct(d.used_share)} · ${d.used_gb} / ${d.total_gb} GB (${d.free_gb} GB free)`;

  const gauge = document.getElementById("kb-gauge");
  gauge.setAttribute("aria-label", `Disk ${pct(d.used_share)} used`);
  const legend = document.getElementById("kb-legend");
  for (const [key, label, color] of BREAKDOWN) {
    const gbValue = d.breakdown_gb[key];
    if (!gbValue) continue;
    const seg = el("div", { class: "seg", style: `width:${(gbValue / d.total_gb) * 100}%;background:${color}` });
    attachTip(seg, `<b>${label}</b><br>${gbValue} GB · ${pct(gbValue / d.total_gb)} of disk`);
    gauge.append(seg);
    legend.append(el("span", {}, el("i", { style: `background:${color}` }), `${label} ${gbValue} GB`));
  }
  gauge.append(el("div", { class: "mark", style: "left:66.67%" }, el("span", {}, "2/3: back up")));

  // trend
  const svg = document.getElementById("kb-trend");
  const pts = (history || []).filter((h) => h.disk_used_share != null);
  const note = document.getElementById("kb-trend-note");
  if (pts.length < 2) {
    note.textContent = pts.length ? "Trend appears after the next weekly run." : "No history yet.";
    return;
  }
  const W = svg.clientWidth || 300, H = 90, pad = 18;
  const x = (i) => pad + (i / (pts.length - 1)) * (W - 2 * pad);
  // y range fitted to the data, always including the 2/3 line
  const vals = pts.map((p) => p.disk_used_share).concat([2 / 3]);
  const lo = Math.max(Math.min(...vals) - 0.05, 0), hi = Math.min(Math.max(...vals) + 0.05, 1);
  const y = (v) => H - pad - ((v - lo) / (hi - lo)) * (H - 2 * pad);
  const ns = "http://www.w3.org/2000/svg";
  const mk = (tag, a) => { const n = document.createElementNS(ns, tag); for (const k in a) n.setAttribute(k, a[k]); return n; };
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.append(mk("line", { x1: pad, x2: W - pad, y1: y(2 / 3), y2: y(2 / 3), stroke: "var(--kb-ink-2)", "stroke-dasharray": "3 3", "stroke-width": 1 }));
  svg.append(mk("path", { d: pts.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.disk_used_share)}`).join(""),
    fill: "none", stroke: "var(--kb-series-1)", "stroke-width": 2 }));
  pts.forEach((p, i) => {
    const c = mk("circle", { cx: x(i), cy: y(p.disk_used_share), r: 4, fill: "var(--kb-series-1)", stroke: "var(--card)", "stroke-width": 2 });
    const hit = mk("circle", { cx: x(i), cy: y(p.disk_used_share), r: 10, fill: "transparent" });
    attachTip(hit, `<b>${p.date}</b><br>Disk ${pct(p.disk_used_share)} (${p.disk_used_gb} GB)<br>Logs ${p.logs_gb} GB`);
    svg.append(c, hit);
  });
  const t1 = mk("text", { x: pad, y: H - 4 }); t1.textContent = pts[0].date;
  const t2 = mk("text", { x: W - pad, y: H - 4, "text-anchor": "end" }); t2.textContent = pts[pts.length - 1].date;
  svg.append(t1, t2);
  note.textContent = "Dashed line: 2/3 (backup reminder).";
}

// ---------------------------------------------------------------- collection board
function runBars(c) {
  const runs = c.runs.slice(-7);
  const max = Math.max(...runs.map((r) => r.hours || 0), 1);
  const box = el("div", { class: "kb-runs", role: "img", "aria-label": `Last ${runs.length} runs of ${c.collection}` });
  for (const r of runs) {
    const state = r.end ? (r.interrupted ? "interrupted" : "") : "running";
    const bar = el("div", { class: `bar ${state}`, style: `height:${Math.max(((r.hours || 0) / max) * 100, 4)}%` },
      el("div", { class: "hit" }));
    attachTip(bar, `<b>${r.start}</b> → ${r.end || "running"}${r.interrupted ? " (interrupted)" : ""}<br>` +
      `${r.hours ?? "–"} h · coverage ${pct(r.coverage)}` +
      (r.missing_mau_share != null ? `<br>rows without MAU bounds ${pct(r.missing_mau_share)}` : ""));
    box.append(bar);
  }
  return [box, el("div", { class: "kb-runs-note" },
    el("span", {}, `median ${c.median_run_hours ?? "–"} h`), el("span", {}, `max ${Math.round(max)} h`))];
}

function sparseBlock(c) {
  const s = c.sparse_7d;
  if (!s) return el("div", { class: "row" }, "Sparse values (7 days)", el("b", {}, "n/a"));
  const box = el("div", { class: "kb-sparse" }, el("div", { class: "kb-sparse-head" }, `Sparse values since ${s.since}`));
  const kinds = SPARSE_KINDS.filter((k) => s[k] && s[k].files);
  if (!kinds.length) {
    box.append(el("div", { class: "kb-sparse-head" }, "no finished files"));
    return box;
  }
  // a category per row, raw / better side by side; each cell = % of that kind's rows over the count
  const cell = (t, k) => el("td", {}, `${share(t[k], t.rows).toFixed(1)}%`, el("span", { class: "count" }, fmtN(t[k])));
  const grid = el("table", { class: "kb-sparse-grid" },
    el("tr", {}, el("th", {}, ""), kinds.map((kind) => el("th", {}, kind))),
    [...SPARSE, SPARSE_API].map(([k, label, desc]) => {
      const tr = el("tr", { class: k === "api_1000" ? "api" : "" }, el("th", {}, label), kinds.map((kind) => cell(s[kind], k)));
      attachTip(tr, `<b>${label}</b>: ${desc}<br>` +
        kinds.map((kind) => `${kind}: ${countPct(s[kind][k], s[kind].rows)} of ${fmtN(s[kind].rows)} rows, ${s[kind].files} files`).join("<br>"));
      return tr;
    }));
  box.append(grid);
  return box;
}

function collectionCard(c) {
  const last = c.last_finished || {};
  const card = el("article", { class: "kb-card" }, el("h3", { title: c.collection }, shortName(c.collection)));
  card.append(el("div", { class: "row" }, "Coverage",
    el("b", {}, last.coverage == null ? "–" : `${pct(last.coverage)} · ${last.specs_done}/${last.specs_total}`)));
  if (c.current) {
    card.append(el("div", { class: "row" }, "Running",
      el("b", {}, `${c.current.hours_so_far} h${c.current.spec ? ` · ${c.current.spec}` : ""}`)));
  }
  if (c.db) {
    card.append(el("div", { class: "row" }, "In database (7 days)",
      el("b", {}, `${pct(c.db.share_in_db)}${c.db.last_db_date ? ` · last ${c.db.last_db_date}` : " · none"}`)));
  }
  card.append(el("div", { class: "row" }, "Logs", el("b", {}, `${c.logs_gb} GB`)));
  card.append(sparseBlock(c));
  card.append(...runBars(c));

  const tags = c.flags.map((f) => el("span", { class: "tag" }, f));
  if (tags.length) card.append(el("div", { class: "tags" }, tags));

  if (c.stuck_specs.length) {
    card.append(el("details", {},
      el("summary", {}, `${c.stuck_specs.length} blocked spec(s)`),
      el("ul", {}, c.stuck_specs.map((s) =>
        el("li", {}, `${s.spec}: last finished ${(c.missing_specs_last_finished || {})[s.spec] || s.stamp}, ${s.age_days} days`)))));
  } else if (Object.keys(c.missing_specs_last_finished || {}).length) {
    card.append(el("details", {},
      el("summary", {}, "Missing specs"),
      el("ul", {}, Object.entries(c.missing_specs_last_finished).map(([s, d]) => el("li", {}, `${s}: last finished ${d || "never"}`)))));
  }
  return card;
}

function renderBoard(m) {
  const board = document.getElementById("kb-board");
  for (const col of m.columns) {
    const items = m.collections.filter((c) => c.column === col.id);
    const st = STATUS[col.id];
    board.append(el("div", { class: "kb-col" },
      el("div", { class: "kb-col-head" }, el("span", { class: `kb-status-icon ${st.tone}` }, st.icon), col.label,
        el("span", { class: "count" }, String(items.length))),
      items.map(collectionCard)));
  }
}

// ---------------------------------------------------------------- sparse-value table
function renderSparseTable(m) {
  const wrap = document.getElementById("kb-sparse-table");
  const cols = [];
  for (const kind of SPARSE_KINDS) {
    cols.push({ kind, key: "rows", label: "rows" });
    for (const [key, label] of [SPARSE[0], SPARSE_API, ...SPARSE.slice(1)]) cols.push({ kind, key, label });
  }
  // the name sorts a-z; rows by count; categories by % of that kind's rows; n/a always last
  const sortValue = (c, col) => {
    if (!col) return c.collection;
    const t = c.sparse_7d && c.sparse_7d[col.kind];
    if (!t || !t.files) return null;
    return col.key === "rows" ? t.rows : share(t[col.key], t.rows);
  };
  let sortCol = 2, sortDir = -1; // raw imputed 1000, highest first

  const ths = [null, ...cols].map((col, i) => {
    const btn = el("button", { type: "button", class: "kb-sort" }, col ? col.label : "Collection");
    btn.addEventListener("click", () => {
      sortDir = sortCol === i ? -sortDir : (i ? -1 : 1);
      sortCol = i;
      draw();
    });
    return el("th", { scope: "col", class: col ? "num" : "name" }, btn);
  });
  ths[0].rowSpan = 2;
  const body = el("tbody");
  wrap.replaceChildren(el("table", { class: "kb-table" },
    el("thead", {},
      el("tr", {}, ths[0], SPARSE_KINDS.map((k) => el("th", { colSpan: 6, scope: "colgroup", class: "group" }, k))),
      el("tr", {}, ths.slice(1))),
    body));

  function draw() {
    const col = sortCol ? cols[sortCol - 1] : null;
    const items = [...m.collections].sort((a, b) => {
      const va = sortValue(a, col), vb = sortValue(b, col);
      if (va == null || vb == null) return (va == null) - (vb == null);
      return (va < vb ? -1 : va > vb ? 1 : 0) * sortDir;
    });
    ths.forEach((th, i) => th.setAttribute("aria-sort", i === sortCol ? (sortDir > 0 ? "ascending" : "descending") : "none"));
    body.replaceChildren(...items.map((c) => el("tr", {},
      el("th", { scope: "row", class: "name", title: c.collection }, shortName(c.collection)),
      cols.map((cl) => {
        const s = c.sparse_7d, t = s && s[cl.kind];
        if (!s) return el("td", { class: "num muted" }, "n/a");
        if (!t || !t.files) return el("td", { class: "num muted" }, "–");
        if (cl.key === "rows") return el("td", { class: "num" }, fmtN(t.rows));
        return el("td", { class: `num${cl.key === "api_1000" ? " muted" : ""}` },
          `${share(t[cl.key], t.rows).toFixed(1)}%`, el("span", { class: "count" }, fmtN(t[cl.key])));
      }))));
  }
  draw();
}

// ---------------------------------------------------------------- monthly report board
function renderMonths(index, m) {
  const board = document.getElementById("kb-months");
  const published = new Set((index?.months || []).map((x) => x.label));
  const now = new Date();
  const label = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const current = label(now);
  const previous = label(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
  const dbGap = m && m.db_checked && m.collections.some((c) => c.column === "not-in-db");

  const cols = [
    ["Collecting", "neutral", "…", [current]],
    ["Waiting for data / modelling", dbGap ? "serious" : "warning", "!", published.has(previous) ? [] : [previous]],
    ["Report published", "good", "✓", [...published].sort().reverse().slice(0, 6)],
  ];
  for (const [title, tone, icon, months] of cols) {
    board.append(el("div", { class: "kb-col" },
      el("div", { class: "kb-col-head" }, el("span", { class: `kb-status-icon ${tone}` }, icon), title,
        el("span", { class: "count" }, String(months.length))),
      months.map((mo) => {
        const card = el("article", { class: "kb-card" }, el("h3", {}, mo));
        if (title === "Report published") card.append(el("a", { class: "gadm-link", href: "index.html" }, "Open report"));
        if (title.startsWith("Waiting") && dbGap) card.append(el("div", { class: "row" }, "Blocked by", el("b", {}, "DB upload gap")));
        return card;
      })));
  }
}

// ---------------------------------------------------------------- main
(async function main() {
  const [monitor, history, index] = await Promise.all([
    getJSON("kanban/monitor.json"), getJSON("kanban/history.json"), getJSON("data/index.json")]);
  if (!monitor) {
    document.getElementById("kb-meta").textContent = "No monitor data yet: run main_monitor.py in dgg_pipeline.";
    renderMonths(index, null);
    return;
  }
  document.getElementById("kb-meta").textContent =
    `Badger status at ${monitor.vm_status_at_utc} UTC · database ${monitor.db_checked ? "checked" : "not checked"}`;
  renderBanners(monitor);
  renderVM(monitor, history);
  renderBoard(monitor);
  renderSparseTable(monitor);
  renderMonths(index, monitor);
  document.getElementById("kb-footer").textContent = `Generated ${monitor.generated_at_utc} UTC by dgg_pipeline/main_monitor.py`;
})();
