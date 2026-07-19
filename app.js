const STORAGE_KEY = "golf-players";

let players = loadPlayers();
let editingId = null;
let editingRelations = []; // arbetslista medan sheeten är öppen: [{ playerId, type }]
let editingSnapshot = null; // players-arrayen innan sheeten öppnades, för att kunna ångra hela sessionen

const RELATION_TYPE_LABELS = {
  always: "Alltid tillsammans",
  never: "Aldrig tillsammans",
  before: "Startar före",
  after: "Startar efter",
  near: "Inom tre flighter",
};

const playerList = document.getElementById("player-list");
const emptyState = document.getElementById("empty-state");
const playerCount = document.getElementById("player-count");

const sheetBackdrop = document.getElementById("sheet-backdrop");
const sheet = document.getElementById("sheet");
const sheetTitle = document.getElementById("sheet-title");
const playerForm = document.getElementById("player-form");
const fieldName = document.getElementById("field-name");
const fieldHandicap = document.getElementById("field-handicap");
const fieldRelationsList = document.getElementById("field-relations-list");
const relationAddRow = document.getElementById("relation-add-row");
const relationAddPlayer = document.getElementById("relation-add-player");
const relationAddType = document.getElementById("relation-add-type");
const relationAddConfirm = document.getElementById("relation-add-confirm");
const relationAddCancel = document.getElementById("relation-add-cancel");
const fieldSlow = document.getElementById("field-slow");
const fieldCart = document.getElementById("field-cart");
const fieldTimePreference = document.getElementById("field-time-preference");
const deleteBtn = document.getElementById("delete-btn");
const doneBtn = document.getElementById("done-btn");

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
    if (!player.nearWith) player.nearWith = [];
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

// Slår ihop en spelares egna relationslistor med de "startar efter"-relationer
// som andra spelare har satt mot denna spelare (startsBefore är riktad och
// sparas bara på den som startar tidigare, så "efter" måste härledas).
function getPlayerRelations(playerId) {
  const player = findPlayer(playerId);
  if (!player) return [];
  const relations = [];
  for (const id of player.alwaysWith || []) relations.push({ playerId: id, type: "always" });
  for (const id of player.neverWith || []) relations.push({ playerId: id, type: "never" });
  for (const id of player.startsBefore || []) relations.push({ playerId: id, type: "before" });
  for (const id of player.nearWith || []) relations.push({ playerId: id, type: "near" });
  for (const other of players) {
    if (other.id === playerId) continue;
    if ((other.startsBefore || []).includes(playerId)) {
      relations.push({ playerId: other.id, type: "after" });
    }
  }
  return relations;
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

    const grouped = { always: [], never: [], before: [], after: [], near: [] };
    for (const rel of getPlayerRelations(player.id)) {
      const other = findPlayer(rel.playerId);
      if (other) grouped[rel.type].push(other.name);
    }
    const badgeClasses = { always: "badge-always", never: "badge-never", before: "badge-before", after: "badge-after", near: "badge-near" };
    for (const type of ["always", "never", "before", "after", "near"]) {
      if (grouped[type].length === 0) continue;
      const b = document.createElement("span");
      b.className = `badge ${badgeClasses[type]}`;
      b.textContent = `${RELATION_TYPE_LABELS[type]}: ${grouped[type].join(", ")}`;
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

function renderRelationsList() {
  fieldRelationsList.innerHTML = "";

  if (!editingId) {
    relationAddRow.hidden = true;
    const hint = document.createElement("li");
    hint.className = "relation-rule-hint";
    hint.textContent = "Fyll i namn och handicap för att kunna lägga till regler.";
    fieldRelationsList.appendChild(hint);
    return;
  }

  const sorted = [...editingRelations].sort((a, b) => {
    const na = findPlayer(a.playerId)?.name || "";
    const nb = findPlayer(b.playerId)?.name || "";
    return na.localeCompare(nb, "sv");
  });

  for (const rel of sorted) {
    const player = findPlayer(rel.playerId);
    if (!player) continue;
    const li = document.createElement("li");
    li.className = "relation-rule-item";

    const label = document.createElement("span");
    label.className = "relation-rule-label";
    label.textContent = `${player.name} — ${RELATION_TYPE_LABELS[rel.type]}`;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "relation-remove-btn";
    removeBtn.textContent = "×";
    removeBtn.setAttribute("aria-label", `Ta bort regel för ${player.name}`);
    removeBtn.addEventListener("click", () => {
      editingRelations = editingRelations.filter((r) => r !== rel);
      applyRelations(editingId, editingRelations);
      savePlayers();
      render();
      renderRelationsList();
    });

    li.appendChild(label);
    li.appendChild(removeBtn);
    fieldRelationsList.appendChild(li);
  }

  const addChip = document.createElement("li");
  addChip.className = "relation-rule-item relation-rule-add";
  addChip.textContent = "+";
  addChip.setAttribute("role", "button");
  addChip.tabIndex = 0;
  addChip.addEventListener("click", () => openRelationAddRow());
  fieldRelationsList.appendChild(addChip);
}

function openRelationAddRow() {
  const usedIds = new Set(editingRelations.map((r) => r.playerId));
  const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name, "sv"));
  const available = sorted.filter((p) => p.id !== editingId && !usedIds.has(p.id));

  relationAddPlayer.innerHTML = "";
  for (const player of available) {
    const option = document.createElement("option");
    option.value = player.id;
    option.textContent = player.name;
    relationAddPlayer.appendChild(option);
  }

  if (available.length === 0) {
    alert("Alla andra spelare har redan en regel mot den här spelaren.");
    return;
  }

  relationAddType.value = "always";
  relationAddRow.hidden = false;
}

relationAddConfirm.addEventListener("click", () => {
  const playerId = relationAddPlayer.value;
  const type = relationAddType.value;
  if (!playerId) return;
  editingRelations.push({ playerId, type });
  relationAddRow.hidden = true;
  applyRelations(editingId, editingRelations);
  savePlayers();
  render();
  renderRelationsList();
});

relationAddCancel.addEventListener("click", () => {
  relationAddRow.hidden = true;
});

function openAddSheet() {
  editingId = null;
  sheetTitle.textContent = "Ny spelare";
  deleteBtn.hidden = true;
  playerForm.reset();
  editingRelations = [];
  relationAddRow.hidden = true;
  renderRelationsList();
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
  editingRelations = getPlayerRelations(id);
  relationAddRow.hidden = true;
  renderRelationsList();
  fieldSlow.checked = !!player.slow;
  fieldCart.checked = !!player.cart;
  fieldTimePreference.value = player.timePreference || "none";
  showSheet();
}

function showSheet() {
  editingSnapshot = JSON.parse(JSON.stringify(players));
  sheetBackdrop.hidden = false;
  fieldName.focus();
}

function hideSheet() {
  sheetBackdrop.hidden = true;
  editingId = null;
  editingSnapshot = null;
}

function cancelEdit() {
  if (editingSnapshot) {
    players = editingSnapshot;
    savePlayers();
    render();
  }
  hideSheet();
}

// Skapar spelaren i registret så fort namn och handicap är giltiga (för nya
// spelare) — därefter sparas varje fältändring direkt, utan Spara-knapp.
function getOrCreateEditingPlayer() {
  if (editingId) return findPlayer(editingId);

  const name = fieldName.value.trim();
  const handicap = parseFloat(fieldHandicap.value);
  if (!name || Number.isNaN(handicap)) return null;

  const id = crypto.randomUUID();
  players.push({
    id,
    name,
    handicap,
    alwaysWith: [],
    neverWith: [],
    startsBefore: [],
    nearWith: [],
    slow: fieldSlow.checked,
    cart: fieldCart.checked,
    timePreference: fieldTimePreference.value,
  });
  editingId = id;
  sheetTitle.textContent = "Redigera spelare";
  return findPlayer(id);
}

function saveField(mutate) {
  const player = getOrCreateEditingPlayer();
  if (!player) return;
  mutate(player);
  savePlayers();
  render();
  renderRelationsList();
}

// Alltid/aldrig tillsammans är ömsesidiga relationer och speglas på båda spelarna.
// Startar-före är riktad och sparas bara på den spelare som startar tidigare, så
// "startar efter"-regler i arbetslistan skrivs som ett before-värde på motparten.
function applyRelations(playerId, relations) {
  const player = findPlayer(playerId);
  const newAlways = relations.filter((r) => r.type === "always").map((r) => r.playerId);
  const newNever = relations.filter((r) => r.type === "never").map((r) => r.playerId);
  const newBefore = relations.filter((r) => r.type === "before").map((r) => r.playerId);
  const newAfterTargets = relations.filter((r) => r.type === "after").map((r) => r.playerId);
  const newNear = relations.filter((r) => r.type === "near").map((r) => r.playerId);

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

  for (const otherId of player.nearWith) {
    if (!newNear.includes(otherId)) {
      const other = findPlayer(otherId);
      if (other) removeId(other.nearWith, playerId);
    }
  }
  for (const otherId of newNear) {
    const other = findPlayer(otherId);
    if (other) addUnique(other.nearWith, playerId);
  }
  player.nearWith = [...newNear];

  player.startsBefore = [...newBefore];

  for (const other of players) {
    if (other.id === playerId) continue;
    const shouldHave = newAfterTargets.includes(other.id);
    const has = other.startsBefore.includes(playerId);
    if (shouldHave && !has) other.startsBefore.push(playerId);
    if (!shouldHave && has) removeId(other.startsBefore, playerId);
  }
}

// Enter i ett textfält ska inte trigga en sidladdning — spara sker redan löpande.
playerForm.addEventListener("submit", (e) => e.preventDefault());

fieldName.addEventListener("input", () => {
  saveField((player) => {
    const name = fieldName.value.trim();
    if (name) player.name = name;
  });
});

fieldHandicap.addEventListener("input", () => {
  saveField((player) => {
    const handicap = parseFloat(fieldHandicap.value);
    if (!Number.isNaN(handicap)) player.handicap = handicap;
  });
});

fieldSlow.addEventListener("change", () => {
  saveField((player) => {
    player.slow = fieldSlow.checked;
  });
});

fieldCart.addEventListener("change", () => {
  saveField((player) => {
    player.cart = fieldCart.checked;
  });
});

fieldTimePreference.addEventListener("change", () => {
  saveField((player) => {
    player.timePreference = fieldTimePreference.value;
  });
});

doneBtn.addEventListener("click", hideSheet);

deleteBtn.addEventListener("click", () => {
  if (!editingId) return;
  const player = findPlayer(editingId);
  if (!confirm(`Ta bort ${player.name}?`)) return;

  for (const p of players) {
    removeId(p.alwaysWith, editingId);
    removeId(p.neverWith, editingId);
    removeId(p.startsBefore, editingId);
    removeId(p.nearWith, editingId);
  }
  players = players.filter((p) => p.id !== editingId);
  savePlayers();
  render();
  hideSheet();
});

document.getElementById("add-player-btn").addEventListener("click", openAddSheet);
document.getElementById("cancel-btn").addEventListener("click", cancelEdit);
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
    migrateLegacySpouseData(imported);
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
