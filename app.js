// Modern Go (Baduk) Application Controller, Clocks, WebRTC Networking, Undo, Replay & Archives

const PEER_PREFIX = "go-baduk-room-v1-";
const STORAGE_KEY = "go_match_archives_v1";

// Audio Synthesis for Realistic Go Stone Placement, Captures & Byo-yomi
let sharedAudioCtx = null;
function getAudioContext() {
  if (!sharedAudioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume();
  }
  return sharedAudioCtx;
}

// Crisp wood "clack" stone sound synthesis
function playStoneSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Body knock (low wood thud)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(320, now);
    osc1.frequency.exponentialRampToValueAtTime(70, now + 0.08);
    gain1.gain.setValueAtTime(0.5, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.08);

    // Sharp ceramic/slate snap
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1400, now);
    osc2.frequency.exponentialRampToValueAtTime(280, now + 0.04);
    gain2.gain.setValueAtTime(0.35, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now);
    osc2.stop(now + 0.04);
  } catch (_) {}
}

// Stone capture sound effect (subtle double click)
function playCaptureSound() {
  try {
    playStoneSound();
    setTimeout(() => {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(450, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.06);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.06);
    }, 60);
  } catch (_) {}
}

// Audio Synthesis for Byo-yomi Countdown & Tone
function playCountdownTone(freq = 440, duration = 0.08) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (_) {}
}

function speakCountdown(number) {
  playCountdownTone(number <= 3 ? 880 : 540, 0.06);

  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(number));
    utterance.rate = 1.35;
    utterance.pitch = 1.05;
    utterance.volume = 1.0;
    window.speechSynthesis.speak(utterance);
  }
}

// Game State
let engine = new GoEngine(19, 6.5);
let peer = null;
let conn = null;
let isHost = false;
let myRole = null; // BLACK or WHITE
let currentRoomName = "";
let myUsername = "";
let opponentUsername = "Opponent";
let hoverCoord = null;
let lastMoveCoord = null;

// Clock Configuration
let clockConfig = {
  mainMinutes: 10,
  byoyomiSeconds: 30,
  byoyomiPeriods: 3
};

let timers = {
  [BLACK]: { mainSec: 600, byoSec: 30, periodsLeft: 3, inByoyomi: false },
  [WHITE]: { mainSec: 600, byoSec: 30, periodsLeft: 3, inByoyomi: false }
};
let clockInterval = null;

// Review Mode State
let isReviewMode = false;
let reviewStep = 0;
let reviewHistory = [];

// DOM Elements
const homeView = document.getElementById('homeView');
const waitingModal = document.getElementById('waitingModal');
const undoModal = document.getElementById('undoModal');
const undoModalText = document.getElementById('undoModalText');
const acceptUndoBtn = document.getElementById('acceptUndoBtn');
const rejectUndoBtn = document.getElementById('rejectUndoBtn');
const gameView = document.getElementById('gameView');

const createRoomForm = document.getElementById('createRoomForm');
const createPlayerNameInput = document.getElementById('createPlayerName');
const createRoomNameInput = document.getElementById('createRoomName');
const randomRoomBtn = document.getElementById('randomRoomBtn');
const boardSizeSetting = document.getElementById('boardSizeSetting');
const komiSetting = document.getElementById('komiSetting');
const mainTimeSetting = document.getElementById('mainTimeSetting');
const byoyomiSetting = document.getElementById('byoyomiSetting');

const joinRoomForm = document.getElementById('joinRoomForm');
const joinPlayerNameInput = document.getElementById('joinPlayerName');
const joinRoomNameInput = document.getElementById('joinRoomName');

const waitingRoomNameEl = document.getElementById('waitingRoomName');
const shareUrlInput = document.getElementById('shareUrlInput');
const copyShareUrlBtn = document.getElementById('copyShareUrlBtn');
const waitingSettingsSummary = document.getElementById('waitingSettingsSummary');
const cancelWaitingBtn = document.getElementById('cancelWaitingBtn');

const activeRoomTag = document.getElementById('activeRoomTag');
const copyGameLinkBtn = document.getElementById('copyGameLinkBtn');
const leaveGameBtn = document.getElementById('leaveGameBtn');
const reviewModeToggleBtn = document.getElementById('reviewModeToggleBtn');

const blackHud = document.getElementById('blackHud');
const whiteHud = document.getElementById('whiteHud');
const blackPlayerNameEl = document.getElementById('blackPlayerName');
const whitePlayerNameEl = document.getElementById('whitePlayerName');
const blackRoleLabel = document.getElementById('blackRoleLabel');
const whiteRoleLabel = document.getElementById('whiteRoleLabel');
const blackCapturesEl = document.getElementById('blackCaptures');
const whiteCapturesEl = document.getElementById('whiteCaptures');
const displayKomiEl = document.getElementById('displayKomi');
const blackMainTimeEl = document.getElementById('blackMainTime');
const blackByoyomiEl = document.getElementById('blackByoyomi');
const whiteMainTimeEl = document.getElementById('whiteMainTime');
const whiteByoyomiEl = document.getElementById('whiteByoyomi');

const gameActionsCard = document.getElementById('gameActionsCard');
const turnBanner = document.getElementById('turnBanner');
const gamePassBtn = document.getElementById('gamePassBtn');
const gameUndoBtn = document.getElementById('gameUndoBtn');
const gameResignBtn = document.getElementById('gameResignBtn');

const reviewControlsCard = document.getElementById('reviewControlsCard');
const reviewBanner = document.getElementById('reviewBanner');
const revFirstBtn = document.getElementById('revFirstBtn');
const revPrevBtn = document.getElementById('revPrevBtn');
const revNextBtn = document.getElementById('revNextBtn');
const revLastBtn = document.getElementById('revLastBtn');

const scoringCard = document.getElementById('scoringCard');
const scoreBreakdownEl = document.getElementById('scoreBreakdown');
const confirmScoreBtn = document.getElementById('confirmScoreBtn');

const canvas = document.getElementById('goBoard');
const ctx = canvas.getContext('2d');

const tabChatBtn = document.getElementById('tabChatBtn');
const tabLogBtn = document.getElementById('tabLogBtn');
const chatPanel = document.getElementById('chatPanel');
const logPanel = document.getElementById('logPanel');
const chatMessagesEl = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const movesListEl = document.getElementById('movesList');

const savedGamesCountEl = document.getElementById('savedGamesCount');
const archivesListEl = document.getElementById('archivesList');
const clearArchivesBtn = document.getElementById('clearArchivesBtn');

// Random Room Generator
const ADJECTIVES = ["swift", "silent", "wise", "golden", "mighty", "zen", "cosmic", "deep", "hidden", "bold"];
const NOUNS = ["dragon", "tiger", "stone", "bamboo", "ko", "hoshi", "mountain", "crane", "river", "wind"];
function getRandomRoomName() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 900) + 100;
  return `${adj}-${noun}-${num}`;
}
randomRoomBtn.addEventListener('click', () => {
  createRoomNameInput.value = getRandomRoomName();
});

function sanitizeRoomName(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
}

// -------------------------------------------------------------
// Room Creation & Lobby WebRTC Handshake
// -------------------------------------------------------------
createRoomForm.addEventListener('submit', (e) => {
  e.preventDefault();
  myUsername = createPlayerNameInput.value.trim() || "Host";
  const rawRoom = createRoomNameInput.value;
  const cleanName = sanitizeRoomName(rawRoom);
  if (!cleanName) return;

  const size = parseInt(boardSizeSetting.value, 10);
  const komi = parseFloat(komiSetting.value);
  const mainMins = parseInt(mainTimeSetting.value, 10);
  const [byoSec, byoPer] = byoyomiSetting.value.split('|').map(Number);

  clockConfig = {
    mainMinutes: mainMins,
    byoyomiSeconds: byoSec,
    byoyomiPeriods: byoPer
  };

  createRoomAsHost(cleanName, size, komi);
});

function createRoomAsHost(roomName, size, komi) {
  currentRoomName = roomName;
  isHost = true;
  myRole = BLACK;

  engine = new GoEngine(size, komi);
  resetClocks();

  const peerId = PEER_PREFIX + roomName;
  if (peer) peer.destroy();
  peer = new Peer(peerId);

  waitingRoomNameEl.textContent = roomName;
  const joinUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomName)}`;
  shareUrlInput.value = joinUrl;
  waitingSettingsSummary.innerHTML = `
    <span>Host: ${myUsername}</span>
    <span>Board: ${size}x${size}</span>
    <span>Komi: ${komi}</span>
    <span>Time: ${clockConfig.mainMinutes > 0 ? clockConfig.mainMinutes + 'm' : '∞'}</span>
  `;
  waitingModal.classList.remove('hidden');

  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') {
      alert(`Room "${roomName}" is currently active! Please choose another room name.`);
      waitingModal.classList.add('hidden');
    } else {
      console.error("Peer error:", err);
    }
  });

  peer.on('connection', (incomingConn) => {
    conn = incomingConn;
    setupPeerEvents();

    conn.on('open', () => {
      conn.send({
        type: 'INIT_GAME',
        size: engine.size,
        komi: engine.komi,
        clockConfig: clockConfig,
        roomName: currentRoomName,
        hostUsername: myUsername
      });
    });
  });
}

// Join Room as Guest
joinRoomForm.addEventListener('submit', (e) => {
  e.preventDefault();
  myUsername = joinPlayerNameInput.value.trim() || "Guest";
  const cleanName = sanitizeRoomName(joinRoomNameInput.value);
  if (!cleanName) return;
  joinRoomAsGuest(cleanName);
});

function joinRoomAsGuest(roomName) {
  currentRoomName = roomName;
  isHost = false;
  myRole = WHITE;

  if (peer) peer.destroy();
  peer = new Peer();

  peer.on('open', () => {
    const targetPeerId = PEER_PREFIX + roomName;
    conn = peer.connect(targetPeerId);
    setupPeerEvents();

    conn.on('open', () => {
      conn.send({
        type: 'GUEST_JOINED',
        guestUsername: myUsername
      });
    });
  });

  peer.on('error', (err) => {
    console.error("Peer error:", err);
    alert("Could not connect to room. Verify room name and ensure the host is waiting.");
  });
}

function setupPeerEvents() {
  conn.on('data', (data) => {
    handleIncomingData(data);
  });

  conn.on('close', () => {
    appendChatMessage('system', `${opponentUsername} disconnected.`);
  });
}

function handleIncomingData(data) {
  switch (data.type) {
    case 'INIT_GAME':
      engine = new GoEngine(data.size, data.komi);
      clockConfig = data.clockConfig;
      currentRoomName = data.roomName;
      opponentUsername = data.hostUsername || "Host";
      resetClocks();
      startGame();
      break;

    case 'GUEST_JOINED':
      opponentUsername = data.guestUsername || "Guest";
      startGame();
      break;

    case 'MOVE':
      const res = engine.playMove(data.r, data.c);
      if (res.success) {
        lastMoveCoord = [data.r, data.c];
        if (res.captured && res.captured.length > 0) {
          playCaptureSound();
        } else {
          playStoneSound();
        }
        logMove(data.r, data.c, res.player, res.captured.length);
        updateClocksOnMove(res.player);
        updateGameUI();
      }
      break;

    case 'PASS':
      const pRes = engine.pass();
      if (pRes.success) {
        const pName = pRes.passedBy === BLACK ? getPlayerName(BLACK) : getPlayerName(WHITE);
        logMove(null, null, pRes.passedBy, 0, true);
        appendChatMessage('system', `${pName} passed.`);
        if (pRes.phaseChanged) {
          stopClocks();
          appendChatMessage('system', "Both passed! Japanese dead-stone removal phase.");
        } else {
          updateClocksOnMove(pRes.passedBy);
        }
        updateGameUI();
      }
      break;

    case 'RESIGN':
      engine.resign(data.color);
      stopClocks();
      const resigner = data.color === BLACK ? getPlayerName(BLACK) : getPlayerName(WHITE);
      appendChatMessage('system', `${resigner} resigned.`);
      finalizeAndSaveGame(`${data.color === BLACK ? getPlayerName(WHITE) : getPlayerName(BLACK)} wins by Resignation`);
      updateGameUI();
      break;

    case 'UNDO_REQUEST':
      undoModalText.textContent = `${opponentUsername} requested to take back their last move. Accept?`;
      undoModal.classList.remove('hidden');
      break;

    case 'UNDO_RESPONSE':
      if (data.accepted) {
        appendChatMessage('system', `${opponentUsername} accepted your undo request.`);
        executeUndo(data.steps);
      } else {
        appendChatMessage('system', `${opponentUsername} declined your undo request.`);
      }
      break;

    case 'TOGGLE_DEAD':
      engine.toggleDeadStone(data.r, data.c);
      updateGameUI();
      break;

    case 'CONFIRM_SCORE':
      engine.phase = 'finished';
      appendChatMessage('system', `${opponentUsername} accepted final score!`);
      const score = engine.calculateJapaneseScore();
      const winnerName = score.winner === BLACK ? getPlayerName(BLACK) : getPlayerName(WHITE);
      finalizeAndSaveGame(`${winnerName} wins by ${score.margin.toFixed(1)} pts`);
      updateGameUI();
      break;

    case 'CHAT':
      appendChatMessage('opponent', data.text, data.sender);
      break;

    case 'SYNC_TIME':
      if (!isHost) {
        timers = data.timers;
        updateClockDisplay();
      }
      break;
  }
}

function getPlayerName(color) {
  if (color === BLACK) return isHost ? myUsername : opponentUsername;
  return isHost ? opponentUsername : myUsername;
}

function startGame() {
  waitingModal.classList.add('hidden');
  homeView.classList.add('hidden');
  gameView.classList.remove('hidden');

  activeRoomTag.textContent = `Room: ${currentRoomName}`;
  displayKomiEl.textContent = engine.komi;

  if (isHost) {
    blackPlayerNameEl.textContent = `${myUsername}`;
    whitePlayerNameEl.textContent = `${opponentUsername}`;
    blackRoleLabel.textContent = "You";
    whiteRoleLabel.textContent = "Opponent";
  } else {
    blackPlayerNameEl.textContent = `${opponentUsername}`;
    whitePlayerNameEl.textContent = `${myUsername}`;
    blackRoleLabel.textContent = "Opponent";
    whiteRoleLabel.textContent = "You";
  }

  // Clear move history UI
  movesListEl.innerHTML = '';
  isReviewMode = false;
  reviewModeToggleBtn.classList.add('hidden');
  gameActionsCard.classList.remove('hidden');
  reviewControlsCard.classList.add('hidden');

  startClocks();
  updateGameUI();
}

// -------------------------------------------------------------
// Interactive Undo System
// -------------------------------------------------------------
gameUndoBtn.addEventListener('click', () => {
  if (engine.phase !== 'playing') {
    appendChatMessage('system', "Cannot undo outside playing phase.");
    return;
  }
  // history index 0 is initial empty board, so moves start at length > 1
  if (engine.history.length <= 1) {
    appendChatMessage('system', "No moves have been played yet.");
    return;
  }

  // Determine steps: if it's my turn, revert opponent's move + my previous move (2 steps)
  // or 1 step if opponent just made their move
  const lastSnap = engine.history[engine.history.length - 1];
  const steps = lastSnap.action.player === myRole ? 1 : 2;

  appendChatMessage('system', `Undo requested. Waiting for ${opponentUsername}...`);
  if (conn && conn.open) {
    conn.send({ type: 'UNDO_REQUEST', steps });
  }
});

acceptUndoBtn.addEventListener('click', () => {
  undoModal.classList.add('hidden');
  const steps = engine.history.length > 2 ? 2 : 1;
  executeUndo(steps);
  if (conn && conn.open) {
    conn.send({ type: 'UNDO_RESPONSE', accepted: true, steps });
  }
});

rejectUndoBtn.addEventListener('click', () => {
  undoModal.classList.add('hidden');
  if (conn && conn.open) {
    conn.send({ type: 'UNDO_RESPONSE', accepted: false });
  }
});

function executeUndo(steps = 1) {
  const success = engine.undo(steps);
  if (success) {
    appendChatMessage('system', `Reverted ${steps} move(s).`);
    // Rebuild move list log accurately
    rebuildMoveLogUI();
    lastMoveCoord = null;
    if (engine.history.length > 1) {
      const prev = engine.history[engine.history.length - 1];
      if (prev.action && prev.action.r !== null) {
        lastMoveCoord = [prev.action.r, prev.action.c];
      }
    }
    updateGameUI();
  }
}

function rebuildMoveLogUI() {
  movesListEl.innerHTML = '';
  for (let i = 1; i < engine.history.length; i++) {
    const snap = engine.history[i];
    const act = snap.action;
    const pName = act.player === BLACK ? getPlayerName(BLACK) : getPlayerName(WHITE);
    const item = document.createElement('div');
    item.className = 'move-entry';
    item.setAttribute('data-step', i);

    let desc = `${i}. ${pName}: `;
    if (act.type === 'pass') {
      desc += 'Pass';
    } else {
      desc += `${toGoNotation(act.r, act.c)} ${act.captures > 0 ? '(+' + act.captures + ')' : ''}`;
    }
    item.innerHTML = `<span>${desc}</span>`;
    movesListEl.appendChild(item);
  }
  movesListEl.scrollTop = movesListEl.scrollHeight;
}

// -------------------------------------------------------------
// Clocks & Voice Byo-yomi
// -------------------------------------------------------------
function resetClocks() {
  const mainSec = clockConfig.mainMinutes * 60;
  timers = {
    [BLACK]: { mainSec: mainSec, byoSec: clockConfig.byoyomiSeconds, periodsLeft: clockConfig.byoyomiPeriods, inByoyomi: mainSec === 0 },
    [WHITE]: { mainSec: mainSec, byoSec: clockConfig.byoyomiSeconds, periodsLeft: clockConfig.byoyomiPeriods, inByoyomi: mainSec === 0 }
  };
  updateClockDisplay();
}

function startClocks() {
  if (clockInterval) clearInterval(clockInterval);
  if (clockConfig.mainMinutes === 0 && clockConfig.byoyomiSeconds === 0) return;

  clockInterval = setInterval(() => {
    if (engine.phase !== 'playing') return;

    const currentTurn = engine.turn;
    const t = timers[currentTurn];

    if (!t.inByoyomi) {
      if (t.mainSec > 0) {
        t.mainSec--;
      } else {
        t.inByoyomi = true;
        t.byoSec = clockConfig.byoyomiSeconds;
      }
    } else {
      if (t.byoSec > 0) {
        t.byoSec--;
        if (t.byoSec <= 10 && t.byoSec >= 1) {
          speakCountdown(t.byoSec);
        }
      } else {
        t.periodsLeft--;
        if (t.periodsLeft <= 0) {
          engine.phase = 'finished';
          stopClocks();
          const winner = engine.opponent(currentTurn);
          const winnerName = getPlayerName(winner);
          appendChatMessage('system', `${getPlayerName(currentTurn)} lost on time!`);
          finalizeAndSaveGame(`${winnerName} wins on Time`);
          updateGameUI();
          return;
        } else {
          t.byoSec = clockConfig.byoyomiSeconds;
          speakCountdown(t.byoSec);
        }
      }
    }

    updateClockDisplay();

    if (isHost && conn && conn.open && t.mainSec % 2 === 0) {
      conn.send({ type: 'SYNC_TIME', timers });
    }
  }, 1000);
}

function updateClocksOnMove(playerWhoJustMoved) {
  const t = timers[playerWhoJustMoved];
  if (t && t.inByoyomi && t.periodsLeft > 0) {
    t.byoSec = clockConfig.byoyomiSeconds;
  }
  updateClockDisplay();
}

function stopClocks() {
  if (clockInterval) clearInterval(clockInterval);
}

function formatTime(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function updateClockDisplay() {
  if (clockConfig.mainMinutes === 0) {
    blackMainTimeEl.textContent = "∞";
    whiteMainTimeEl.textContent = "∞";
    blackByoyomiEl.textContent = "Unlimited";
    whiteByoyomiEl.textContent = "Unlimited";
    return;
  }

  const b = timers[BLACK];
  blackMainTimeEl.textContent = formatTime(b.mainSec);
  blackByoyomiEl.textContent = b.inByoyomi ? `${b.byoSec}s (${b.periodsLeft} left)` : `${clockConfig.byoyomiSeconds}s (${clockConfig.byoyomiPeriods}x)`;

  const w = timers[WHITE];
  whiteMainTimeEl.textContent = formatTime(w.mainSec);
  whiteByoyomiEl.textContent = w.inByoyomi ? `${w.byoSec}s (${w.periodsLeft} left)` : `${clockConfig.byoyomiSeconds}s (${clockConfig.byoyomiPeriods}x)`;
}

// -------------------------------------------------------------
// Match Saving & Local Replay Archive
// -------------------------------------------------------------
function finalizeAndSaveGame(resultString) {
  reviewModeToggleBtn.classList.remove('hidden');

  // Build clean history snapshots for reliable replaying
  const snapshots = engine.history.map(h => ({
    board: h.board.map(r => [...r]),
    action: { ...h.action },
    captured: { ...h.captured },
    turn: h.turn
  }));

  const record = {
    id: 'game_' + Date.now(),
    date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    room: currentRoomName,
    blackPlayer: getPlayerName(BLACK),
    whitePlayer: getPlayerName(WHITE),
    size: engine.size,
    komi: engine.komi,
    result: resultString,
    totalMoves: engine.history.length - 1,
    snapshots: snapshots
  };

  saveGameToLocalStorage(record);
  renderArchivesList();
}

function getStoredGames() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch (_) {
    return [];
  }
}

function saveGameToLocalStorage(record) {
  const games = getStoredGames();
  games.unshift(record);
  if (games.length > 25) games.pop();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
}

function renderArchivesList() {
  const games = getStoredGames();
  savedGamesCountEl.textContent = `${games.length} game${games.length === 1 ? '' : 's'} stored`;

  if (games.length === 0) {
    archivesListEl.innerHTML = `<div class="empty-archive">No games saved yet. Play and finish a match to analyze the game move-by-move!</div>`;
    return;
  }

  archivesListEl.innerHTML = '';
  games.forEach(g => {
    const card = document.createElement('div');
    card.className = 'archive-card';
    card.innerHTML = `
      <div class="archive-info">
        <span class="archive-matchup">⚫ ${g.blackPlayer} vs ⚪ ${g.whitePlayer}</span>
        <span class="archive-meta">${g.date} • ${g.size}x${g.size} • ${g.result} (${g.totalMoves} moves)</span>
      </div>
      <button class="btn-ghost btn-sm replay-btn" data-id="${g.id}">Review Game ▶</button>
    `;
    archivesListEl.appendChild(card);
  });

  document.querySelectorAll('.replay-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      loadGameForReview(id);
    });
  });
}

clearArchivesBtn.addEventListener('click', () => {
  if (confirm("Clear all locally saved match history?")) {
    localStorage.removeItem(STORAGE_KEY);
    renderArchivesList();
  }
});

// -------------------------------------------------------------
// Interactive Replay Review Mode
// -------------------------------------------------------------
function loadGameForReview(gameId) {
  const games = getStoredGames();
  const game = games.find(g => g.id === gameId);
  if (!game) return;

  homeView.classList.add('hidden');
  gameView.classList.remove('hidden');

  activeRoomTag.textContent = `Review: ${game.room}`;
  blackPlayerNameEl.textContent = game.blackPlayer;
  whitePlayerNameEl.textContent = game.whitePlayer;
  blackRoleLabel.textContent = "Archived";
  whiteRoleLabel.textContent = "Archived";
  displayKomiEl.textContent = game.komi;

  engine = new GoEngine(game.size, game.komi);
  reviewHistory = game.snapshots;

  // Populate moves list
  movesListEl.innerHTML = '';
  for (let i = 1; i < reviewHistory.length; i++) {
    const snap = reviewHistory[i];
    const act = snap.action;
    const pName = act.player === BLACK ? game.blackPlayer : game.whitePlayer;
    const item = document.createElement('div');
    item.className = 'move-entry';
    item.setAttribute('data-step', i);

    let desc = `${i}. ${pName}: `;
    if (act.type === 'pass') desc += 'Pass';
    else desc += `${toGoNotation(act.r, act.c)} ${act.captures > 0 ? '(+' + act.captures + ')' : ''}`;
    item.innerHTML = `<span>${desc}</span>`;
    item.addEventListener('click', () => showReviewStep(i));
    movesListEl.appendChild(item);
  }

  enterReviewMode();
}

reviewModeToggleBtn.addEventListener('click', () => {
  if (!isReviewMode) {
    reviewHistory = engine.history.map(h => ({
      board: h.board.map(r => [...r]),
      action: { ...h.action },
      captured: { ...h.captured },
      turn: h.turn
    }));
    enterReviewMode();
  } else {
    exitReviewMode();
  }
});

function enterReviewMode() {
  isReviewMode = true;
  gameActionsCard.classList.add('hidden');
  reviewControlsCard.classList.remove('hidden');
  reviewModeToggleBtn.textContent = "Exit Review";
  reviewStep = reviewHistory.length - 1;
  showReviewStep(reviewStep);
}

function exitReviewMode() {
  isReviewMode = false;
  gameActionsCard.classList.remove('hidden');
  reviewControlsCard.classList.add('hidden');
  reviewModeToggleBtn.textContent = "🔍 Review Game";
  updateGameUI();
}

function showReviewStep(step) {
  if (step < 0 || step >= reviewHistory.length) return;
  reviewStep = step;

  const snap = reviewHistory[step];
  engine.board = snap.board.map(r => [...r]);
  blackCapturesEl.textContent = snap.captured ? snap.captured[BLACK] : 0;
  whiteCapturesEl.textContent = snap.captured ? snap.captured[WHITE] : 0;

  lastMoveCoord = (snap.action && snap.action.r !== null) ? [snap.action.r, snap.action.c] : null;

  reviewBanner.textContent = `Move ${reviewStep} / ${reviewHistory.length - 1}`;
  highlightActiveLogEntry(reviewStep);
  renderBoard();
}

function highlightActiveLogEntry(step) {
  const entries = movesListEl.children;
  for (let i = 0; i < entries.length; i++) {
    const isTarget = i === step - 1;
    entries[i].classList.toggle('active-step', isTarget);
    if (isTarget) {
      entries[i].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}

revFirstBtn.addEventListener('click', () => showReviewStep(0));
revPrevBtn.addEventListener('click', () => showReviewStep(reviewStep - 1));
revNextBtn.addEventListener('click', () => showReviewStep(reviewStep + 1));
revLastBtn.addEventListener('click', () => showReviewStep(reviewHistory.length - 1));

window.addEventListener('keydown', (e) => {
  if (!isReviewMode) return;
  if (e.key === 'ArrowLeft') showReviewStep(reviewStep - 1);
  if (e.key === 'ArrowRight') showReviewStep(reviewStep + 1);
});

// -------------------------------------------------------------
// Board Clicks & Game Actions
// -------------------------------------------------------------
function handleBoardClick(r, c) {
  if (isReviewMode) return;

  if (engine.phase === 'playing') {
    if (conn && myRole && engine.turn !== myRole) {
      appendChatMessage('system', "It's not your turn!");
      return;
    }

    const res = engine.playMove(r, c);
    if (!res.success) {
      appendChatMessage('system', `Illegal: ${res.reason}`);
      return;
    }

    lastMoveCoord = [r, c];
    if (res.captured && res.captured.length > 0) {
      playCaptureSound();
    } else {
      playStoneSound();
    }
    logMove(r, c, res.player, res.captured.length);
    updateClocksOnMove(res.player);

    if (conn && conn.open) {
      conn.send({ type: 'MOVE', r, c });
    }
    updateGameUI();

  } else if (engine.phase === 'scoring') {
    engine.toggleDeadStone(r, c);
    if (conn && conn.open) {
      conn.send({ type: 'TOGGLE_DEAD', r, c });
    }
    updateGameUI();
  }
}

gamePassBtn.addEventListener('click', () => {
  if (conn && myRole && engine.turn !== myRole) {
    appendChatMessage('system', "Wait for your turn to pass.");
    return;
  }
  const res = engine.pass();
  if (res.success) {
    logMove(null, null, res.passedBy, 0, true);
    appendChatMessage('system', `${getPlayerName(res.passedBy)} passed.`);
    if (res.phaseChanged) {
      stopClocks();
      appendChatMessage('system', "Both passed! Japanese dead-stone scoring initiated.");
    } else {
      updateClocksOnMove(res.passedBy);
    }
    if (conn && conn.open) conn.send({ type: 'PASS' });
    updateGameUI();
  }
});

gameResignBtn.addEventListener('click', () => {
  if (!confirm("Are you sure you want to resign the game?")) return;
  const resigningColor = (conn && myRole) ? myRole : engine.turn;
  engine.resign(resigningColor);
  stopClocks();
  const resignerName = getPlayerName(resigningColor);
  appendChatMessage('system', `${resignerName} resigned.`);
  if (conn && conn.open) conn.send({ type: 'RESIGN', color: resigningColor });

  const winnerName = getPlayerName(engine.opponent(resigningColor));
  finalizeAndSaveGame(`${winnerName} wins by Resignation`);
  updateGameUI();
});

confirmScoreBtn.addEventListener('click', () => {
  engine.phase = 'finished';
  appendChatMessage('system', "You accepted the final Japanese score.");
  if (conn && conn.open) conn.send({ type: 'CONFIRM_SCORE' });

  const score = engine.calculateJapaneseScore();
  const winnerName = score.winner === BLACK ? getPlayerName(BLACK) : getPlayerName(WHITE);
  finalizeAndSaveGame(`${winnerName} wins by ${score.margin.toFixed(1)} pts`);
  updateGameUI();
});

leaveGameBtn.addEventListener('click', () => {
  if (confirm("Leave this match and return to home?")) {
    window.location.href = window.location.pathname;
  }
});

function copyGameInvite() {
  const url = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(currentRoomName)}`;
  navigator.clipboard.writeText(url).then(() => {
    alert("Room invite link copied to clipboard!");
  }).catch(() => {
    prompt("Copy this invite link:", url);
  });
}
copyShareUrlBtn.addEventListener('click', copyGameInvite);
copyGameLinkBtn.addEventListener('click', copyGameInvite);

cancelWaitingBtn.addEventListener('click', () => {
  if (peer) peer.destroy();
  waitingModal.classList.add('hidden');
});

// -------------------------------------------------------------
// Live Chat System
// -------------------------------------------------------------
tabChatBtn.addEventListener('click', () => {
  tabChatBtn.classList.add('active');
  tabLogBtn.classList.remove('active');
  chatPanel.classList.remove('hidden');
  logPanel.classList.add('hidden');
});

tabLogBtn.addEventListener('click', () => {
  tabLogBtn.classList.add('active');
  tabChatBtn.classList.remove('active');
  logPanel.classList.remove('hidden');
  chatPanel.classList.add('hidden');
});

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;

  appendChatMessage('me', text, myUsername);

  if (conn && conn.open) {
    conn.send({ type: 'CHAT', text, sender: myUsername });
  }

  chatInput.value = '';
});

function appendChatMessage(type, text, sender = '') {
  const msgEl = document.createElement('div');
  if (type === 'system') {
    msgEl.className = 'chat-system-msg';
    msgEl.textContent = text;
  } else {
    msgEl.className = `chat-msg ${type === 'me' ? 'me' : 'them'}`;
    const nameEl = document.createElement('div');
    nameEl.className = 'sender-name';
    nameEl.textContent = sender;
    const bodyEl = document.createElement('div');
    bodyEl.textContent = text;
    msgEl.appendChild(nameEl);
    msgEl.appendChild(bodyEl);
  }
  chatMessagesEl.appendChild(msgEl);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

// -------------------------------------------------------------
// Board Rendering & Move Log
// -------------------------------------------------------------
function toGoNotation(r, c) {
  const letters = "ABCDEFGHJKLMNOPQRST";
  return `${letters[c]}${engine.size - r}`;
}

function logMove(r, c, player, capturedCount, isPass = false) {
  const moveNum = engine.history.length - 1;
  const pName = player === BLACK ? getPlayerName(BLACK) : getPlayerName(WHITE);
  const item = document.createElement('div');
  item.className = 'move-entry';
  item.setAttribute('data-step', moveNum);

  let desc = `${moveNum}. ${pName}: `;
  if (isPass) {
    desc += 'Pass';
  } else {
    desc += `${toGoNotation(r, c)} ${capturedCount > 0 ? '(+' + capturedCount + ')' : ''}`;
  }
  item.innerHTML = `<span>${desc}</span>`;
  movesListEl.appendChild(item);
  movesListEl.scrollTop = movesListEl.scrollHeight;
}

function updateGameUI() {
  if (isReviewMode) return;
  renderBoard();

  blackCapturesEl.textContent = engine.captured[BLACK];
  whiteCapturesEl.textContent = engine.captured[WHITE];

  blackHud.classList.toggle('active-turn', engine.phase === 'playing' && engine.turn === BLACK);
  whiteHud.classList.toggle('active-turn', engine.phase === 'playing' && engine.turn === WHITE);

  if (engine.phase === 'playing') {
    turnBanner.textContent = `Current Turn: ${engine.turn === BLACK ? getPlayerName(BLACK) : getPlayerName(WHITE)}`;
    scoringCard.classList.add('hidden');

    const isMyTurn = !conn || !myRole || engine.turn === myRole;
    gamePassBtn.classList.toggle('hidden', !isMyTurn);
    gamePassBtn.disabled = !isMyTurn;

    gameUndoBtn.disabled = false;
    gameResignBtn.disabled = false;
  } else if (engine.phase === 'scoring') {
    turnBanner.textContent = `Japanese Scoring Phase`;
    scoringCard.classList.remove('hidden');
    gamePassBtn.classList.add('hidden');
    gamePassBtn.disabled = true;
    gameUndoBtn.disabled = true;

    const score = engine.calculateJapaneseScore();
    scoreBreakdownEl.innerHTML = `
      <strong>${getPlayerName(BLACK)}:</strong> ${score.black.territory} terr + ${score.black.prisoners} captured + ${score.black.deadEnemyStones} dead = <strong>${score.black.total}</strong><br>
      <strong>${getPlayerName(WHITE)}:</strong> ${score.white.territory} terr + ${score.white.prisoners} captured + ${score.white.deadEnemyStones} dead + ${score.white.komi} komi = <strong>${score.white.total}</strong><br>
      <em>Leader: ${score.winner === BLACK ? getPlayerName(BLACK) : getPlayerName(WHITE)} by ${score.margin.toFixed(1)} pts</em>
    `;
  } else if (engine.phase === 'finished') {
    scoringCard.classList.remove('hidden');
    gamePassBtn.classList.add('hidden');
    gameUndoBtn.disabled = true;
    gameResignBtn.disabled = true;
    const score = engine.calculateJapaneseScore();
    const winnerName = score.winner === BLACK ? getPlayerName(BLACK) : getPlayerName(WHITE);
    turnBanner.textContent = `Game Over: ${winnerName} wins!`;
    scoreBreakdownEl.innerHTML = `
      <strong>Final Result:</strong> ${winnerName} wins by ${score.margin.toFixed(1)} points!
    `;
  }
}

function renderBoard() {
  const width = canvas.width;
  const height = canvas.height;
  const size = engine.size;
  const padding = 34;
  const cell = (width - padding * 2) / (size - 1);

  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = '#dfb274';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#3b2513';
  ctx.lineWidth = 1.2;

  for (let i = 0; i < size; i++) {
    ctx.beginPath();
    ctx.moveTo(padding, padding + i * cell);
    ctx.lineTo(width - padding, padding + i * cell);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(padding + i * cell, padding);
    ctx.lineTo(padding + i * cell, height - padding);
    ctx.stroke();
  }

  const letters = "ABCDEFGHJKLMNOPQRST";
  ctx.fillStyle = '#42240c';
  ctx.font = '600 11px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < size; i++) {
    ctx.fillText(letters[i], padding + i * cell, 14);
    ctx.fillText(letters[i], padding + i * cell, height - 14);
    ctx.fillText(`${size - i}`, 14, padding + i * cell);
    ctx.fillText(`${size - i}`, width - 14, padding + i * cell);
  }

  ctx.fillStyle = '#3b2513';
  for (const [sr, sc] of getStarPoints(size)) {
    ctx.beginPath();
    ctx.arc(padding + sc * cell, padding + sr * cell, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  if (engine.phase === 'scoring' || engine.phase === 'finished') {
    const scoreData = engine.calculateJapaneseScore();
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const owner = scoreData.territoryMap[r][c];
        if (owner !== EMPTY) {
          ctx.fillStyle = owner === BLACK ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.65)';
          const sq = cell * 0.35;
          ctx.fillRect(padding + c * cell - sq / 2, padding + r * cell - sq / 2, sq, sq);
        }
      }
    }
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const stone = engine.board[r][c];
      if (stone !== EMPTY) {
        const isDead = engine.deadStones[r][c];
        const isLastMove = lastMoveCoord && lastMoveCoord[0] === r && lastMoveCoord[1] === c;
        drawStone(r, c, stone, cell, padding, isDead, isLastMove);
      }
    }
  }

  if (!isReviewMode && hoverCoord && engine.phase === 'playing' && engine.board[hoverCoord.r][hoverCoord.c] === EMPTY) {
    const isMyTurn = !conn || !myRole || engine.turn === myRole;
    if (isMyTurn) {
      drawGhostStone(hoverCoord.r, hoverCoord.c, engine.turn, cell, padding);
    }
  }
}

function getStarPoints(size) {
  if (size === 19) {
    const pts = [3, 9, 15];
    const coords = [];
    for (const r of pts) {
      for (const c of pts) coords.push([r, c]);
    }
    return coords;
  } else if (size === 13) {
    return [[3, 3], [3, 9], [6, 6], [9, 3], [9, 9]];
  } else if (size === 9) {
    return [[2, 2], [2, 6], [4, 4], [6, 2], [6, 6]];
  }
  return [];
}

function drawStone(r, c, color, cell, padding, isDead, isLastMove) {
  const x = padding + c * cell;
  const y = padding + r * cell;
  const radius = cell * 0.46;

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);

  const grad = ctx.createRadialGradient(
    x - radius * 0.3, y - radius * 0.3, radius * 0.1,
    x, y, radius
  );

  if (color === BLACK) {
    grad.addColorStop(0, '#555');
    grad.addColorStop(1, '#111');
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
  } else {
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#dedede');
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 2;
  }

  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  if (isLastMove) {
    ctx.strokeStyle = color === BLACK ? '#f8fafc' : '#0f172a';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.45, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (isDead) {
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    const offset = radius * 0.5;
    ctx.beginPath();
    ctx.moveTo(x - offset, y - offset);
    ctx.lineTo(x + offset, y + offset);
    ctx.moveTo(x + offset, y - offset);
    ctx.lineTo(x - offset, y + offset);
    ctx.stroke();
  }
}

function drawGhostStone(r, c, color, cell, padding) {
  const x = padding + c * cell;
  const y = padding + r * cell;
  const radius = cell * 0.44;

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color === BLACK ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.55)';
  ctx.fill();
  ctx.restore();
}

function getCoordFromMouse(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const mouseX = (e.clientX - rect.left) * scaleX;
  const mouseY = (e.clientY - rect.top) * scaleY;

  const padding = 34;
  const cell = (canvas.width - padding * 2) / (engine.size - 1);

  const c = Math.round((mouseX - padding) / cell);
  const r = Math.round((mouseY - padding) / cell);

  if (r >= 0 && r < engine.size && c >= 0 && c < engine.size) {
    return { r, c };
  }
  return null;
}

canvas.addEventListener('mousemove', (e) => {
  const coord = getCoordFromMouse(e);
  if (coord) {
    hoverCoord = coord;
    renderBoard();
  }
});

canvas.addEventListener('mouseleave', () => {
  hoverCoord = null;
  renderBoard();
});

canvas.addEventListener('click', (e) => {
  const coord = getCoordFromMouse(e);
  if (coord) {
    handleBoardClick(coord.r, coord.c);
  }
});

// Initialization
window.addEventListener('DOMContentLoaded', () => {
  renderArchivesList();

  const params = new URLSearchParams(window.location.search);
  const room = params.get('room');
  if (room) {
    joinRoomNameInput.value = room;
    joinPlayerNameInput.focus();
  }
});
