const WEEKS_STORAGE_KEY = "golf-weeks";
const HANDICAP_CAP = 110;

let weeks = loadWeeks();
let attendingIds = new Set();
let currentResult = null; // { attendees: [player,...], groupSizes: [...], groupOf: [...] }
let selectedChipIndex = null;

const addPlayerBtn = document.getElementById("add-player-btn");
const playersFooter = document.getElementById("players-footer");
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = {
  players: document.getElementById("tab-players"),
  lottery: document.getElementById("tab-lottery"),
};

const lotteryDate = document.getElementById("lottery-date");
const attendanceList = document.getElementById("attendance-list");
const selectAllBtn = document.getElementById("select-all-btn");
const selectNoneBtn = document.getElementById("select-none-btn");
const generateBtn = document.getElementById("generate-btn");

const lotteryResult = document.getElementById("lottery-result");
const lotteryBanner = document.getElementById("lottery-banner");
const flightContainer = document.getElementById("flight-container");
const rerollBtn = document.getElementById("reroll-btn");
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
  let slowPenalty = 0;
  let repeatPenalty = 0;

  for (const group of groups) {
    const sum = group.reduce((s, i) => s + attendees[i].handicap, 0);
    if (sum > HANDICAP_CAP) hardViolations += 1;

    for (let a = 0; a < group.length; a++) {
      for (let b = a + 1; b < group.length; b++) {
        const p1 = attendees[group[a]];
        const p2 = attendees[group[b]];
        if (p1.spouseId === p2.id) hardViolations += 1;
        repeatPenalty += pairHistory.get(pairKey(p1.id, p2.id)) || 0;
      }
    }

    const cartCount = group.filter((i) => attendees[i].cart).length;
    if (cartCount % 2 === 1) cartPenalty += 1;

    const slowCount = group.filter((i) => attendees[i].slow).length;
    if (slowCount > 1) slowPenalty += slowCount - 1;
  }

  const total = hardViolations * 1_000_000 + cartPenalty * 10_000 + slowPenalty * 100 + repeatPenalty;
  return { total, hardViolations, cartPenalty, slowPenalty, repeatPenalty };
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

function switchTab(tab) {
  for (const btn of tabButtons) {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  }
  tabPanels.players.hidden = tab !== "players";
  tabPanels.lottery.hidden = tab !== "lottery";
  addPlayerBtn.hidden = tab !== "players";
  playersFooter.hidden = tab !== "players";

  if (tab === "lottery") {
    renderAttendanceList();
    renderHistory();
  }
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
}

function runGeneration() {
  const attendees = players.filter((p) => attendingIds.has(p.id));
  if (attendees.length < 2) {
    alert("Markera minst 2 spelare som deltar denna vecka.");
    return;
  }

  const groupSizes = computeGroupSizes(attendees.length);
  const pairHistory = buildPairHistory();
  const best = optimize(attendees, groupSizes, pairHistory);

  currentResult = { attendees, groupSizes, groupOf: best.groupOf };
  selectedChipIndex = null;
  renderResult();
}

function renderResult() {
  if (!currentResult) return;
  const { attendees, groupSizes, groupOf } = currentResult;
  const stats = evaluate(groupOf, attendees, groupSizes, buildPairHistory());

  lotteryResult.hidden = false;
  flightContainer.innerHTML = "";

  const groups = Array.from({ length: groupSizes.length }, () => []);
  groupOf.forEach((g, i) => groups[g].push(i));

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
    hcp.textContent = `HCP ${sum}`;

    header.appendChild(title);
    header.appendChild(hcp);
    card.appendChild(header);

    const list = document.createElement("ul");
    list.className = "flight-players";

    const spouseViolationIds = new Set();
    for (const i of group) {
      for (const j of group) {
        if (i !== j && attendees[i].spouseId === attendees[j].id) {
          spouseViolationIds.add(attendees[i].id);
          spouseViolationIds.add(attendees[j].id);
        }
      }
    }

    for (const playerIndex of group) {
      const player = attendees[playerIndex];
      const li = document.createElement("li");
      li.className = "flight-player-chip";
      if (playerIndex === selectedChipIndex) li.classList.add("selected");
      if (sum > HANDICAP_CAP || spouseViolationIds.has(player.id)) {
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

      li.appendChild(name);
      li.appendChild(badges);
      li.addEventListener("click", () => onChipClick(playerIndex));
      list.appendChild(li);
    }

    card.appendChild(list);
    flightContainer.appendChild(card);
  });

  if (stats.hardViolations > 0) {
    lotteryBanner.hidden = false;
    lotteryBanner.textContent =
      "Kan inte sparas: en eller flera flighter bryter mot att gifta par ska hållas isär eller handicaptaket på 110. Byt plats på spelare (tryck på två i olika flighter) för att lösa det, eller tryck Slumpa om.";
    saveWeekBtn.disabled = true;
  } else {
    lotteryBanner.hidden = true;
    saveWeekBtn.disabled = false;
  }
}

function onChipClick(playerIndex) {
  if (selectedChipIndex === null) {
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

    const flightsEl = document.createElement("div");
    flightsEl.className = "history-flights";
    flightsEl.textContent = week.flights
      .map((flight) => flight.map((id) => findPlayer(id)?.name || "?").join(", "))
      .join(" · ");
    li.appendChild(flightsEl);

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
