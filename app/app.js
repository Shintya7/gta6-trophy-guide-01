/* Vice City Trophy Guide — tracker logic, written for this entry.
   Data: app/data/trophies.json (official names, descriptions and grades as
   PlayStation publishes them; the guides and sources are the author's own).
   Progress lives only in this browser (localStorage) and can be exported to
   a file and imported back. No network requests at runtime. */

const STORE_KEY = "gta6-trophy-checklist";
const SPOILER_KEY = "gta6-trophy-spoiler";

// The six-stage platinum roadmap. The text is the author's own summary of
// what each stage asks; the counts are checked against trophies.json by the
// build entrypoint, so the page cannot drift away from the data.
const ROADMAP = [
  { n: 1, title: "Play the story", text: "Finish all 5 chapters and the named missions — 12 story trophies, all automatic. Do the Chapter 1 balcony meditation with Lucia for Positive Mental Attitude, and keep a manual save at the start of every chapter (no mission replay).", count: 12 },
  { n: 2, title: "Strangers & partners", text: "Finish the 5 named stranger strands (Andy, Kenton, Billy, Randy, Tyrone) and 3 more for Strangers & Freaks — start strands as soon as they unlock. Rob shops and lose 4 stars with your partner on the way.", count: 8 },
  { n: 3, title: "Activities & combat", text: "250 stunts, gold at all 42 Shooting Range challenges, 14 drone races, 20 race wins, fishing vs Cal, hunting for Bret, the arcade and the bowling alley — and 5 takedowns in one Combat Focus.", count: 17 },
  { n: 4, title: "The world & the money", text: "Explore all 52 areas, 100 WAiNK spots, 3 card sets, 100 vehicles, all 8 garages, 10 Scooter Bros registrations, 5 bank vaults, one operation per gang — and launder $250,000 in marked bills.", count: 9 },
  { n: 5, title: "Clean-up & 100%", text: "The 100% checklist (Progress > Stats > 100% Completion) opens after the finale — nothing on it is missable, progress during the story counts, and its thresholds are lenient. Finish the 50 challenges and the unconfirmed oddities last.", count: 8 },
  { n: 6, title: "The platinum", text: "Vice Got a Price! — earned the moment the other 54 are done. PowerPyx rates the whole set 4/10 and about 200 hours.", count: 1 },
];
const KIND_FILTERS = [
  { id: "all", label: "All trophies" },
  { id: "story", label: "Story" },
  { id: "side", label: "Strangers" },
  { id: "activities", label: "Activities" },
  { id: "collectibles", label: "Collectibles" },
  { id: "crime", label: "Crime" },
  { id: "misc", label: "Misc" },
  { id: "completion", label: "100%" },
  { id: "missable", label: "Missable" },
  { id: "online", label: "Online" },
];
const KIND_LABEL = { story: "Story", side: "Strangers", activities: "Activities", collectibles: "Collectibles", crime: "Crime", misc: "Misc", completion: "100% completion", platinum: "Platinum" };
const GRADE_LABEL = { platinum: "Platinum", gold: "Gold", silver: "Silver", bronze: "Bronze" };
const KIND_ORDER = ["story", "side", "activities", "collectibles", "crime", "misc", "completion", "platinum"];

let data = null;          // the parsed trophies.json document
let earned = new Set();   // ids the player has ticked
let spoiler = false;      // spoiler-safe mode on or off
let kindFilter = "all";
let gradeFilter = "all";
let query = "";
let missableOnly = false;
let detailId = null;      // id open in the detail modal, or null
let dailyId = null;       // today's pick, recomputed on every render

const $ = (id) => document.getElementById(id);

async function loadData() {
  const res = await fetch("data/trophies.json");
  data = await res.json();
  return data.trophies;
}

function loadProgress() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
    earned = new Set(raw.filter((id) => Number.isInteger(id)));
  } catch { earned = new Set(); }
  spoiler = localStorage.getItem(SPOILER_KEY) === "1";
}

function saveProgress() {
  localStorage.setItem(STORE_KEY, JSON.stringify([...earned].sort((a, b) => a - b)));
}

// Spoiler-safe mode hides a story trophy's name and description until the
// player has earned it. Nothing else is ever hidden.
function isHidden(t) {
  return spoiler && t.kind === "story" && !earned.has(t.id);
}

function countEarned(list) {
  return list.filter((t) => earned.has(t.id)).length;
}

// ---- Dashboard: ring, totals, trophy of the day, stage bars ----

function renderDashboard() {
  const total = data.trophies.length;
  const n = earned.size;
  const pct = Math.round((n / total) * 100);
  $("ringText").textContent = n + "/" + total;
  $("ring").style.background =
    "conic-gradient(#ff2e88 " + (pct * 3.6) + "deg, #2dd4bf " + (pct * 3.6) + "deg, #3a2560 0deg)";
  $("earnedCount").textContent = n;
  $("earnedPct").textContent = pct + "%";
  $("barFill").style.width = pct + "%";
  const byGrade = (g) => countEarned(data.trophies.filter((t) => t.grade === g));
  const totalGrade = (g) => data.trophies.filter((t) => t.grade === g).length;
  $("gradeLine").textContent =
    "Platinum " + byGrade("platinum") + "/" + totalGrade("platinum") +
    " · Gold " + byGrade("gold") + "/" + totalGrade("gold") +
    " · Silver " + byGrade("silver") + "/" + totalGrade("silver") +
    " · Bronze " + byGrade("bronze") + "/" + totalGrade("bronze");
  // One earned/total pair per kind, so the player can see at a glance which
  // corner of the list still needs work (story done, crime lagging, …).
  $("kindLine").textContent = KIND_ORDER.map((k) => {
    const list = data.trophies.filter((t) => t.kind === k);
    return KIND_LABEL[k] + " " + countEarned(list) + "/" + list.length;
  }).join(" · ");
  renderDaily();
  renderStageBars();
}

// Trophy of the day: one pick per calendar date, drawn deterministically from
// the trophies not yet earned, so every visitor sees the same pick on the
// same day and a new one tomorrow. Once all 55 are earned the pool is the
// whole list, so the pick becomes a trophy to revisit. The dashboard line
// never names a hidden story trophy — spoiler-safe mode shows a placeholder
// instead, and the detail modal keeps hiding it until it is earned.
function pickDaily() {
  const remaining = data.trophies.filter((t) => !earned.has(t.id));
  const pool = remaining.length > 0 ? remaining : data.trophies;
  const now = new Date();
  const seed = now.getFullYear() * 372 + (now.getMonth() + 1) * 31 + now.getDate();
  return pool[seed % pool.length];
}

function renderDaily() {
  const pick = pickDaily();
  dailyId = pick.id;
  const allDone = data.trophies.every((t) => earned.has(t.id));
  if (isHidden(pick)) {
    $("dailyLine").textContent = allDone
      ? "All 55 trophies earned — today's revisit is a hidden story trophy. Open it to take another look."
      : "Today's trophy is a hidden story trophy. Open it to see its guide once you have earned it.";
  } else {
    $("dailyLine").innerHTML = "Today's trophy: <strong>" + pick.name + "</strong>" +
      (allDone ? " — all 55 earned, so here is one to revisit." : " — " + countEarned([pick]) + "/1 earned, " + data.trophies.filter((t) => !earned.has(t.id)).length + " still to go.");
  }
  $("dailyOpen").textContent = isHidden(pick) ? "Open today's trophy" : "Open " + pick.name;
}

// A thin earned/total bar for every roadmap stage, under the dashboard, so
// the player can see which stage is closest to done without scrolling to
// the roadmap itself.
function renderStageBars() {
  $("stageBars").innerHTML = ROADMAP.map((s) => {
    const list = data.trophies.filter((t) => t.stage === s.n);
    const done = countEarned(list);
    const pct = list.length ? Math.round((done / list.length) * 100) : 0;
    return "<div class=\"stage-bar\"><span class=\"stage-bar-label\">Stage " + s.n + " · " + s.title + "</span>" +
      "<span class=\"stage-bar-track\"><span class=\"stage-bar-fill\" style=\"width:" + pct + "%\"></span></span>" +
      "<span class=\"stage-bar-count\">" + done + "/" + list.length + "</span></div>";
  }).join("");
}

function renderStages() {
  $("stages").innerHTML = ROADMAP.map((s) => {
    const done = countEarned(data.trophies.filter((t) => t.stage === s.n));
    return "<li class=\"stage-" + s.n + "\"><p class=\"stage-num\">Stage " + s.n + "</p><h3>" + s.title + "</h3><p>" + s.text + "</p><span class=\"stage-count\">" + done + " / " + s.count + " earned</span></li>";
  }).join("");
}

// ---- Filters and the trophy list ----

function renderChips() {
  $("kindChips").innerHTML = KIND_FILTERS.map((k) => {
    const count = k.id === "all" ? data.trophies.length
      : k.id === "missable" ? data.trophies.filter((t) => t.missable).length
      : k.id === "online" ? 0
      : data.trophies.filter((t) => t.kind === k.id).length;
    return "<button type=\"button\" class=\"chip" + (kindFilter === k.id ? " active" : "") + "\" data-kind=\"" + k.id + "\">" + k.label + " (" + count + ")</button>";
  }).join("");
  document.querySelectorAll(".chip").forEach((b) => {
    b.addEventListener("click", () => { kindFilter = b.dataset.kind; renderChips(); renderList(); });
  });
}

function trophyMatches(t) {
  if (kindFilter === "missable" && !t.missable) return false;
  if (kindFilter === "online") return false;
  if (kindFilter !== "all" && kindFilter !== "missable" && t.kind !== kindFilter) return false;
  if (gradeFilter !== "all" && t.grade !== gradeFilter) return false;
  if (missableOnly && !t.missable) return false;
  if (query) {
    const hay = (t.name + " " + t.description + " " + t.guide).toLowerCase();
    if (!hay.includes(query)) return false;
  }
  return true;
}

function cardHtml(t) {
  const isEarned = earned.has(t.id);
  const hidden = isHidden(t);
  const name = hidden ? "Hidden story trophy" : t.name;
  const official = hidden ? "Spoiler-safe mode: earn this trophy to reveal its name and description." : t.description;
  const peek = hidden ? "" : t.guide.length > 150 ? t.guide.slice(0, 150) + "…" : t.guide;
  const tags = "<span class=\"tag grade-" + t.grade + "\">" + GRADE_LABEL[t.grade] + "</span>" +
    "<span class=\"tag\">" + KIND_LABEL[t.kind] + "</span>" +
    (t.missable ? "<span class=\"tag missable\">⚠ Missable</span>" : "") +
    (hidden ? "<span class=\"tag spoiler\">Hidden</span>" : "") +
    (t.target ? "<span class=\"tag\">" + t.target.toLocaleString() + " needed</span>" : "");
  return "<button type=\"button\" class=\"card" + (isEarned ? " earned" : "") + "\" data-id=\"" + t.id + "\">" +
    "<input type=\"checkbox\" " + (isEarned ? "checked" : "") + " tabindex=\"-1\" aria-label=\"Mark " + name + " earned\">" +
    "<span class=\"card-body\"><h3>" + name + "</h3><p class=\"official\">" + official + "</p>" +
    (peek ? "<p class=\"guide-peek\">" + peek + "</p>" : "") +
    "<span class=\"tags\">" + tags + "</span></span></button>";
}

function renderList() {
  const shown = data.trophies.filter(trophyMatches);
  $("list").innerHTML = shown.map(cardHtml).join("");
  $("empty").hidden = shown.length > 0;
  const total = data.trophies.length;
  $("resultLine").textContent = kindFilter === "online"
    ? "There are no online trophies in GTA VI — all 55 are single-player, so the Online filter is empty on purpose."
    : "Showing " + shown.length + " of " + total + " trophies · " + earned.size + " earned.";
  document.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("click", (ev) => {
      const id = Number(card.dataset.id);
      if (ev.target.type === "checkbox") { toggleEarned(id); return; }
      openDetail(id);
    });
  });
}

function refreshAll() {
  renderDashboard(); renderStages(); renderList();
}

function toggleEarned(id) {
  if (earned.has(id)) earned.delete(id); else earned.add(id);
  saveProgress();
  refreshAll();
  if (detailId === id) fillDetail(data.trophies.find((t) => t.id === id));
}

// Stuck on what to chase next? Pick a random trophy you have not earned yet
// and open its guide. Once every trophy is earned the pool is the whole list,
// so the button keeps working as a way to revisit one at random.
function pickRandomTrophy() {
  const remaining = data.trophies.filter((t) => !earned.has(t.id));
  const pool = remaining.length > 0 ? remaining : data.trophies;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  openDetail(pick.id);
  $("resultLine").textContent = remaining.length > 0
    ? "Random pick from your " + remaining.length + " unearned trophies: " + (isHidden(pick) ? "a hidden story trophy — earn it to reveal the name." : pick.name + ".")
    : "All 55 trophies earned — here is a random one to revisit.";
}

// ---- Detail modal ----

function openDetail(id) {
  detailId = id;
  fillDetail(data.trophies.find((t) => t.id === id));
  $("detail").hidden = false;
}

function closeDetail() {
  $("detail").hidden = true;
  detailId = null;
}

function fillDetail(t) {
  const isEarned = earned.has(t.id);
  const hidden = isHidden(t);
  $("detailKind").textContent = KIND_LABEL[t.kind] + " · Stage " + t.stage + " · " + GRADE_LABEL[t.grade];
  $("detailName").textContent = hidden ? "Hidden story trophy" : t.name;
  $("detailOfficial").textContent = hidden
    ? "Spoiler-safe mode hides story trophies until you earn them. Tick the box to reveal this one."
    : t.description;
  $("detailBadges").innerHTML =
    "<span class=\"tag grade-" + t.grade + "\">" + GRADE_LABEL[t.grade] + "</span>" +
    "<span class=\"tag\">" + KIND_LABEL[t.kind] + "</span>" +
    (t.missable ? "<span class=\"tag missable\">⚠ Missable</span>" : "") +
    (t.target ? "<span class=\"tag\">Target: " + t.target.toLocaleString() + "</span>" : "");
  const note = t.missable_note || t.caution || "";
  $("detailNote").hidden = !note;
  $("detailNote").textContent = note;
  $("detailGuide").textContent = hidden ? "Hidden until earned." : t.guide;
  $("detailSources").innerHTML = hidden ? "" : t.sources.map((s) =>
    "<li><a href=\"" + s.url + "\" target=\"_blank\" rel=\"noopener\">" + s.name + "</a></li>").join("");
  $("detailToggle").textContent = isEarned ? "Mark as not earned" : "Mark earned";
}

// ---- Export / import / reset ----

function exportProgress() {
  const blob = new Blob([JSON.stringify({ game: "Grand Theft Auto VI", earned: [...earned].sort((a, b) => a - b), exported: new Date().toISOString() }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "gta6-trophy-progress.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

function importProgress(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const obj = JSON.parse(reader.result);
      const ids = Array.isArray(obj) ? obj : obj.earned;
      const valid = new Set(data.trophies.map((t) => t.id));
      const next = (ids || []).filter((id) => valid.has(Number(id))).map(Number);
      earned = new Set(next);
      saveProgress();
      refreshAll();
      $("resultLine").textContent = "Imported " + next.length + " earned trophies.";
    } catch {
      $("resultLine").textContent = "That file is not a valid progress export — nothing was changed.";
    }
  };
  reader.readAsText(file);
}

// ---- Wiring ----

function init() {
  loadData().then(() => {
    loadProgress();
    $("spoiler").checked = spoiler;
    renderDashboard(); renderStages(); renderChips(); renderList();

    $("search").addEventListener("input", (e) => { query = e.target.value.trim().toLowerCase(); renderList(); });
    $("grade").addEventListener("change", (e) => { gradeFilter = e.target.value; renderList(); });
    $("missableOnly").addEventListener("change", (e) => { missableOnly = e.target.checked; renderList(); });
    $("spoiler").addEventListener("change", (e) => {
      spoiler = e.target.checked;
      localStorage.setItem(SPOILER_KEY, spoiler ? "1" : "0");
      renderDashboard(); renderList();
    });
    $("export").addEventListener("click", exportProgress);
    $("random").addEventListener("click", pickRandomTrophy);
    $("dailyOpen").addEventListener("click", () => { if (dailyId != null) openDetail(dailyId); });
    $("import").addEventListener("change", (e) => { if (e.target.files[0]) importProgress(e.target.files[0]); e.target.value = ""; });
    $("reset").addEventListener("click", () => {
      if (!confirm("Clear all earned trophies? This cannot be undone — export first if you want a copy.")) return;
      earned = new Set(); saveProgress(); refreshAll();
    });
    $("detailClose").addEventListener("click", closeDetail);
    $("detailBackdrop").addEventListener("click", closeDetail);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDetail(); });
    $("detailToggle").addEventListener("click", () => { if (detailId != null) toggleEarned(detailId); });
    $("detailPrev").addEventListener("click", () => {
      const shown = data.trophies.filter(trophyMatches);
      const i = shown.findIndex((t) => t.id === detailId);
      if (i > 0) openDetail(shown[i - 1].id);
    });
    $("detailNext").addEventListener("click", () => {
      const shown = data.trophies.filter(trophyMatches);
      const i = shown.findIndex((t) => t.id === detailId);
      if (i >= 0 && i < shown.length - 1) openDetail(shown[i + 1].id);
    });
  });
}

init();
