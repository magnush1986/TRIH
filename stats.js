// stats.js
// Stats overview by Period, Region and Topic + filters + line charts

const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTZC7Oawx266328_YGXnVt5d970Jbca-XIsYkbQQfp78LKLOsuLqZjPyoAmeto9rrhojtEBi0zMLkOd/pub?output=csv";

const statsState = {
  raw: [],
  filtered: [],
  filters: {
    years: new Set(),
    periods: new Set(),
    regions: new Set(),
    topics: new Set(),
    series: new Set() 
  }
};

let chartPeriod = null;
let chartRegion = null;
let chartTopic = null;

// ---------------------------------------------------------------------------
// INITIALISERING
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  const clearBtn = document.getElementById("clearBtn");
  if (clearBtn) clearBtn.addEventListener("click", resetFilters);

  loadCsv(SHEET_CSV_URL)
    .then(rows => {
      const normalized = rows.map(r => ({
        Episode: parseEpisode(r["Episode"]),
        Title: (r["Title"] || "").trim(),
        Region: parseTags(r["Region"]),
        Period: parseTags(r["Period"]),
        Topic: parseTags(r["Topic"]),
        PubDate: parseDate(r["Publish Date"]),
        Series: parseTags(r["Series"])
      }));

      const episodes = normalized.filter(r => r.Title);
      statsState.raw = episodes;
      statsState.filtered = episodes.slice();

      buildFilterOptions(episodes);
      loadStateFromUrl();
      applyUrlStateToUI();
      updateUrlFromState();
      applyFiltersAndRender();
    })
    .catch(err => {
      console.error("Failed to load CSV for stats", err);
      setTotalInfo("Failed to load data.");
    });
});

// ---------------------------------------------------------------------------
// CSV loader
// ---------------------------------------------------------------------------
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

function setTotalInfo(text) {
  const el = document.getElementById("statsTotalInfo");
  if (el) el.textContent = text;
}

// ---------------------------------------------------------------------------
// FILTER SETUP
// ---------------------------------------------------------------------------
function buildFilterOptions(rows) {
  const years = new Set();
  const periods = new Set();
  const regions = new Set();
  const topics = new Set();
  const series = new Set();

  rows.forEach(r => {
    const y = r.PubDate ? r.PubDate.getFullYear() : null;
    if (y) years.add(String(y));

    (r.Period.length ? r.Period : ["No period assigned"]).forEach(p => periods.add(p));
    (r.Region.length ? r.Region : ["No region assigned"]).forEach(g => regions.add(g));
    (r.Topic.length ? r.Topic : ["No topic assigned"]).forEach(t => topics.add(t));
    (r.Series.length ? r.Series : ["No series assigned"]).forEach(s => series.add(s));
  });

  const host = document.getElementById("filterDropdownHost");
  host.innerHTML = "";

  const dataMap = {
    year: [...years].sort((a, b) => Number(b) - Number(a)),
    period: sortWithNoneLast([...periods]),
    region: sortAlphaNoneLast([...regions]),
    topic: sortAlphaNoneLast([...topics]),
    series: sortAlphaNoneLast([...series]) 
  };

  ["year","period","region","topic","series"].forEach(key => {
    const panel = document.createElement("div");
    panel.className = "filter-dropdown";
    panel.dataset.filter = key;

    const inner = document.createElement("div");
    inner.className = "filter-dropdown-inner";
    inner.id = key + "Options";

    dataMap[key].forEach(v => {
      const label = document.createElement("label");
      label.className = "filter-option";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = v;

      input.addEventListener("change", () => {
        const set =
          key === "year"    ? statsState.filters.years :
          key === "period"  ? statsState.filters.periods :
          key === "region"  ? statsState.filters.regions :
          key === "topic"   ? statsState.filters.topics :
          statsState.filters.series; 

        input.checked ? set.add(v) : set.delete(v);
        applyFiltersAndRender();
      });

      label.appendChild(input);
      label.appendChild(document.createTextNode(stripPrefix(v)));
      inner.appendChild(label);
    });

    panel.appendChild(inner);
    host.appendChild(panel);
  });

  wirePillButtons();
}

function wirePillButtons() {
  const pills = [...document.querySelectorAll(".pill-button")];
  const panels = [...document.querySelectorAll(".filter-dropdown")];
  const host = document.getElementById("filterDropdownHost");

  function closeAll() {
    pills.forEach(p => p.classList.remove("active"));
    panels.forEach(p => {
      p.classList.remove("open");
      host.appendChild(p);
      p.style.position = "";
      p.style.left = "";
      p.style.top = "";
      p.style.width = "";
    });
  }

  pills.forEach(pill => {
    pill.addEventListener("click", e => {
      e.stopPropagation();
      const key = pill.dataset.filter;
      const panel = panels.find(p => p.dataset.filter === key);

      const isActive = pill.classList.contains("active");
      if (isActive) {
        closeAll();
        return;
      }

      closeAll();
      pill.classList.add("active");
      panel.classList.add("open");

      const wrapper = pill.closest(".pill-wrapper") || pill.parentElement;
      wrapper.appendChild(panel);

      panel.style.position = "absolute";
      panel.style.left = "0px";
      panel.style.top = "100%";
      panel.style.width = "max-content";
    });
  });

  panels.forEach(panel =>
    panel.addEventListener("click", e => e.stopPropagation())
  );

  document.addEventListener("click", closeAll);
}

function resetFilters() {
  const f = statsState.filters;
  f.years.clear();
  f.periods.clear();
  f.regions.clear();
  f.topics.clear();

  document
    .querySelectorAll(".filter-dropdown input[type='checkbox']")
    .forEach(c => (c.checked = false));

  applyFiltersAndRender();
}

// ---------------------------------------------------------------------------
// APPLY FILTERS AND RENDER ALL OUTPUT
// ---------------------------------------------------------------------------
function applyFiltersAndRender() {
  const { years, periods, regions, topics, series } = statsState.filters;

  let rows = statsState.raw.filter(r => {
    if (years.size) {
      const y = r.PubDate ? String(r.PubDate.getFullYear()) : "";
      if (!years.has(y)) return false;
    }

    if (periods.size) {
      const tags = r.Period.length ? r.Period : ["No period assigned"];
      if (!tags.some(t => periods.has(t))) return false;
    }

    if (regions.size) {
      const tags = r.Region.length ? r.Region : ["No region assigned"];
      if (!tags.some(t => regions.has(t))) return false;
    }

    if (topics.size) {
      const tags = r.Topic.length ? r.Topic : ["No topic assigned"];
      if (!tags.some(t => topics.has(t))) return false;
    }

    if (series.size) {
      const tags = r.Series.length ? r.Series : ["No series assigned"];
      if (!tags.some(s => series.has(s))) return false;
    }

    return true;
  });

  statsState.filtered = rows;

  rebuildFilterOptionsCascade();
  renderChips();

  const totalFiltered = rows.length;
  const totalAll = statsState.raw.length;
  
  setTotalInfo(
    totalFiltered === totalAll
      ? `${totalAll} episodes in total`
      : `${totalFiltered} episodes in current view — based on ${totalAll} total episodes`
  );

  if (!totalFiltered) {
    renderStatsTable("periodCard", []);
    renderStatsTable("regionCard", []);
    renderStatsTable("topicCard", []);

    renderLineChart("chart-period", [], "Period", generatePalette(20));
    renderLineChart("chart-region", [], "Region", generatePalette(15));
    renderLineChart("chart-topic", [], "Topic", generatePalette(20));
    return;
  }

  const periodStats = buildTagStats(
    rows,
    r => (r.Period.length ? r.Period : ["No period assigned"]),
    totalAll
  );
  
  const regionStats = buildTagStats(
    rows,
    r => (r.Region.length ? r.Region : ["No region assigned"]),
    totalAll
  );
  
  const topicStats = buildTagStats(
    rows,
    r => (r.Topic.length ? r.Topic : ["No topic assigned"]),
    totalAll
  );

  renderStatsTable("periodCard", periodStats.sort((a, b) => b.count - a.count));
  renderStatsTable("regionCard", regionStats.sort((a, b) => b.count - a.count));
  renderStatsTable("topicCard", topicStats.sort((a, b) => b.count - a.count));

  renderLineChart("chart-period", rows, "Period", generatePalette(20));
  renderLineChart("chart-region", rows, "Region", generatePalette(15));
  renderLineChart("chart-topic", rows, "Topic", generatePalette(20));

  updateUrlFromState();

}

// ---------------------------------------------------------------------------
// CHIPS
// ---------------------------------------------------------------------------
function renderChips() {
  const { years, periods, regions, topics, series } = statsState.filters;
  const box = document.getElementById("activeChips");
  box.innerHTML = "";

  years.forEach(v => box.appendChild(makeChip("Year", v, () => removeFilter("year", v))));
  periods.forEach(v => box.appendChild(makeChip("Period", v, () => removeFilter("period", v))));
  regions.forEach(v => box.appendChild(makeChip("Region", v, () => removeFilter("region", v))));
  topics.forEach(v => box.appendChild(makeChip("Topic", v, () => removeFilter("topic", v))));
  series.forEach(v => box.appendChild(makeChip("Series", v, () => removeFilter("series", v))));
}

function makeChip(label, value, removeFn) {
  const el = document.createElement("div");
  el.className = "chip";
  el.innerHTML = `
    <span class="chip-label">${label}:</span>
    ${escapeHtml(stripPrefix(value))}
    <button class="chip-x">×</button>
  `;
  el.querySelector(".chip-x").addEventListener("click", removeFn);
  return el;
}

function removeFilter(key, value) {
  const set =
    key === "year"    ? statsState.filters.years :
    key === "period"  ? statsState.filters.periods :
    key === "region"  ? statsState.filters.regions :
    key === "topic"   ? statsState.filters.topics :
    statsState.filters.series;   


  set.delete(value);
  uncheck(key, value);
  applyFiltersAndRender();
}

function uncheck(key, value) {
  const panel = document.querySelector(`.filter-dropdown[data-filter="${key}"]`);
  if (!panel) return;
  panel.querySelectorAll("input").forEach(i => {
    if (i.value === value) i.checked = false;
  });
}

// ---------------------------------------------------------------------------
// CASCADE: rebuild available filter options based on filtered dataset
// ---------------------------------------------------------------------------
function rebuildFilterOptionsCascade() {
  const { years, periods, regions, topics, series } = statsState.filters;
  const rows = statsState.filtered;

  const yearSet = new Set();
  const periodSet = new Set();
  const regionSet = new Set();
  const topicSet = new Set();
  const seriesSet = new Set();

  rows.forEach(r => {
    const y = r.PubDate ? String(r.PubDate.getFullYear()) : null;
    if (y) yearSet.add(y);

    (r.Period.length ? r.Period : ["No period assigned"]).forEach(v => periodSet.add(v));
    (r.Region.length ? r.Region : ["No region assigned"]).forEach(v => regionSet.add(v));
    (r.Topic.length ? r.Topic : ["No topic assigned"]).forEach(v => topicSet.add(v));
    (r.Series.length ? r.Series : ["No series assigned"]).forEach(v => seriesSet.add(v));
  });

  const dropdowns = [
    { key: "year", set: yearSet, active: years.size > 0 },
    { key: "period", set: periodSet, active: periods.size > 0 },
    { key: "region", set: regionSet, active: regions.size > 0 },
    { key: "topic", set: topicSet, active: topics.size > 0 },
    { key: "series", set: seriesSet, active: series.size > 0 }  // ⭐
  ];

  dropdowns.forEach(({ key, set, active }) => {
    if (active) return;

    const panel = document.querySelector(`.filter-dropdown[data-filter="${key}"]`);
    const inner = panel.querySelector(".filter-dropdown-inner");
    inner.innerHTML = "";

    const sorted =
      key === "year"
        ? [...set].sort((a, b) => Number(b) - Number(a))
        : key === "period"
        ? sortWithNoneLast([...set])
        : sortAlphaNoneLast([...set]);

    sorted.forEach(v => {
      const label = document.createElement("label");
      label.className = "filter-option";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = v;

      const owningSet =
        key === "year"
          ? years
          : key === "period"
          ? periods
          : key === "region"
          ? regions
          : topics;

      input.checked = owningSet.has(v);
      input.addEventListener("change", () => {
        input.checked ? owningSet.add(v) : owningSet.delete(v);
        applyFiltersAndRender();
      });

      label.appendChild(input);
      label.appendChild(document.createTextNode(stripPrefix(v)));
      inner.appendChild(label);
    });
  });
}

// ---------------------------------------------------------------------------
// STATS BUILD
// ---------------------------------------------------------------------------
function buildTagStats(rows, selectorFn, totalEpisodes) {
  const map = new Map();
  rows.forEach(r => {
    const tags = selectorFn(r) || [];
    tags.forEach(tag =>
      map.set(tag, (map.get(tag) || 0) + 1)
    );
  });

  return [...map.entries()].map(([label, count]) => ({
    label,
    count,
    pct: totalEpisodes ? (count / totalEpisodes) * 100 : 0
  }));
}

// ---------------------------------------------------------------------------
// TAG HELPERS
// ---------------------------------------------------------------------------
function parseTags(v) {
  if (!v) return [];
  return v
    .split(",")
    .map(x => x.trim())   // ⭐ behåll prefix!
    //.map(x => stripPrefix(x.trim()))
    .filter(Boolean);
}

function stripPrefix(v) {
  return v.replace(/^\d+\.\s*/, "");
}

function sortAlphaNoneLast(arr) {
  return arr.sort((a, b) => {
    const aIsNone = a.startsWith("No ");
    const bIsNone = b.startsWith("No ");

    if (aIsNone && !bIsNone) return 1;
    if (!aIsNone && bIsNone) return -1;

    // Normal alfabetisk sortering
    return a.localeCompare(b);
  });
}

function sortWithNoneLast(arr) {
  return arr.sort((a, b) => {
    const aIsNone = a.startsWith("No ");
    const bIsNone = b.startsWith("No ");

    // "No … assigned" sist
    if (aIsNone && !bIsNone) return 1;
    if (!aIsNone && bIsNone) return -1;

    // Hämta prefixnummer
    const aNum = parseInt(a);
    const bNum = parseInt(b);

    // Om båda har nummer → sortera numeriskt ASC
    if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;

    // Om bara en har nummer → nummer först
    if (!isNaN(aNum) && isNaN(bNum)) return -1;
    if (isNaN(aNum) && !isNaN(bNum)) return 1;

    // Fallback → alfabetiskt
    return a.localeCompare(b);
  });
}

// ---------------------------------------------------------------------------
// RENDER TABLES
// ---------------------------------------------------------------------------
function renderStatsTable(cardId, rows) {
  const card = document.getElementById(cardId);
  const tbody = card.querySelector("tbody");

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="3" class="stats-placeholder">No data</td></tr>`;
    return;
  }

  tbody.innerHTML = "";

  rows.forEach(({ label, count, pct }) => {
    const tr = document.createElement("tr");

    const isUnassigned =
      label === "No period assigned" ||
      label === "No region assigned" ||
      label === "No topic assigned";

    if (isUnassigned) tr.classList.add("stats-noassign");

    tr.innerHTML = `
      <td>${escapeHtml(stripPrefix(label))}</td>
      <td class="stats-num">${count}</td>
      <td class="stats-num">${pct.toFixed(1)}%</td>
    `;
    tbody.appendChild(tr);
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

// ---------------------------------------------------------------------------
// LINE CHARTS
// ---------------------------------------------------------------------------
function generatePalette(n) {
  const baseColors = [
    "#8B1E3F", "#D95F53", "#F2C14E", "#6AA84F", "#3C91E6",
    "#342EAD", "#6A4C93", "#C44536", "#FF7F11", "#2A9D8F",
    "#264653", "#E76F51", "#E9C46A", "#8A508F", "#4CC9F0",
    "#4361EE", "#7209B7", "#F72585", "#5A189A", "#0A9396"
  ];
  return baseColors.slice(0, n);
}

function renderLineChart(canvasId, episodes, tagField, palette) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  if (canvasId === "chart-period" && chartPeriod) chartPeriod.destroy();
  if (canvasId === "chart-region" && chartRegion) chartRegion.destroy();
  if (canvasId === "chart-topic" && chartTopic) chartTopic.destroy();

  if (!episodes.length) {
    const empty = new Chart(ctx, {
      type: "line",
      data: { labels: [], datasets: [] },
      options: { responsive: true, maintainAspectRatio: false }
    });

    if (canvasId === "chart-period") chartPeriod = empty;
    if (canvasId === "chart-region") chartRegion = empty;
    if (canvasId === "chart-topic") chartTopic = empty;
    return;
  }

  // Alla år i sorterad ordning
  const years = [...new Set(
    episodes
      .map(e => e.PubDate?.getFullYear())
      .filter(Boolean)
  )].sort((a, b) => a - b);

  // Alla taggar (topics, periods, regions)
  const tags = new Set();
  episodes.forEach(e => (e[tagField] || []).forEach(t => tags.add(t)));
  let tagList = [...tags];

  // Sortering efter filtreringar
  if (tagField === "Period") {
    const active = statsState.filters.periods;
    if (active.size) tagList = tagList.filter(t => active.has(t));
    tagList = sortWithNoneLast(tagList);
  } else if (tagField === "Region") {
    const active = statsState.filters.regions;
    if (active.size) tagList = tagList.filter(t => active.has(t));
    tagList = sortAlphaNoneLast(tagList);
  } else if (tagField === "Topic") {
    const active = statsState.filters.topics;
    if (active.size) tagList = tagList.filter(t => active.has(t));
    tagList = sortAlphaNoneLast(tagList);
  }

  if (!tagList.length) {
    const empty = new Chart(ctx, {
      type: "line",
      data: { labels: years, datasets: [] },
      options: { responsive: true, maintainAspectRatio: false }
    });

    if (canvasId === "chart-period") chartPeriod = empty;
    if (canvasId === "chart-region") chartRegion = empty;
    if (canvasId === "chart-topic") chartTopic = empty;
    return;
  }

  const datasets = [];

  tagList.forEach((tag, i) => {
    const color = palette[i % palette.length];

    // karta: year -> count
    const yearToValue = new Map();
    years.forEach(y => {
      const cnt = episodes.filter(
        e =>
          e.PubDate &&
          e.PubDate.getFullYear() === y &&
          e[tagField]?.includes(tag)
      ).length;
      yearToValue.set(y, cnt > 0 ? cnt : null);
    });

    const dataArr = years.map(y => yearToValue.get(y));

    // Ny logik: endast prick om isolerad
    const pointRadiusArr = dataArr.map((v, idx) => {
      if (v === null) return 0;
      const prev = dataArr[idx - 1] ?? null;
      const next = dataArr[idx + 1] ?? null;
      if (prev === null && next === null) return 4; // isolerad
      return 0; // annars ingen prick
    });

    datasets.push({
      label: stripPrefix(tag),
      data: dataArr,
      borderColor: color,
      backgroundColor: color + "33",
      tension: 0,
      borderWidth: 2,
      spanGaps: false,
      pointRadius: pointRadiusArr,
      pointHoverRadius: 6,
      segment: {
        borderDash: ctx => {
          const i = ctx.p0DataIndex;
          const prev = ctx.chart.data.datasets[ctx.datasetIndex].data[i];
          const next = ctx.chart.data.datasets[ctx.datasetIndex].data[i + 1];

          if (prev !== null && next !== null) return [];
          return [6, 6]; // streckad vid null-gap
        }
      }
    });
  });

  const chart = new Chart(ctx, {
    type: "line",
    data: { labels: years, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      plugins: { legend: { position: "bottom" } },
      scales: {
        x: { title: { display: true, text: "Year" } },
        y: { beginAtZero: true, title: { display: true, text: "Episodes" } }
      }
    }
  });

  if (canvasId === "chart-period") chartPeriod = chart;
  if (canvasId === "chart-region") chartRegion = chart;
  if (canvasId === "chart-topic") chartTopic = chart;
}
// ---------------------------------------------------------------------------
// DATE PARSER
// ---------------------------------------------------------------------------
function parseEpisode(v) {
  const s = ("" + v).trim();
  const m = /^(\d+)/.exec(s);
  return m ? Number(m[1]) : null;
}

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function periodSortValue(v) {
  const n = parseInt(v);
  return isNaN(n) ? 9999 : n;   // icke-numrerade sist
}

function loadStateFromUrl() {
  const params = new URLSearchParams(window.location.search);

  ["years", "periods", "regions", "topics", "series"].forEach(key => {
    if (params.has(key)) {
      const values = params.get(key).split(",");
      values.forEach(v => statsState.filters[key].add(v));
    }
  });
}

function updateUrlFromState() {
  const params = new URLSearchParams();

  if (statsState.filters.years.size)
    params.set("years", [...statsState.filters.years].join(","));

  if (statsState.filters.periods.size)
    params.set("periods", [...statsState.filters.periods].join(","));

  if (statsState.filters.regions.size)
    params.set("regions", [...statsState.filters.regions].join(","));

  if (statsState.filters.topics.size)
    params.set("topics", [...statsState.filters.topics].join(","));

  if (statsState.filters.series.size)                                
    params.set("series", [...statsState.filters.series].join(","));

  const newUrl = `${location.pathname}?${params.toString()}`;
  history.replaceState({}, "", newUrl);
}

function applyUrlStateToUI() {
  ["year","period","region","topic","series"].forEach(key => {
    const panel = document.querySelector(`.filter-dropdown[data-filter="${key}"]`);
    if (!panel) return;

    const set =
      key === "year"
        ? statsState.filters.years
        : key === "period"
        ? statsState.filters.periods
        : key === "region"
        ? statsState.filters.regions
        : key === "topic"
        ? statsState.filters.topics
        : statsState.filters.series;  

    panel.querySelectorAll("input[type='checkbox']").forEach(input => {
      input.checked = set.has(input.value);
    });
  });
}

