// stats.js
// Simple stats overview by Period, Region and Topic

const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTZC7Oawx266328_YGXnVt5d970Jbca-XIsYkbQQfp78LKLOsuLqZjPyoAmeto9rrhojtEBi0zMLkOd/pub?output=csv";

document.addEventListener("DOMContentLoaded", () => {
  loadCsv(SHEET_CSV_URL)
    .then(rows => {
      const normalized = rows.map(r => ({
        Episode: parseEpisode(r["Episode"]),
        Title: (r["Title"] || "").trim(),
        Region: parseTags(r["Region"]),
        Period: parseTags(r["Period"]),
        Topic: parseTags(r["Topic"]),
        PubDate: parseDate(r["Publish Date"])
      }));

      const episodes = normalized.filter(r => r.Title);
      const totalEpisodes = episodes.length;

      if (!totalEpisodes) {
        setTotalInfo("No episodes found in data.");
        return;
      }

      setTotalInfo(`${totalEpisodes} episodes in total (100%)`);

      // Build counts
      const periodStats = buildTagStats(
        episodes,
        r => (r.Period.length ? r.Period : ["No period assigned"]),
        totalEpisodes
      );

      const regionStats = buildTagStats(
        episodes,
        r => (r.Region.length ? r.Region : ["No region assigned"]),
        totalEpisodes
      );

      const topicStats = buildTagStats(
        episodes,
        r => (r.Topic && r.Topic.length ? r.Topic : ["No topic assigned"]),
        totalEpisodes
      );

      // Sort like on main page
      const sortedPeriods = periodStats.sort((a, b) => b.count - a.count);
      const sortedRegions = regionStats.sort((a, b) => b.count - a.count);
      const sortedTopics = topicStats.sort((a, b) => b.count - a.count);

      // Render tables
      renderStatsTable("periodCard", sortedPeriods);
      renderStatsTable("regionCard", sortedRegions);
      renderStatsTable("topicCard", sortedTopics);

      // --- NEW: Render line charts ---
      renderLineChart("chart-period", episodes, "Period", generatePalette(20));
      renderLineChart("chart-region", episodes, "Region", generatePalette(15));
      renderLineChart("chart-topic", episodes, "Topic", generatePalette(20));
    })
    .catch(err => {
      console.error("Failed to load CSV for stats", err);
      setTotalInfo("Failed to load data.");
      ["periodCard", "regionCard", "topicCard"].forEach(id => {
        const card = document.getElementById(id);
        if (!card) return;
        const tbody = card.querySelector("tbody");
        if (tbody) {
          tbody.innerHTML = `<tr><td colspan="3" class="stats-placeholder">Failed to load data.</td></tr>`;
        }
      });
    });
});

// --------------------------------------------------------
// CSV load
// --------------------------------------------------------
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

// --------------------------------------------------------
// Stats builders
// --------------------------------------------------------
function buildTagStats(rows, selectorFn, totalEpisodes) {
  const map = new Map();

  rows.forEach(r => {
    let tags = selectorFn(r) || [];
    if (!tags.length) return;

    // Ensure no duplicates per episode for same tag
    tags = Array.from(new Set(tags));

    tags.forEach(tag => {
      const current = map.get(tag) || 0;
      map.set(tag, current + 1);
    });
  });

  const result = [];
  map.forEach((count, label) => {
    const pct = (count / totalEpisodes) * 100;
    result.push({
      label,
      count,
      pct
    });
  });

  return result;
}

function parseEpisode(v) {
  if (v == null) return null;
  const s = String(v).trim();
  const m = /^(\d+)/.exec(s);
  return m ? Number(m[1]) : null;
}

// --------------------------------------------------------
// Tag utilities (same logic as data.js)
// --------------------------------------------------------
function parseTags(v) {
  if (!v) return [];
  return String(v)
    .split(",")
    .map(x => stripPrefix(x.trim()))
    .filter(Boolean);
}

function stripPrefix(v) {
  return v.replace(/^\d+\.\s*/, "");
}

function sortWithNoneLast(arr) {
  return arr.sort((a, b) => {
    const aIsNone = a.startsWith("No ");
    const bIsNone = b.startsWith("No ");
    if (aIsNone && !bIsNone) return 1;
    if (!aIsNone && bIsNone) return -1;
    const aa = stripPrefix(a);
    const bb = stripPrefix(b);
    return bb.localeCompare(aa, undefined, { numeric: true });
  });
}

function sortAlphaNoneLast(arr) {
  return arr.sort((a, b) => {
    const aIsNone = a.startsWith("No ");
    const bIsNone = b.startsWith("No ");
    if (aIsNone && !bIsNone) return 1;
    if (!aIsNone && bIsNone) return -1;
    return a.localeCompare(b);
  });
}

// --------------------------------------------------------
// Render tables
// --------------------------------------------------------
function renderStatsTable(cardId, rows) {
  const card = document.getElementById(cardId);
  if (!card) return;
  const tbody = card.querySelector("tbody");
  if (!tbody) return;

  if (!rows || !rows.length) {
    tbody.innerHTML = `<tr><td colspan="3" class="stats-placeholder">No data</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  rows.forEach(({ label, count, pct }) => {
    const tr = document.createElement("tr");
    const pctStr = `${pct.toFixed(1)}%`;

    // highlight unassigned only
    const isUnassigned =
      label === "No period assigned" ||
      label === "No region assigned" ||
      label === "No topic assigned";

    if (isUnassigned) {
      tr.classList.add("stats-noassign");
    }

    tr.innerHTML = `
      <td>${escapeHtml(label)}</td>
      <td class="stats-num">${count}</td>
      <td class="stats-num">${pctStr}</td>
    `;
    tbody.appendChild(tr);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

// --------------------------------------------------------
// NEW — LINE CHARTS
// --------------------------------------------------------

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

  // 1. Extract all years
  const allYears = Array.from(
    new Set(
      episodes
        .map(e => (e.PubDate ? e.PubDate.getFullYear() : null))
        .filter(Boolean)
    )
  ).sort((a, b) => a - b);

  // 2. Extract all tags (periods, regions, topics)
  const allTags = new Set();
  episodes.forEach(ep => {
    const tags = ep[tagField] || [];
    tags.forEach(t => allTags.add(t));
  });

  const tagList = Array.from(allTags);

  // 3. Build dataset per tag
  const datasets = tagList.map((tag, i) => {
    const color = palette[i % palette.length];
    const data = allYears.map(y => {
      return episodes.filter(
        ep =>
          ep.PubDate &&
          ep.PubDate.getFullYear() === y &&
          ep[tagField].includes(tag)
      ).length;
    });

    return {
      label: tag,
      data,
      borderColor: color,
      backgroundColor: color + "33",
      tension: 0.3,
      borderWidth: 2,
      pointRadius: 0
    };
  });

  // 4. Create Chart.js line chart
  new Chart(ctx, {
    type: "line",
    data: {
      labels: allYears,
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "nearest",
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: "bottom"
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: "Year"
          }
        },
        y: {
          title: {
            display: true,
            text: "Episodes"
          },
          beginAtZero: true
        }
      }
    }
  });
}

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}