const STORAGE_KEY = "golf-players";

let players = loadPlayers();
let editingId = null;

const playerList = document.getElementById("player-list");
const emptyState = document.getElementById("empty-state");
const playerCount = document.getElementById("player-count");

const sheetBackdrop = document.getElementById("sheet-backdrop");
const sheet = document.getElementById("sheet");
const sheetTitle = document.getElementById("sheet-title");
const playerForm = document.getElementById("player-form");
const fieldName = document.getElementById("field-name");
const fieldHandicap = document.getElementById("field-handicap");
const fieldAlwaysList = document.getElementById("field-always-list");
const fieldNeverList = document.getElementById("field-never-list");
const fieldBeforeList = document.getElementById("field-before-list");
const fieldSlow = document.getElementById("field-slow");
const fieldCart = document.getElementById("field-cart");
const fieldTimePreference = document.getElementById("field-time-preference");
const deleteBtn = document.getElementById("delete-btn");

function addUnique(arr, id) {
  if (!arr.includes(id)) arr.push(id);
}

function removeId(arr, id) {
  const idx = arr.indexOf(id);
  if (idx !== -1) arr.splice(idx, 1);
}

function loadPlayers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const loaded = raw ? JSON.parse(raw) : [];
    for (const player of loaded) {
      if (player.timePreference === undefined) {
        player.timePreference = player.earlyStart ? "early" : "none";
      }
      delete player.earlyStart;
    }
    migrateLegacySpouseData(loaded);
    return loaded;
  } catch {
    return [];
  }
}

// Migrerar det gamla Make/maka-fältet (spouseId/spousePreference) till de fria
// relationslistorna (alwaysWith/neverWith/startsBefore). Körs bara en gång per
// installation eftersom de gamla fälten tas bort ur datan när migreringen är klar.
function migrateLegacySpouseData(loaded) {
  for (const player of loaded) {
    if (!player.alwaysWith) player.alwaysWith = [];
    if (!player.neverWith) player.neverWith = [];
    if (!player.startsBefore) player.startsBefore = [];
  }

  const hasLegacy = loaded.some((p) => "spouseId" in p);
  if (!hasLegacy) return;

  const byId = new Map(loaded.map((p) => [p.id, p]));
  for (const player of loaded) {
    if (!player.spouseId) continue;
    const spouse = byId.get(player.spouseId);
    if (!spouse) continue;
    const preference = player.spousePreference || "apart";
    if (preference === "together") {
      addUnique(player.alwaysWith, spouse.id);
      addUnique(spouse.alwaysWith, player.id);
    } else if (preference === "teeBefore") {
      addUnique(player.startsBefore, spouse.id);
    } else if (preference === "teeAfter") {
      addUnique(spouse.startsBefore, player.id);
    } else {
      addUnique(player.neverWith, spouse.id);
      addUnique(spouse.neverWith, player.id);
    }
  }

  for (const player of loaded) {
    delete player.spouseId;
    delete player.spousePreference;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(loaded));
}

function savePlayers() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(players));
}

function findPlayer(id) {
  return players.find((p) => p.id === id) || null;
}

function relationBadgeText(label, ids) {
  const names = ids.map((id) => findPlayer(id)?.name).filter(Boolean);
  return names.length ? `${label}: ${names.join(", ")}` : null;
}

function render() {
  const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name, "sv"));
  playerList.innerHTML = "";
  emptyState.hidden = players.length > 0;

  for (const player of sorted) {
    const li = document.createElement("li");
    li.className = "player-card";
    li.addEventListener("click", () => openEditSheet(player.id));

    const main = document.createElement("div");
    main.className = "player-main";

    const name = document.createElement("div");
    name.className = "player-name";
    name.textContent = player.name;
    main.appendChild(name);

    const badges = document.createElement("div");
    badges.className = "player-badges";

    const alwaysText = relationBadgeText("Alltid med", player.alwaysWith || []);
    if (alwaysText) {
      const b = document.createElement("span");
      b.className = "badge badge-always";
      b.textContent = alwaysText;
      badges.appendChild(b);
    }
    const neverText = relationBadgeText("Aldrig med", player.neverWith || []);
    if (neverText) {
      const b = document.createElement("span");
      b.className = "badge badge-never";
      b.textContent = neverText;
      badges.appendChild(b);
    }
    const beforeText = relationBadgeText("Startar före", player.startsBefore || []);
    if (beforeText) {
      const b = document.createElement("span");
      b.className = "badge badge-before";
      b.textContent = beforeText;
      badges.appendChild(b);
    }
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
    if (badges.children.length > 0) {
      main.appendChild(badges);
    }

    const handicap = document.createElement("div");
    handicap.className = "player-handicap";
    handicap.textContent = player.handicap;

    li.appendChild(main);
    li.appendChild(handicap);
    playerList.appendChild(li);
  }

  playerCount.textContent = players.length === 1 ? "1 spelare" : `${players.length} spelare`;
}

function populateRelationChecklist(listEl, selectedIds, excludeId) {
  listEl.innerHTML = "";
  const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name, "sv"));
  for (const player of sorted) {
    if (player.id === excludeId) continue;
    const li = document.createElement("li");
    li.className = "relation-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = player.id;
    checkbox.checked = selectedIds.includes(player.id);

    const name = document.createElement("span");
    name.className = "relation-name";
    name.textContent = player.name;

    li.appendChild(checkbox);
    li.appendChild(name);
    li.addEventListener("click", (e) => {
      if (e.target !== checkbox) checkbox.click();
    });
    listEl.appendChild(li);
  }
}

function getCheckedIds(listEl) {
  return Array.from(listEl.querySelectorAll("input[type=checkbox]:checked")).map((cb) => cb.value);
}

function populateAllRelationLists(selected, excludeId) {
  populateRelationChecklist(fieldAlwaysList, selected.always, excludeId);
  populateRelationChecklist(fieldNeverList, selected.never, excludeId);
  populateRelationChecklist(fieldBeforeList, selected.before, excludeId);
}

function openAddSheet() {
  editingId = null;
  sheetTitle.textContent = "Ny spelare";
  deleteBtn.hidden = true;
  playerForm.reset();
  populateAllRelationLists({ always: [], never: [], before: [] }, null);
  fieldTimePreference.value = "none";
  showSheet();
}

function openEditSheet(id) {
  const player = findPlayer(id);
  if (!player) return;
  editingId = id;
  sheetTitle.textContent = "Redigera spelare";
  deleteBtn.hidden = false;
  fieldName.value = player.name;
  fieldHandicap.value = player.handicap;
  populateAllRelationLists(
    { always: player.alwaysWith || [], never: player.neverWith || [], before: player.startsBefore || [] },
    id
  );
  fieldSlow.checked = !!player.slow;
  fieldCart.checked = !!player.cart;
  fieldTimePreference.value = player.timePreference || "none";
  showSheet();
}

function showSheet() {
  sheetBackdrop.hidden = false;
  fieldName.focus();
}

function hideSheet() {
  sheetBackdrop.hidden = true;
  editingId = null;
}

// Alltid/aldrig tillsammans är ömsesidiga relationer och speglas på båda spelarna.
// Startar-före är riktad och sparas bara på den spelare som startar tidigare.
function applyRelations(playerId, newAlways, newNever, newBefore) {
  const player = findPlayer(playerId);

  for (const otherId of player.alwaysWith) {
    if (!newAlways.includes(otherId)) {
      const other = findPlayer(otherId);
      if (other) removeId(other.alwaysWith, playerId);
    }
  }
  for (const otherId of newAlways) {
    const other = findPlayer(otherId);
    if (other) addUnique(other.alwaysWith, playerId);
  }
  player.alwaysWith = [...newAlways];

  for (const otherId of player.neverWith) {
    if (!newNever.includes(otherId)) {
      const other = findPlayer(otherId);
      if (other) removeId(other.neverWith, playerId);
    }
  }
  for (const otherId of newNever) {
    const other = findPlayer(otherId);
    if (other) addUnique(other.neverWith, playerId);
  }
  player.neverWith = [...newNever];

  player.startsBefore = [...newBefore];
}

playerForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = fieldName.value.trim();
  const handicap = parseFloat(fieldHandicap.value);
  const slow = fieldSlow.checked;
  const cart = fieldCart.checked;
  const timePreference = fieldTimePreference.value;

  if (!name || Number.isNaN(handicap)) return;

  const id = editingId || crypto.randomUUID();
  const always = getCheckedIds(fieldAlwaysList);
  const never = getCheckedIds(fieldNeverList);
  const before = getCheckedIds(fieldBeforeList);

  const overlapId = always.find((pid) => never.includes(pid) || before.includes(pid)) || never.find((pid) => before.includes(pid));
  if (overlapId) {
    alert(`${findPlayer(overlapId)?.name || "En spelare"} kan bara ha en relationstyp (alltid/aldrig/startar före) mot samma spelare.`);
    return;
  }

  const cycleId = before.find((pid) => findPlayer(pid)?.startsBefore.includes(id));
  if (cycleId) {
    alert(`${findPlayer(cycleId).name} har redan "startar före" satt mot den här spelaren — kan inte gälla åt båda hållen.`);
    return;
  }

  if (editingId) {
    const player = findPlayer(editingId);
    player.name = name;
    player.handicap = handicap;
    player.slow = slow;
    player.cart = cart;
    player.timePreference = timePreference;
  } else {
    players.push({ id, name, handicap, alwaysWith: [], neverWith: [], startsBefore: [], slow, cart, timePreference });
  }

  applyRelations(id, always, never, before);

  savePlayers();
  render();
  hideSheet();
});

deleteBtn.addEventListener("click", () => {
  if (!editingId) return;
  const player = findPlayer(editingId);
  if (!confirm(`Ta bort ${player.name}?`)) return;

  for (const p of players) {
    removeId(p.alwaysWith, editingId);
    removeId(p.neverWith, editingId);
    removeId(p.startsBefore, editingId);
  }
  players = players.filter((p) => p.id !== editingId);
  savePlayers();
  render();
  hideSheet();
});

document.getElementById("add-player-btn").addEventListener("click", openAddSheet);
document.getElementById("cancel-btn").addEventListener("click", hideSheet);
sheetBackdrop.addEventListener("click", (e) => {
  if (e.target === sheetBackdrop) hideSheet();
});

document.getElementById("export-btn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(players, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `golfspelare-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

const importInput = document.getElementById("import-file");
document.getElementById("import-btn").addEventListener("click", () => importInput.click());

importInput.addEventListener("change", async () => {
  const file = importInput.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const imported = JSON.parse(text);
    if (!Array.isArray(imported)) throw new Error("Ogiltigt format");
    if (players.length > 0 && !confirm(`Ersätta nuvarande ${players.length} spelare med ${imported.length} importerade spelare?`)) {
      importInput.value = "";
      return;
    }
    players = imported;
    savePlayers();
    render();
  } catch (err) {
    alert("Kunde inte importera filen: " + err.message);
  } finally {
    importInput.value = "";
  }
});

render();
