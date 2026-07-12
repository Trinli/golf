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
const fieldSpouse = document.getElementById("field-spouse");
const spousePreferenceField = document.getElementById("spouse-preference-field");
const fieldSpousePreference = document.getElementById("field-spouse-preference");
const fieldSlow = document.getElementById("field-slow");
const fieldCart = document.getElementById("field-cart");
const fieldEarlyStart = document.getElementById("field-early-start");
const deleteBtn = document.getElementById("delete-btn");

function loadPlayers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePlayers() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(players));
}

function findPlayer(id) {
  return players.find((p) => p.id === id) || null;
}

function spousePreferenceSuffix(preference) {
  if (preference === "together") return " (alltid ihop)";
  if (preference === "teeBefore") return " (startar före)";
  if (preference === "teeAfter") return " (startar efter)";
  return "";
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

    if (player.spouseId) {
      const spouse = findPlayer(player.spouseId);
      if (spouse) {
        const b = document.createElement("span");
        b.className = "badge badge-spouse";
        b.textContent = `Gift med ${spouse.name}${spousePreferenceSuffix(player.spousePreference)}`;
        badges.appendChild(b);
      }
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
    if (player.earlyStart) {
      const b = document.createElement("span");
      b.className = "badge badge-early";
      b.textContent = "Startar tidigt";
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

function populateSpouseOptions(excludeId) {
  fieldSpouse.innerHTML = '<option value="">Ingen</option>';
  const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name, "sv"));
  for (const player of sorted) {
    if (player.id === excludeId) continue;
    const option = document.createElement("option");
    option.value = player.id;
    option.textContent = player.name;
    fieldSpouse.appendChild(option);
  }
}

function updateSpousePreferenceVisibility() {
  spousePreferenceField.hidden = !fieldSpouse.value;
}

function openAddSheet() {
  editingId = null;
  sheetTitle.textContent = "Ny spelare";
  deleteBtn.hidden = true;
  playerForm.reset();
  populateSpouseOptions(null);
  fieldSpousePreference.value = "apart";
  updateSpousePreferenceVisibility();
  showSheet();
}

function openEditSheet(id) {
  const player = findPlayer(id);
  if (!player) return;
  editingId = id;
  sheetTitle.textContent = "Redigera spelare";
  deleteBtn.hidden = false;
  populateSpouseOptions(id);
  fieldName.value = player.name;
  fieldHandicap.value = player.handicap;
  fieldSpouse.value = player.spouseId || "";
  fieldSpousePreference.value = player.spousePreference || "apart";
  fieldSlow.checked = !!player.slow;
  fieldCart.checked = !!player.cart;
  fieldEarlyStart.checked = !!player.earlyStart;
  updateSpousePreferenceVisibility();
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

function mirrorSpousePreference(preference) {
  if (preference === "teeBefore") return "teeAfter";
  if (preference === "teeAfter") return "teeBefore";
  if (preference === "together") return "together";
  return "apart";
}

function setSpouse(playerId, newSpouseId, preference) {
  const player = findPlayer(playerId);
  const oldSpouseId = player.spouseId || null;

  if (oldSpouseId && oldSpouseId !== newSpouseId) {
    const oldSpouse = findPlayer(oldSpouseId);
    if (oldSpouse) {
      oldSpouse.spouseId = null;
      oldSpouse.spousePreference = "apart";
    }
  }

  if (newSpouseId) {
    const newSpouse = findPlayer(newSpouseId);
    if (newSpouse && newSpouse.spouseId && newSpouse.spouseId !== playerId) {
      const theirOldSpouse = findPlayer(newSpouse.spouseId);
      if (theirOldSpouse) {
        theirOldSpouse.spouseId = null;
        theirOldSpouse.spousePreference = "apart";
      }
    }
    if (newSpouse) {
      newSpouse.spouseId = playerId;
      newSpouse.spousePreference = mirrorSpousePreference(preference);
    }
    player.spousePreference = preference || "apart";
  } else {
    player.spousePreference = "apart";
  }

  player.spouseId = newSpouseId || null;
}

playerForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = fieldName.value.trim();
  const handicap = parseFloat(fieldHandicap.value);
  const spouseId = fieldSpouse.value || null;
  const spousePreference = fieldSpousePreference.value;
  const slow = fieldSlow.checked;
  const cart = fieldCart.checked;
  const earlyStart = fieldEarlyStart.checked;

  if (!name || Number.isNaN(handicap)) return;

  if (editingId) {
    const player = findPlayer(editingId);
    player.name = name;
    player.handicap = handicap;
    player.slow = slow;
    player.cart = cart;
    player.earlyStart = earlyStart;
    setSpouse(editingId, spouseId, spousePreference);
  } else {
    const id = crypto.randomUUID();
    players.push({ id, name, handicap, spouseId: null, spousePreference: "apart", slow, cart, earlyStart });
    setSpouse(id, spouseId, spousePreference);
  }

  savePlayers();
  render();
  hideSheet();
});

deleteBtn.addEventListener("click", () => {
  if (!editingId) return;
  const player = findPlayer(editingId);
  if (!confirm(`Ta bort ${player.name}?`)) return;

  if (player.spouseId) {
    const spouse = findPlayer(player.spouseId);
    if (spouse) {
      spouse.spouseId = null;
      spouse.spousePreference = "apart";
    }
  }
  players = players.filter((p) => p.id !== editingId);
  savePlayers();
  render();
  hideSheet();
});

document.getElementById("add-player-btn").addEventListener("click", openAddSheet);
document.getElementById("cancel-btn").addEventListener("click", hideSheet);
fieldSpouse.addEventListener("change", updateSpousePreferenceVisibility);
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
