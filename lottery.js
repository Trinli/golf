const WEEKS_STORAGE_KEY = "golf-weeks";
const PRIORITY_STORAGE_KEY = "golf-priority-config";
const HANDICAP_CAP = 110;
const MAX_NEAR_DISTANCE = 3; // för relationen "inom tre flighter"

// De mjuka kriterierna som går att prioritera om / göra hårda i Inställningar-fliken.
// Ordningen här är standardordningen (och den ursprungliga, hårdkodade prioritetsordningen).
const PRIORITY_CRITERIA = [
  { id: "cart", label: "Golfbilsdelning" },
  { id: "gender", label: "Kvinnor ihop" },
  { id: "time", label: "Starttidspreferens" },
  { id: "slow", label: "Undvik långsamma ihop" },
  { id: "rotation", label: "Rotation / variation" },
];

let weeks = loadWeeks();
let priorityConfig = loadPriorityConfig();
let attendingIds = new Set();
let currentResult = null; // { attendees: [player,...], groupSizes: [...], groupOf: [...] }
let selectedChipIndex = null;
let selectedEmptyGroup = null;

const addPlayerBtn = document.getElementById("add-player-btn");
const playersFooter = document.getElementById("players-footer");
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = {
  players: document.getElementById("tab-players"),
  lottery: document.getElementById("tab-lottery"),
  settings: document.getElementById("tab-settings"),
};

const priorityHardList = document.getElementById("priority-hard-list");
const prioritySoftList = document.getElementById("priority-soft-list");
const priorityResetBtn = document.getElementById("priority-reset-btn");

const lotteryDate = document.getElementById("lottery-date");
const lotteryStartTime = document.getElementById("lottery-start-time");
const attendanceList = document.getElementById("attendance-list");
const attendanceCount = document.getElementById("attendance-count");
const selectAllBtn = document.getElementById("select-all-btn");
const selectNoneBtn = document.getElementById("select-none-btn");
const generateBtn = document.getElementById("generate-btn");

const lotteryResult = document.getElementById("lottery-result");
const lotteryBanner = document.getElementById("lottery-banner");
const flightContainer = document.getElementById("flight-container");
const variationSummaryEl = document.getElementById("variation-summary");
const rerollBtn = document.getElementById("reroll-btn");
const mailBtn = document.getElementById("mail-btn");
const saveWeekBtn = document.getElementById("save-week-btn");

const historyList = document.getElementById("history-list");
const historyEmpty = document.getElementById("history-empty");

function loadWeeks() {
  try {
    const raw = localStorage.getItem(WEEKS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveWeeks() {
  localStorage.setItem(WEEKS_STORAGE_KEY, JSON.stringify(weeks));
}

function defaultPriorityConfig() {
  return PRIORITY_CRITERIA.map((c) => ({ id: c.id, hard: false }));
}

// Läser sparad prioritetskonfiguration, men skyddar mot skadad eller föråldrad
// data (t.ex. om ett kriterium tas bort eller läggs till i en framtida version) —
// okända id:n plockas bort, saknade läggs till som mjuka, i standardordning.
function loadPriorityConfig() {
  try {
    const raw = localStorage.getItem(PRIORITY_STORAGE_KEY);
    if (!raw) return defaultPriorityConfig();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultPriorityConfig();

    const validIds = new Set(PRIORITY_CRITERIA.map((c) => c.id));
    const cleaned = parsed.filter((c) => c && validIds.has(c.id)).map((c) => ({ id: c.id, hard: !!c.hard }));
    for (const criterion of PRIORITY_CRITERIA) {
      if (!cleaned.some((c) => c.id === criterion.id)) cleaned.push({ id: criterion.id, hard: false });
    }
    return cleaned;
  } catch {
    return defaultPriorityConfig();
  }
}

function savePriorityConfig() {
  localStorage.setItem(PRIORITY_STORAGE_KEY, JSON.stringify(priorityConfig));
}

function pairKey(id1, id2) {
  return id1 < id2 ? `${id1}|${id2}` : `${id2}|${id1}`;
}

function buildPairHistory() {
  const map = new Map();
  for (const week of weeks) {
    for (const flight of week.flights) {
      for (let a = 0; a < flight.length; a++) {
        for (let b = a + 1; b < flight.length; b++) {
          const key = pairKey(flight[a], flight[b]);
          map.set(key, (map.get(key) || 0) + 1);
        }
      }
    }
  }
  return map;
}

// Slår upp hur många av veckans par som är nya respektive återkommande jämfört
// med tidigare sparade veckor, för visning i variationsöversikten. Körs en
// gång per renderResult()-anrop — hålls separat från evaluate() (som kör detta
// ~40 000 gånger per lottning via optimize()) för att inte belasta sökningen.
function computePairStats(groups, attendees, pairHistory) {
  const repeatPairs = [];
  let totalPairs = 0;
  let newPairs = 0;

  for (const group of groups) {
    for (let a = 0; a < group.length; a++) {
      for (let b = a + 1; b < group.length; b++) {
        const p1 = attendees[group[a]];
        const p2 = attendees[group[b]];
        const count = pairHistory.get(pairKey(p1.id, p2.id)) || 0;
        totalPairs += 1;
        if (count === 0) newPairs += 1;
        else repeatPairs.push({ name1: p1.name, name2: p2.name, count });
      }
    }
  }

  repeatPairs.sort(
    (x, y) => y.count - x.count || `${x.name1}${x.name2}`.localeCompare(`${y.name1}${y.name2}`, "sv")
  );

  return { totalPairs, newPairs, repeatPairs };
}

function computeGroupSizes(n) {
  if (n <= 0) return [];
  if (n <= 4) return [n];
  const base = Math.floor(n / 3);
  const remainder = n % 3;
  if (remainder === 0) return Array(base).fill(3);
  if (remainder === 1) return [...Array(base - 1).fill(3), 4];
  return [...Array(base).fill(3), 2];
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function evaluate(groupOf, attendees, groupSizes, pairHistory) {
  const groups = Array.from({ length: groupSizes.length }, () => []);
  groupOf.forEach((g, i) => groups[g].push(i));

  let hardViolations = 0;
  let cartPenalty = 0;
  let genderPenalty = 0;
  let timePreferencePenalty = 0;
  let slowPenalty = 0;
  let repeatPenalty = 0;
  const lastGroupIndex = groupSizes.length - 1;

  groups.forEach((group, groupIndex) => {
    const sum = group.reduce((s, i) => s + attendees[i].handicap, 0);
    if (sum > HANDICAP_CAP) hardViolations += 1;

    for (let a = 0; a < group.length; a++) {
      for (let b = a + 1; b < group.length; b++) {
        const p1 = attendees[group[a]];
        const p2 = attendees[group[b]];
        if (p1.neverWith && p1.neverWith.includes(p2.id)) {
          hardViolations += 1;
        }
        repeatPenalty += pairHistory.get(pairKey(p1.id, p2.id)) || 0;
      }
    }

    const cartCount = group.filter((i) => attendees[i].cart).length;
    if (cartCount % 2 === 1) cartPenalty += 1;

    const womenCount = group.filter((i) => attendees[i].gender === "kvinna").length;
    if (womenCount % 2 === 1) genderPenalty += 1;

    const slowCount = group.filter((i) => attendees[i].slow).length;
    if (slowCount > 1) slowPenalty += slowCount - 1;

    for (const i of group) {
      const preference = attendees[i].timePreference;
      if (preference === "early") timePreferencePenalty += groupIndex;
      else if (preference === "late") timePreferencePenalty += lastGroupIndex - groupIndex;
    }
  });

  const idToIndex = new Map();
  attendees.forEach((p, i) => idToIndex.set(p.id, i));

  for (let i = 0; i < attendees.length; i++) {
    const player = attendees[i];
    for (const otherId of player.alwaysWith || []) {
      const j = idToIndex.get(otherId);
      if (j === undefined) continue;
      if (groupOf[i] !== groupOf[j]) hardViolations += 1;
    }
    for (const otherId of player.startsBefore || []) {
      const j = idToIndex.get(otherId);
      if (j === undefined) continue;
      if (groupOf[i] >= groupOf[j]) hardViolations += 1;
    }
    for (const otherId of player.nearWith || []) {
      const j = idToIndex.get(otherId);
      if (j === undefined) continue;
      if (Math.abs(groupOf[i] - groupOf[j]) > MAX_NEAR_DISTANCE) hardViolations += 1;
    }
  }

  // Mjuka kriteriers vikter (och om de räknas som hårda krav istället) styrs av
  // priorityConfig, som admin kan ändra i Inställningar-fliken. Ett kriterium som
  // flyttats till "Hårt krav" läggs rakt in i hardViolations — samma spärr och
  // "Kan inte sparas"-varning som redan gäller handicaptak och spelarrelationer.
  const softCounts = {
    cart: cartPenalty,
    gender: genderPenalty,
    time: timePreferencePenalty,
    slow: slowPenalty,
    rotation: repeatPenalty,
  };

  let effectiveHardViolations = hardViolations;
  let total = hardViolations * 1_000_000;
  let softRank = 0;
  for (const entry of priorityConfig) {
    const count = softCounts[entry.id] || 0;
    if (entry.hard) {
      effectiveHardViolations += count;
      total += count * 1_000_000;
    } else {
      const weight = 100_000 / Math.pow(5, softRank);
      total += count * weight;
      softRank += 1;
    }
  }

  return {
    total,
    hardViolations: effectiveHardViolations,
    cartPenalty,
    genderPenalty,
    timePreferencePenalty,
    slowPenalty,
    repeatPenalty,
  };
}

function getViolatingPlayerIds(attendees, groupOf) {
  const idToIndex = new Map();
  attendees.forEach((p, i) => idToIndex.set(p.id, i));
  const violating = new Set();

  for (let i = 0; i < attendees.length; i++) {
    const player = attendees[i];

    for (const otherId of player.neverWith || []) {
      const j = idToIndex.get(otherId);
      if (j === undefined) continue;
      if (groupOf[i] === groupOf[j]) {
        violating.add(player.id);
        violating.add(attendees[j].id);
      }
    }
    for (const otherId of player.alwaysWith || []) {
      const j = idToIndex.get(otherId);
      if (j === undefined) continue;
      if (groupOf[i] !== groupOf[j]) {
        violating.add(player.id);
        violating.add(attendees[j].id);
      }
    }
    for (const otherId of player.startsBefore || []) {
      const j = idToIndex.get(otherId);
      if (j === undefined) continue;
      if (groupOf[i] >= groupOf[j]) {
        violating.add(player.id);
        violating.add(attendees[j].id);
      }
    }
    for (const otherId of player.nearWith || []) {
      const j = idToIndex.get(otherId);
      if (j === undefined) continue;
      if (Math.abs(groupOf[i] - groupOf[j]) > MAX_NEAR_DISTANCE) {
        violating.add(player.id);
        violating.add(attendees[j].id);
      }
    }
  }

  return violating;
}

function optimize(attendees, groupSizes, pairHistory, iterations = 8000) {
  const n = attendees.length;
  const indices = attendees.map((_, i) => i);
  shuffle(indices);

  const groupOf = new Array(n);
  let idx = 0;
  groupSizes.forEach((size, g) => {
    for (let k = 0; k < size; k++) {
      groupOf[indices[idx]] = g;
      idx++;
    }
  });

  let current = evaluate(groupOf, attendees, groupSizes, pairHistory);
  let best = { groupOf: [...groupOf], stats: current };

  let temperature = 5000;
  const coolingRate = 0.999;

  for (let iter = 0; iter < iterations; iter++) {
    const a = Math.floor(Math.random() * n);
    let b = Math.floor(Math.random() * n);
    while (groupOf[b] === groupOf[a]) b = Math.floor(Math.random() * n);

    [groupOf[a], groupOf[b]] = [groupOf[b], groupOf[a]];
    const next = evaluate(groupOf, attendees, groupSizes, pairHistory);
    const delta = next.total - current.total;

    if (delta <= 0 || Math.random() < Math.exp(-delta / temperature)) {
      current = next;
      if (current.total < best.stats.total) {
        best = { groupOf: [...groupOf], stats: current };
      }
    } else {
      [groupOf[a], groupOf[b]] = [groupOf[b], groupOf[a]];
    }
    temperature *= coolingRate;
  }

  return best;
}

// En enda optimize()-körning fastnar ibland i en ofullständig lösning (t.ex. en
// stor "alltid tillsammans"-grupp som splittras) trots att en giltig lösning
// finns. Flera oberoende försök, med det bästa resultatet behållet, gör det
// mycket osannolikt att alla försök fastnar i samma återvändsgränd samtidigt.
function optimizeWithRestarts(attendees, groupSizes, pairHistory, restarts = 5, iterations = 8000) {
  let best = null;
  for (let i = 0; i < restarts; i++) {
    const attempt = optimize(attendees, groupSizes, pairHistory, iterations);
    if (!best || attempt.stats.total < best.stats.total) best = attempt;
  }
  return best;
}

function switchTab(tab) {
  for (const btn of tabButtons) {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  }
  tabPanels.players.hidden = tab !== "players";
  tabPanels.lottery.hidden = tab !== "lottery";
  tabPanels.settings.hidden = tab !== "settings";
  addPlayerBtn.hidden = tab !== "players";
  playersFooter.hidden = tab !== "players";

  if (tab === "lottery") {
    renderAttendanceList();
    renderHistory();
  }
  if (tab === "settings") {
    renderPrioritySettings();
  }
}

function renderPrioritySettings() {
  priorityHardList.innerHTML = "";
  prioritySoftList.innerHTML = "";

  const hardItems = priorityConfig.filter((c) => c.hard);
  const softItems = priorityConfig.filter((c) => !c.hard);

  for (const entry of hardItems) {
    priorityHardList.appendChild(buildPriorityRow(entry, false, false, false));
  }
  if (hardItems.length === 0) {
    const empty = document.createElement("li");
    empty.className = "priority-empty";
    empty.textContent = "Inga — bara handicaptak och spelarrelationer är hårda krav just nu.";
    priorityHardList.appendChild(empty);
  }

  softItems.forEach((entry, i) => {
    prioritySoftList.appendChild(buildPriorityRow(entry, true, i > 0, i < softItems.length - 1));
  });
}

function buildPriorityRow(entry, showMove, canMoveUp, canMoveDown) {
  const criterion = PRIORITY_CRITERIA.find((c) => c.id === entry.id);
  const li = document.createElement("li");
  li.className = "priority-item";

  const label = document.createElement("span");
  label.className = "priority-label";
  label.textContent = criterion.label;
  li.appendChild(label);

  const controls = document.createElement("div");
  controls.className = "priority-controls";

  if (showMove) {
    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "priority-move-btn";
    upBtn.textContent = "↑";
    upBtn.disabled = !canMoveUp;
    upBtn.setAttribute("aria-label", `Flytta ${criterion.label} upp`);
    upBtn.addEventListener("click", () => movePriority(entry.id, -1));
    controls.appendChild(upBtn);

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.className = "priority-move-btn";
    downBtn.textContent = "↓";
    downBtn.disabled = !canMoveDown;
    downBtn.setAttribute("aria-label", `Flytta ${criterion.label} ner`);
    downBtn.addEventListener("click", () => movePriority(entry.id, 1));
    controls.appendChild(downBtn);
  }

  const toggleLabel = document.createElement("label");
  toggleLabel.className = "priority-hard-toggle";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = entry.hard;
  checkbox.addEventListener("change", () => setPriorityHard(entry.id, checkbox.checked));
  toggleLabel.appendChild(checkbox);
  toggleLabel.appendChild(document.createTextNode("Hårt krav"));
  controls.appendChild(toggleLabel);

  li.appendChild(controls);
  return li;
}

function movePriority(id, direction) {
  const hardItems = priorityConfig.filter((c) => c.hard);
  const softItems = priorityConfig.filter((c) => !c.hard);
  const idx = softItems.findIndex((c) => c.id === id);
  const newIdx = idx + direction;
  if (idx === -1 || newIdx < 0 || newIdx >= softItems.length) return;
  [softItems[idx], softItems[newIdx]] = [softItems[newIdx], softItems[idx]];
  priorityConfig = [...hardItems, ...softItems];
  savePriorityConfig();
  renderPrioritySettings();
}

function setPriorityHard(id, hard) {
  const entry = priorityConfig.find((c) => c.id === id);
  if (!entry) return;
  entry.hard = hard;
  // Bygg om listan så hårda krav grupperas för sig och mjuka behåller sin
  // inbördes ordning — annars spelar ordningen på hård-flaggade poster ingen roll.
  const hardItems = priorityConfig.filter((c) => c.hard);
  const softItems = priorityConfig.filter((c) => !c.hard);
  priorityConfig = [...hardItems, ...softItems];
  savePriorityConfig();
  renderPrioritySettings();
}

priorityResetBtn.addEventListener("click", () => {
  if (!confirm("Återställa prioritetsordningen till standard?")) return;
  priorityConfig = defaultPriorityConfig();
  savePriorityConfig();
  renderPrioritySettings();
});

function updateAttendanceCount() {
  attendanceCount.textContent = `(${attendingIds.size} av ${players.length} valda)`;
}

function renderAttendanceList() {
  const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name, "sv"));
  attendanceList.innerHTML = "";

  for (const player of sorted) {
    const li = document.createElement("li");
    li.className = "attendance-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = attendingIds.has(player.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) attendingIds.add(player.id);
      else attendingIds.delete(player.id);
      updateAttendanceCount();
    });

    const name = document.createElement("span");
    name.className = "attendance-name";
    name.textContent = player.name;

    const hcp = document.createElement("span");
    hcp.className = "attendance-hcp";
    hcp.textContent = player.handicap;

    li.appendChild(checkbox);
    li.appendChild(name);
    li.appendChild(hcp);
    li.addEventListener("click", (e) => {
      if (e.target !== checkbox) checkbox.click();
    });
    attendanceList.appendChild(li);
  }

  updateAttendanceCount();
}

function runGeneration() {
  const attendees = players.filter((p) => attendingIds.has(p.id));
  if (attendees.length < 2) {
    alert("Markera minst 2 spelare som deltar denna vecka.");
    return;
  }

  const groupSizes = computeGroupSizes(attendees.length);
  const pairHistory = buildPairHistory();
  const best = optimizeWithRestarts(attendees, groupSizes, pairHistory);

  currentResult = { attendees, groupSizes, groupOf: best.groupOf };
  selectedChipIndex = null;
  selectedEmptyGroup = null;
  renderResult();
}

function renderResult() {
  if (!currentResult) return;
  const { attendees, groupSizes, groupOf } = currentResult;
  const pairHistory = buildPairHistory();
  const stats = evaluate(groupOf, attendees, groupSizes, pairHistory);

  lotteryResult.hidden = false;
  flightContainer.innerHTML = "";

  const groups = Array.from({ length: groupSizes.length }, () => []);
  groupOf.forEach((g, i) => groups[g].push(i));

  const violatingPlayerIds = getViolatingPlayerIds(attendees, groupOf);

  groups.forEach((group, groupIndex) => {
    const card = document.createElement("div");
    card.className = "flight-card";

    const header = document.createElement("div");
    header.className = "flight-header";

    const title = document.createElement("span");
    title.className = "flight-title";
    title.textContent = `Flight ${groupIndex + 1}`;
    if (group.length !== 3) {
      const note = document.createElement("span");
      note.className = "flight-size-note";
      note.textContent = ` (${group.length} spelare)`;
      title.appendChild(note);
    }

    const sum = group.reduce((s, i) => s + attendees[i].handicap, 0);
    const hcp = document.createElement("span");
    hcp.className = "flight-hcp" + (sum > HANDICAP_CAP ? " invalid" : "");
    hcp.textContent = `HCP ${sum.toFixed(1)}`;

    header.appendChild(title);
    header.appendChild(hcp);
    card.appendChild(header);

    const list = document.createElement("ul");
    list.className = "flight-players";

    for (const playerIndex of group) {
      const player = attendees[playerIndex];
      const li = document.createElement("li");
      li.className = "flight-player-chip";
      if (playerIndex === selectedChipIndex) li.classList.add("selected");
      if (sum > HANDICAP_CAP || violatingPlayerIds.has(player.id)) {
        li.classList.add("invalid-pair");
      }

      const name = document.createElement("span");
      name.className = "flight-player-name";
      name.textContent = `${player.name} (${player.handicap})`;

      const badges = document.createElement("span");
      badges.className = "flight-player-badges";
      if (player.slow) {
        const b = document.createElement("span");
        b.className = "badge badge-slow";
        b.textContent = "Långsam";
        badges.appendChild(b);
      }
      if (player.cart) {
        const b = document.createElement("span");
        b.className = "badge badge-cart";
        b.textContent = "Golfbil";
        badges.appendChild(b);
      }
      if (player.timePreference === "early") {
        const b = document.createElement("span");
        b.className = "badge badge-early";
        b.textContent = "Startar tidigt";
        badges.appendChild(b);
      }
      if (player.timePreference === "late") {
        const b = document.createElement("span");
        b.className = "badge badge-late";
        b.textContent = "Startar sent";
        badges.appendChild(b);
      }

      li.appendChild(name);
      li.appendChild(badges);
      li.addEventListener("click", () => onChipClick(playerIndex));
      list.appendChild(li);
    }

    if (group.length < 4) {
      const li = document.createElement("li");
      li.className = "flight-player-chip flight-empty-slot";
      if (groupIndex === selectedEmptyGroup) li.classList.add("selected");
      li.textContent = "Tom plats";
      li.addEventListener("click", () => onEmptySlotClick(groupIndex));
      list.appendChild(li);
    }

    card.appendChild(list);
    flightContainer.appendChild(card);
  });

  renderVariationSummary(computePairStats(groups, attendees, pairHistory));

  if (stats.hardViolations > 0) {
    lotteryBanner.hidden = false;
    lotteryBanner.textContent =
      "Kan inte sparas: en eller flera flighter bryter mot handicaptaket på 110, spelare som aldrig eller alltid ska vara tillsammans, startordningen eller flightavståndet mellan spelare, eller ett kriterium som gjorts till hårt krav i Inställningar. Byt plats på spelare (tryck på två i olika flighter) för att lösa det, eller tryck Slumpa om.";
    saveWeekBtn.disabled = true;
  } else {
    lotteryBanner.hidden = true;
    saveWeekBtn.disabled = false;
  }
}

// Visar hur många av veckans par som är nya respektive återkommande jämfört
// med tidigare sparade veckor. Döljs helt om ingen historik finns än, eftersom
// talet vore meningslöst utan något att jämföra med.
function renderVariationSummary(summary) {
  if (weeks.length === 0) {
    variationSummaryEl.hidden = true;
    return;
  }
  variationSummaryEl.hidden = false;
  variationSummaryEl.innerHTML = "";

  const headline = document.createElement("p");
  headline.className = "variation-headline";
  headline.textContent =
    summary.repeatPairs.length === 0
      ? `Alla ${summary.totalPairs} par är nya denna vecka jämfört med tidigare veckor.`
      : `${summary.newPairs} av ${summary.totalPairs} par är nya denna vecka, ${summary.repeatPairs.length} par har spelat ihop förut.`;
  variationSummaryEl.appendChild(headline);

  if (summary.repeatPairs.length > 0) {
    const list = document.createElement("ul");
    list.className = "variation-repeat-list";
    for (const pair of summary.repeatPairs) {
      const li = document.createElement("li");
      const times = pair.count === 1 ? "1 gång" : `${pair.count} gånger`;
      li.textContent = `${pair.name1} & ${pair.name2} — spelat ihop ${times} tidigare`;
      list.appendChild(li);
    }
    variationSummaryEl.appendChild(list);
  }
}

function onChipClick(playerIndex) {
  if (selectedChipIndex === null && selectedEmptyGroup === null) {
    selectedChipIndex = playerIndex;
    renderResult();
    return;
  }
  if (selectedChipIndex === playerIndex) {
    selectedChipIndex = null;
    renderResult();
    return;
  }
  const { groupOf } = currentResult;

  if (selectedEmptyGroup !== null) {
    groupOf[playerIndex] = selectedEmptyGroup;
    selectedEmptyGroup = null;
    renderResult();
    return;
  }

  if (groupOf[selectedChipIndex] === groupOf[playerIndex]) {
    selectedChipIndex = playerIndex;
    renderResult();
    return;
  }
  const tmp = groupOf[selectedChipIndex];
  groupOf[selectedChipIndex] = groupOf[playerIndex];
  groupOf[playerIndex] = tmp;
  selectedChipIndex = null;
  renderResult();
}

function onEmptySlotClick(groupIndex) {
  if (selectedChipIndex === null && selectedEmptyGroup === null) {
    selectedEmptyGroup = groupIndex;
    renderResult();
    return;
  }
  if (selectedEmptyGroup === groupIndex) {
    selectedEmptyGroup = null;
    renderResult();
    return;
  }
  if (selectedChipIndex !== null) {
    const { groupOf } = currentResult;
    if (groupOf[selectedChipIndex] !== groupIndex) {
      groupOf[selectedChipIndex] = groupIndex;
    }
    selectedChipIndex = null;
    selectedEmptyGroup = null;
    renderResult();
    return;
  }
  selectedEmptyGroup = groupIndex;
  renderResult();
}

function formatFlightTime(startTime, flightIndex, intervalMinutes = 10) {
  const [h, m] = startTime.split(":").map(Number);
  const totalMinutes = h * 60 + m + flightIndex * intervalMinutes;
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

function buildFlightText({ attendees, groupSizes, groupOf }, startTime) {
  const groups = Array.from({ length: groupSizes.length }, () => []);
  groupOf.forEach((g, i) => groups[g].push(i));

  return groups
    .map((group, index) => {
      const names = group.map((i) => attendees[i].name).join("\n");
      const time = formatFlightTime(startTime, index);
      return `Flight ${time}\n${names}`;
    })
    .join("\n\n");
}

function renderHistory() {
  const sorted = [...weeks].sort((a, b) => b.date.localeCompare(a.date));
  historyEmpty.hidden = weeks.length > 0;
  historyList.innerHTML = "";

  for (const week of sorted) {
    const li = document.createElement("li");
    li.className = "history-item";

    const header = document.createElement("div");
    header.className = "history-item-header";

    const date = document.createElement("span");
    date.className = "history-date";
    date.textContent = week.date;

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "history-delete";
    deleteBtn.type = "button";
    deleteBtn.textContent = "Ta bort";
    deleteBtn.addEventListener("click", () => {
      if (!confirm(`Ta bort sparad lottning för ${week.date}?`)) return;
      weeks = weeks.filter((w) => w.id !== week.id);
      saveWeeks();
      renderHistory();
    });

    header.appendChild(date);
    header.appendChild(deleteBtn);
    li.appendChild(header);

    const flightsList = document.createElement("ul");
    flightsList.className = "history-flights";
    week.flights.forEach((flight, index) => {
      const row = document.createElement("li");
      row.className = "history-flight-row";

      const label = document.createElement("span");
      label.className = "history-flight-label";
      label.textContent = `Flight ${index + 1}`;

      const names = document.createElement("span");
      names.className = "history-flight-names";
      names.textContent = flight.map((id) => findPlayer(id)?.name || "?").join(", ");

      row.appendChild(label);
      row.appendChild(names);
      flightsList.appendChild(row);
    });
    li.appendChild(flightsList);

    historyList.appendChild(li);
  }
}

for (const btn of tabButtons) {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
}

selectAllBtn.addEventListener("click", () => {
  attendingIds = new Set(players.map((p) => p.id));
  renderAttendanceList();
});

selectNoneBtn.addEventListener("click", () => {
  attendingIds = new Set();
  renderAttendanceList();
});

generateBtn.addEventListener("click", runGeneration);
rerollBtn.addEventListener("click", runGeneration);

mailBtn.addEventListener("click", () => {
  if (!currentResult) return;
  const date = lotteryDate.value || new Date().toISOString().slice(0, 10);
  const startTime = lotteryStartTime.value || "09:00";
  const subject = encodeURIComponent(`Flightlotten ${date}`);
  const body = encodeURIComponent(buildFlightText(currentResult, startTime));
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
});

saveWeekBtn.addEventListener("click", () => {
  if (!currentResult) return;
  const { attendees, groupSizes, groupOf } = currentResult;
  const stats = evaluate(groupOf, attendees, groupSizes, buildPairHistory());
  if (stats.hardViolations > 0) return;

  const groups = Array.from({ length: groupSizes.length }, () => []);
  groupOf.forEach((g, i) => groups[g].push(attendees[i].id));

  const date = lotteryDate.value || new Date().toISOString().slice(0, 10);
  const existing = weeks.find((w) => w.date === date);
  if (existing && !confirm(`Det finns redan en sparad lottning för ${date}. Skriv över den?`)) {
    return;
  }

  const week = { id: existing ? existing.id : crypto.randomUUID(), date, flights: groups };
  weeks = existing ? weeks.map((w) => (w.id === existing.id ? week : w)) : [...weeks, week];
  saveWeeks();
  renderHistory();
  alert(`Lottning för ${date} sparad.`);
});

lotteryDate.value = new Date().toISOString().slice(0, 10);
