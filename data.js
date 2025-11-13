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
  const clearBtn = document.getElementById("clearBtn");

  const debounced = debounce(() => { state.filters.q = (q.value || "").trim().toLowerCase(); applyAndRender(); }, 120);
  q.addEventListener("input", debounced);

  clearBtn.addEventListener("click", resetFilters);

  // ⭐ NEW: group-by listener
document.getElementById("groupBy").addEventListener("change", applyAndRender);

  loadCsv(SHEET_CSV_URL)
    .then(rows => {
      const normalized = rows.map(r => ({
        GUID: (r["GUID"] || "").trim(), 
        Episode: parseEpisode(r["Episode"]),
        Title: (r["Title"] || "").trim(),
        PublishDate: parseDate(r["Publish Date"]),
        Description: (r["Description"] || "").trim(),
        AudioURL: (r["Audio URL"] || "").trim(),
        Region: parseTags(r["Region"]),
        Period: parseTags(r["Period"])

      }));

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
    if (r.Period.length) {
      r.Period.forEach(p => periods.add(p));
    } else {
      periods.add("No period assigned");
    }
    
    if (r.Region.length) {
      r.Region.forEach(g => regions.add(g));
    } else {
      regions.add("No region assigned");
    }
  });

  const host = document.getElementById("filterDropdownHost");
  host.innerHTML = "";

  const dataMap = {
    year: arrDesc([...years]),
    period: sortWithNoneLast([...periods]),
    region: sortWithNoneLast([...regions])
  };


  ["year","period","region"].forEach(key => {
    const panel = document.createElement("div");
    panel.className = "filter-dropdown";
    panel.dataset.filter = key;

    const inner = document.createElement("div");
    inner.className = "filter-dropdown-inner";
    inner.id = key + "Options";

    const values = dataMap[key];
    values.forEach(v => {
      const opt = document.createElement("label");
      opt.className = "filter-option";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = v;

      input.addEventListener("change", () => {
        const set = key === "year" ? state.filters.years
                 : key === "period" ? state.filters.periods
                 : state.filters.regions;

        if (input.checked) {
          set.add(v);
        } else {
          set.delete(v);
        }
        applyAndRender();
      });

      opt.appendChild(input);
      opt.appendChild(document.createTextNode(v));
      inner.appendChild(opt);
    });

    panel.appendChild(inner);
    host.appendChild(panel);
  });

  wirePillButtons();
}

function wirePillButtons() {
  const pills = Array.from(document.querySelectorAll(".pill-button"));
  const panels = Array.from(document.querySelectorAll(".filter-dropdown"));

  function closeAll() {
    pills.forEach(p => p.classList.remove("active"));
    panels.forEach(p => p.classList.remove("open"));
  }

  pills.forEach(pill => {
    pill.addEventListener("click", (e) => {
      e.stopPropagation();
      const key = pill.dataset.filter;
      const panel = panels.find(p => p.dataset.filter === key);
      const isActive = pill.classList.contains("active");
  
      // ❌ Remove automatic close when selecting options
      // Instead: only close if clicking pill again or outside
  
      if (isActive) {
        // Close if clicking the same pill again
        pill.classList.remove("active");
        panel.classList.remove("open");
        return;
      }
  
      // Close other panels
      pills.forEach(p => p.classList.remove("active"));
      panels.forEach(p => p.classList.remove("open"));
  
      // Open this panel
      pill.classList.add("active");
      panel.classList.add("open");
  
      const rect = pill.getBoundingClientRect();
      const hostRect = document.getElementById("filterDropdownHost").getBoundingClientRect();
      panel.style.left = (rect.left - hostRect.left) + "px";
      panel.style.top = "0px";
    });
  });

// ✔ Keep panel open when clicking inside it
panels.forEach(panel => {
  panel.addEventListener("click", (e) => e.stopPropagation());
});


  document.addEventListener("click", () => {
    closeAll();
  });
}

function resetFilters() {
  document.getElementById("q").value = "";
  state.filters.q = "";

  state.filters.years.clear();
  state.filters.periods.clear();
  state.filters.regions.clear();

  const allChecks = document.querySelectorAll(".filter-dropdown input[type='checkbox']");
  allChecks.forEach(c => c.checked = false);

  applyAndRender();
}

// ---------- Apply filters + render ----------
function applyAndRender() {
  const { q, years, periods, regions } = state.filters;

  let rows = state.raw.slice();

  rows = rows.filter(r => {
    if (q) {
      const hay = `${r.Title} ${r.Description} ${r.Period} ${r.Region}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (years.size) {
      const y = r.PublishDate ? String(r.PublishDate.getFullYear()) : "";
      if (!years.has(y)) return false;
    }
    if (periods.size) {
        const tags = r.Period.length ? r.Period : ["No period assigned"];
        if (!tags.some(tag => periods.has(tag))) return false;
      }
      
      // Region
      if (regions.size) {
        const tags = r.Region.length ? r.Region : ["No region assigned"];
        if (!tags.some(tag => regions.has(tag))) return false;
      }
    return true;
  });

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
  rebuildFilterOptionsCascade(rows);

  renderChips();
  renderStats(rows);
  
  const mode = document.getElementById("groupBy").value;
  if (mode === "date") {
    renderGroups(rows);            // befintlig år→månad
  } else if (mode === "period") {
    renderGroupsByPeriod(rows);    // NY funktion
  } else {
    renderGroupsByRegion(rows);    // NY funktion
  }
  
  }

function renderChips() {
  const chipBox = document.getElementById("activeChips");
  chipBox.innerHTML = "";
  const { years, periods, regions, q } = state.filters;

  const parts = [];
  if (q) parts.push(chip("Search", q, () => { document.getElementById("q").value=""; state.filters.q=""; applyAndRender(); }));
  years.forEach(v => parts.push(chip("Year", v, () => { years.delete(v); uncheck("year", v); applyAndRender(); })));
  periods.forEach(v => parts.push(chip("Period", v, () => { periods.delete(v); uncheck("period", v); applyAndRender(); })));
  regions.forEach(v => parts.push(chip("Region", v, () => { regions.delete(v); uncheck("region", v); applyAndRender(); })));

  parts.forEach(el => chipBox.appendChild(el));
}

function uncheck(key, value) {
  const panel = document.querySelector(`.filter-dropdown[data-filter="${key}"]`);
  if (!panel) return;
  Array.from(panel.querySelectorAll("input")).forEach(i => {
    if (i.value === value) i.checked = false;
  });
}

function chip(label, value, onRemove) {
  const el = document.createElement("div");
  el.className = "chip";
  el.innerHTML = `<span class="chip-label">${label}:</span> ${escapeHtml(value)} <button type="button" class="chip-x" aria-label="Remove">×</button>`;
  el.querySelector(".chip-x").addEventListener("click", onRemove);
  return el;
}

function renderStats(rows) {
  const s = document.getElementById("stats");
  s.textContent = `${rows.length} episode${rows.length === 1 ? "" : "s"} matching`;
}

function renderGroups(rows) {
  const host = document.getElementById("list");
  host.innerHTML = "";

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
  const cleanTitle = r.Title.replace(/^\d+\.\s*/, "");
  const title = `${epNum}${cleanTitle}`;
  const dateStr = r.PublishDate ? r.PublishDate.toLocaleDateString("en-US", { year: 'numeric', month: 'short', day: 'numeric' }) : "";

  const summary = document.createElement("summary");
  summary.className = "episode-summary";
  summary.innerHTML = `
    <svg class="toggle-icon" viewBox="0 0 24 24">
      <path d="M8 5l8 7-8 7" fill="none" stroke="currentColor" stroke-width="2"/>
    </svg>
    <span>${escapeHtml(title)}</span>
  `;
  d.appendChild(summary);

  const body = document.createElement("div");
  body.className = "episode-body";

  const meta = [
    dateStr && `📅 ${dateStr}`,
    r.Period.length && `📆 Period: ${escapeHtml(r.Period.join(", "))}`,
    r.Region.length && `🌍 Region: ${escapeHtml(r.Region.join(", "))}`
  ].filter(Boolean).join(" · ");

  const desc = r.Description ? `<p class="desc">${escapeHtml(r.Description)}</p>` : "";
  const smartLink = r.GUID
    ? `https://pod.link/the-rest-is-history/episode/${encodeURIComponent(r.GUID)}`
    : r.AudioURL || "";
  
  // Build smart links for multiple players
  let linksHtml = "";
    if (r.GUID) {
      const podlinkGuid = megaphoneGuidToPodlink(r.GUID);
      if (podlinkGuid) {
        const url = `https://pod.link/1537788786/episode/${podlinkGuid}`;
        linksHtml = `
          <div class="listen-row">
            <a class="listen-pill" href="${url}" target="_blank" rel="noopener">
              🎧 Listen
            </a>
          </div>
        `;
      }
    }


  body.innerHTML = `
    ${meta ? `<div class="meta">${meta}</div>` : ""}
    ${desc}
    ${linksHtml}
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
  return new Date(2000, m, 1).toLocaleString("en-US", { month: "long" });
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function parseTags(v) {
  if (!v) return [];
  return String(v)
    .split(",")
    .map(x => stripPrefix(x.trim()))   // ⭐ ta bort "1. ", "2. ", osv
    .filter(Boolean);
}

function stripPrefix(v) {
  return v.replace(/^\d+\.\s*/, "");
}

function sortWithNoneLast(arr) {
  return arr.sort((a, b) => {
    const aIsNone = a.startsWith("No ");
    const bIsNone = b.startsWith("No ");
    if (aIsNone && !bIsNone) return 1;   // "No ..." goes last
    if (!aIsNone && bIsNone) return -1;
    const aa = stripPrefix(a);
    const bb = stripPrefix(b);
    return bb.localeCompare(aa, undefined, { numeric: true });
  });
}

function megaphoneGuidToPodlink(guid) {
  if (!guid) return null;

  // Base64 encode the GUID string as plain text (PodLink format)
  let b64 = btoa(guid);

  // Make it URL-safe (PodLink requirement)
  return b64
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function rebuildFilterOptionsCascade() {
  const { years, periods, regions } = state.filters;

  // 1. Ta fram redan filtrerade rader
  const rows = state.filtered;

  // 2. Samla nya värden beroende på aktiva filters
  const yearSet = new Set();
  const periodSet = new Set();
  const regionSet = new Set();

  rows.forEach(r => {
    const y = r.PublishDate ? String(r.PublishDate.getFullYear()) : null;
    if (y) yearSet.add(y);

    const p = r.Period.length ? r.Period : ["No period assigned"];
    p.forEach(v => periodSet.add(v));

    const g = r.Region.length ? r.Region : ["No region assigned"];
    g.forEach(v => regionSet.add(v));
  });

  // 3. För varje dropdown – bygg bara om om det INTE är filtret som användaren valt
  const dropdowns = [
    { key: "year",    set: yearSet,    active: years.size > 0 },
    { key: "period",  set: periodSet,  active: periods.size > 0 },
    { key: "region",  set: regionSet,  active: regions.size > 0 },
  ];

  dropdowns.forEach(({ key, set, active }) => {
    // ❌ Hoppa över det filter som är aktivt (kaskadlogik men inte på sig själv)
    if (active) return;

    const panel = document.querySelector(`.filter-dropdown[data-filter="${key}"]`);
    if (!panel) return;

    const inner = panel.querySelector(".filter-dropdown-inner");
    inner.innerHTML = "";

    const sorted = key === "year"
      ? [...set].sort((a, b) => Number(b) - Number(a))   // år: descending
      : sortWithNoneLast([...set]);                      // period/region: alfabetiskt, "No…" sist

    sorted.forEach(v => {
      const opt = document.createElement("label");
      opt.className = "filter-option";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = v;

      // återställ tidigare val om det fanns
      const owningSet = key === "year" ? years : key === "period" ? periods : regions;
      input.checked = owningSet.has(v);

      input.addEventListener("change", () => {
        if (input.checked) {
          owningSet.add(v);
        } else {
          owningSet.delete(v);
        }
        applyAndRender(); // trigga om-rendering + rebuild
      });

      opt.appendChild(input);
      opt.appendChild(document.createTextNode(v));
      inner.appendChild(opt);
    });
  });
}


function renderGroupsByPeriod(rows) {
  const host = document.getElementById("list");
  host.innerHTML = "";

  const groups = groupBy(rows, r => 
    r.Period.length ? r.Period.join(", ") : "No period assigned"
  );

  const keys = Object.keys(groups).sort((a, b) => {
    const maxA = Math.max(...groups[a].map(r => r.PublishDate ? r.PublishDate.getTime() : 0));
    const maxB = Math.max(...groups[b].map(r => r.PublishDate ? r.PublishDate.getTime() : 0));
    return maxB - maxA; // DESC by newest episode
  });

  keys.forEach(key => {
    const section = document.createElement("section");
    section.className = "year-group";
    section.innerHTML = `<h2 class="year-heading">📆 ${stripPrefix(key)}</h2>`;

    groups[key]
      .sort((a, b) => b.PublishDate - a.PublishDate)
      .forEach(r => section.appendChild(renderEpisodeCard(r)));

    host.appendChild(section);
  });
}

function renderGroupsByRegion(rows) {
  const host = document.getElementById("list");
  host.innerHTML = "";

  const groups = groupBy(rows, r => 
    r.Region.length ? r.Region.join(", ") : "No region assigned"
  );

  const keys = Object.keys(groups).sort((a, b) => {
    const maxA = Math.max(...groups[a].map(r => r.PublishDate ? r.PublishDate.getTime() : 0));
    const maxB = Math.max(...groups[b].map(r => r.PublishDate ? r.PublishDate.getTime() : 0));
    return maxB - maxA;
  });

  keys.forEach(key => {
    const section = document.createElement("section");
    section.className = "year-group";
    section.innerHTML = `<h2 class="year-heading">🌍 ${key}</h2>`;

    groups[key]
      .sort((a, b) => b.PublishDate - a.PublishDate)
      .forEach(r => section.appendChild(renderEpisodeCard(r)));

    host.appendChild(section);
  });
}






