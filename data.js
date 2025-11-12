/**
 * TRIH Episode Explorer
 * - Loads CSV from Google Sheets
 * - Free-text search + multi-select filters (Year, Period, Region)
 * - Grouping: Year → Month (desc)
 * - Collapsed episode cards; click to expand
 */

const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTZC7Oawx266328_YGXnVt5d970Jbca-XIsYkbQQfp78LKLOsuLqZjPyoAmeto9rrhojtEBi0zMLkOd/pub?output=csv";

// Expected columns (use what exists; missing fields are handled):
// Episode, Title, Publish Date, Description, Audio URL, Region, Period

const state = {
  raw: [],
  filtered: [],
  filters: {
    q: "",
    years: new Set(),
    periods: new Set(),
    regions: new Set()
  }
};

document.addEventListener("DOMContentLoaded", () => {
  bootstrap();
});

// ---------- Bootstrap / Data loading ----------
function bootstrap() {
  const q = document.getElementById("q");
  const yearFilter = document.getElementById("yearFilter");
  const periodFilter = document.getElementById("periodFilter");
  const regionFilter = document.getElementById("regionFilter");
  const clearBtn = document.getElementById("clearBtn");

  const debounced = debounce(() => { state.filters.q = (q.value || "").trim().toLowerCase(); applyAndRender(); }, 120);
  q.addEventListener("input", debounced);

  yearFilter.addEventListener("change", () => setMultiSelect(yearFilter, state.filters.years));
  periodFilter.addEventListener("change", () => setMultiSelect(periodFilter, state.filters.periods));
  regionFilter.addEventListener("change", () => setMultiSelect(regionFilter, state.filters.regions));
  clearBtn.addEventListener("click", resetFilters);

  loadCsv(SHEET_CSV_URL)
    .then(rows => {
      // Normalize + enrich
      const normalized = rows.map(r => ({
        Episode: parseEpisode(r["Episode"]),
        Title: (r["Title"] || "").trim(),
        PublishDate: parseDate(r["Publish Date"]),
        Description: (r["Description"] || "").trim(),
        AudioURL: (r["Audio URL"] || "").trim(),
        Region: (r["Region"] || "").trim(),
        Period: (r["Period"] || "").trim()
      }));

      // Keep only rows with a title (minimum viable)
      state.raw = normalized.filter(r => r.Title);

      buildFilterOptions(state.raw);
      applyAndRender();
    })
    .catch(err => {
      console.error("CSV load failed", err);
      document.getElementById("list").innerHTML =
        `<div class="group"><div class="card">Failed to load data.</div></div>`;
    });
}

function loadCsv(url) {
  return new Promise((resolve, reject) => {
    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: res => resolve(res.data),
      error: reject
    });
  });
}

// ---------- Filters ----------
function buildFilterOptions(rows) {
  const years = new Set();
  const periods = new Set();
  const regions = new Set();

  rows.forEach(r => {
    const y = r.PublishDate ? r.PublishDate.getFullYear() : null;
    if (y) years.add(String(y));
    if (r.Period) periods.add(r.Period);
    if (r.Region) regions.add(r.Region);
  });

  fillMulti(document.getElementById("yearFilter"), arrDesc([...years]));
  fillMulti(document.getElementById("periodFilter"), arrAsc([...periods]));
  fillMulti(document.getElementById("regionFilter"), arrAsc([...regions]));
}

function fillMulti(selectEl, values) {
  selectEl.innerHTML = "";
  values.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    selectEl.appendChild(opt);
  });
}

function setMultiSelect(selectEl, targetSet) {
  targetSet.clear();
  Array.from(selectEl.selectedOptions).forEach(opt => targetSet.add(opt.value));
  applyAndRender();
}

function resetFilters() {
  document.getElementById("q").value = "";
  state.filters.q = "";
  ["yearFilter","periodFilter","regionFilter"].forEach(id => {
    const el = document.getElementById(id);
    Array.from(el.options).forEach(op => op.selected = false);
  });
  state.filters.years.clear();
  state.filters.periods.clear();
  state.filters.regions.clear();
  applyAndRender();
}

// ---------- Apply filters + render ----------
function applyAndRender() {
  const { q, years, periods, regions } = state.filters;

  let rows = state.raw.slice();

  rows = rows.filter(r => {
    // text search
    if (q) {
      const hay = `${r.Title} ${r.Description} ${r.Period} ${r.Region}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    // multi Year
    if (years.size) {
      const y = r.PublishDate ? String(r.PublishDate.getFullYear()) : "";
      if (!years.has(y)) return false;
    }
    // multi Period
    if (periods.size && !periods.has(r.Period)) return false;
    // multi Region
    if (regions.size && !regions.has(r.Region)) return false;

    return true;
  });

  // Sort for grouping: Year desc → Month desc → Episode desc → Title
  rows.sort((a, b) => {
    const ya = a.PublishDate ? a.PublishDate.getFullYear() : 0;
    const yb = b.PublishDate ? b.PublishDate.getFullYear() : 0;
    if (yb - ya !== 0) return yb - ya;

    const ma = a.PublishDate ? a.PublishDate.getMonth() : -1;
    const mb = b.PublishDate ? b.PublishDate.getMonth() : -1;
    if (mb - ma !== 0) return mb - ma;

    if ((b.Episode || 0) - (a.Episode || 0) !== 0) return (b.Episode || 0) - (a.Episode || 0);
    return a.Title.localeCompare(b.Title);
  });

  state.filtered = rows;

  renderChips();
  renderStats(rows);
  renderGroups(rows);
}

function renderChips() {
  const chipBox = document.getElementById("activeChips");
  chipBox.innerHTML = "";
  const { years, periods, regions, q } = state.filters;

  const parts = [];
  if (q) parts.push(chip("Search", q, () => { document.getElementById("q").value=""; state.filters.q=""; applyAndRender(); }));
  years.forEach(v => parts.push(chip("Year", v, () => { years.delete(v); selectRemove("yearFilter", v); applyAndRender(); })));
  periods.forEach(v => parts.push(chip("Period", v, () => { periods.delete(v); selectRemove("periodFilter", v); applyAndRender(); })));
  regions.forEach(v => parts.push(chip("Region", v, () => { regions.delete(v); selectRemove("regionFilter", v); applyAndRender(); })));

  parts.forEach(el => chipBox.appendChild(el));
}

function chip(label, value, onRemove) {
  const el = document.createElement("div");
  el.className = "chip";
  el.innerHTML = `<span class="chip-label">${label}:</span> ${escapeHtml(value)} <button type="button" class="chip-x" aria-label="Remove">×</button>`;
  el.querySelector(".chip-x").addEventListener("click", onRemove);
  return el;
}

function selectRemove(selectId, value) {
  const sel = document.getElementById(selectId);
  Array.from(sel.options).forEach(op => { if (op.value === value) op.selected = false; });
}

function renderStats(rows) {
  const s = document.getElementById("stats");
  s.textContent = `${rows.length} episode${rows.length === 1 ? "" : "s"} matching`;
}

function renderGroups(rows) {
  const host = document.getElementById("list");
  host.innerHTML = "";

  // Group Year → Month
  const byYear = groupBy(rows, r => r.PublishDate ? r.PublishDate.getFullYear() : "Unknown");
  const yearKeys = Object.keys(byYear).sort((a,b) => Number(b) - Number(a));

  yearKeys.forEach(year => {
    const section = document.createElement("section");
    section.className = "year-group";
    section.innerHTML = `<h2 class="year-heading">🗓️ ${year}</h2>`;

    const byMonth = groupBy(byYear[year], r => r.PublishDate ? r.PublishDate.getMonth() : -1);
    const monthKeys = Object.keys(byMonth).map(n => Number(n)).sort((a,b) => b - a);

    monthKeys.forEach(m => {
      const month = document.createElement("div");
      month.className = "month-group";
      const label = m >= 0 ? monthLabel(m) : "Unknown";
      month.innerHTML = `<h3 class="month-heading">${label}</h3>`;

      byMonth[m].forEach(r => month.appendChild(renderEpisodeCard(r)));
      section.appendChild(month);
    });

    host.appendChild(section);
  });
}

// ---------- Episode card ----------
function renderEpisodeCard(r) {
  const d = document.createElement("details");
  d.className = "episode-card";

  const epNum = (r.Episode != null && !isNaN(r.Episode)) ? `${r.Episode}. ` : "";
  const title = `${epNum}${r.Title}`;
  const dateStr = r.PublishDate ? r.PublishDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : "";

  const summary = document.createElement("summary");
  summary.className = "episode-summary";
  summary.textContent = title;
  d.appendChild(summary);

  const body = document.createElement("div");
  body.className = "episode-body";

  const meta = [
    dateStr && `📅 ${dateStr}`,
    r.Period && `📆 Period: ${escapeHtml(r.Period)}`,
    r.Region && `🌍 Region: ${escapeHtml(r.Region)}`
  ].filter(Boolean).join(" · ");

  const desc = r.Description ? `<p class="desc">${escapeHtml(r.Description)}</p>` : "";
  const play = r.AudioURL ? `<a href="${encodeURI(r.AudioURL)}" target="_blank" rel="noopener" class="button">▶ Play episode</a>` : "";

  body.innerHTML = `
    ${meta ? `<div class="meta">${meta}</div>` : ""}
    ${desc}
    ${play ? `<div class="actions">${play}</div>` : ""}
  `;

  d.appendChild(body);
  return d;
}

// ---------- Utils ----------
function debounce(fn, wait=120) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}
function parseEpisode(v) {
  if (v == null) return null;
  const s = String(v).trim();
  const m = /^(\d+)/.exec(s);
  return m ? Number(m[1]) : null;
}
function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function arrAsc(a){ return a.sort((x,y)=> x.localeCompare(y)); }
function arrDesc(a){ return a.sort((x,y)=> y.localeCompare(x)); }
function groupBy(arr, fn) {
  const map = {};
  arr.forEach(x => {
    const k = String(fn(x));
    (map[k] ||= []).push(x);
  });
  return map;
}
function monthLabel(m) {
  return new Date(2000, m, 1).toLocaleString(undefined, { month: 'long' });
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
