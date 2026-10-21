// Application Controller, Canvas Rendering & WebRTC PeerJS Sync

let engine = new GoEngine(19, 6.5);
let peer = null;
let conn = null;
let myRole = null; // BLACK, WHITE, or null (local/spectator)
let hoverCoord = null;

// UI Elements
const canvas = document.getElementById('goBoard');
const ctx = canvas.getContext('2d');
const myPeerIdEl = document.getElementById('myPeerId');
const targetPeerIdInput = document.getElementById('targetPeerId');
const connectBtn = document.getElementById('connectBtn');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const connectionStatusEl = document.getElementById('connectionStatus');
const blackCapturesEl = document.getElementById('blackCaptures');
const whiteCapturesEl = document.getElementById('whiteCaptures');
const blackRoleTag = document.getElementById('blackRoleTag');
const whiteRoleTag = document.getElementById('whiteRoleTag');
const blackPlayerBox = document.getElementById('blackPlayerBox');
const whitePlayerBox = document.getElementById('whitePlayerBox');
const turnIndicatorEl = document.getElementById('turnIndicator');
const gamePhaseEl = document.getElementById('gamePhase');
const lastMoveEl = document.getElementById('lastMove');
const passBtn = document.getElementById('passBtn');
const resignBtn = document.getElementById('resignBtn');
const newGameBtn = document.getElementById('newGameBtn');
const boardSizeSelect = document.getElementById('boardSizeSelect');
const gameLogEl = document.getElementById('gameLog');
const scoringCard = document.getElementById('scoringCard');
const scoreSummaryEl = document.getElementById('scoreSummary');
const finishScoringBtn = document.getElementById('finishScoringBtn');

// Initialize PeerJS
function initPeer() {
  // Using PeerJS cloud public broker (free & reliable WebRTC signaling)
  peer = new Peer();

  peer.on('open', (id) => {
    myPeerIdEl.textContent = id;
    logMessage(`Your Peer ID is ready: ${id}`);
    checkUrlForPeerConnection();
  });

  peer.on('connection', (incomingConn) => {
    if (conn && conn.open) {
      logMessage(`Rejected additional connection.`);
      return;
    }
    setupConnection(incomingConn, false);
  });

  peer.on('error', (err) => {
    console.error("Peer error:", err);
    connectionStatusEl.textContent = `Error: ${err.type}`;
    connectionStatusEl.className = 'connection-status error';
  });
}

function checkUrlForPeerConnection() {
  const urlParams = new URLSearchParams(window.location.search);
  const targetId = urlParams.get('join');
  if (targetId && targetId !== peer.id) {
    targetPeerIdInput.value = targetId;
    connectToPeer(targetId);
  }
}

function connectToPeer(targetId) {
  if (!peer || !targetId) return;
  logMessage(`Connecting to ${targetId}...`);
  connectionStatusEl.textContent = "Connecting to friend...";
  connectionStatusEl.className = "connection-status disconnected";
  const outgoingConn = peer.connect(targetId);
  setupConnection(outgoingConn, true);
}

function setupConnection(c, isInitiator) {
  conn = c;

  conn.on('open', () => {
    connectionStatusEl.textContent = `Connected with peer!`;
    connectionStatusEl.className = 'connection-status connected';
    logMessage("P2P connection established!");

    if (isInitiator) {
      // Initiator joins as White; Host is Black
      myRole = WHITE;
      conn.send({ type: 'ASSIGN_ROLE', hostRole: BLACK, guestRole: WHITE });
      setRoles(WHITE);
    } else {
      myRole = BLACK;
      setRoles(BLACK);
    }
    updateUI();
  });

  conn.on('data', (data) => {
    handlePeerMessage(data);
  });

  conn.on('close', () => {
    connectionStatusEl.textContent = "Friend disconnected.";
    connectionStatusEl.className = "connection-status disconnected";
    logMessage("Peer connection closed.");
    conn = null;
    myRole = null;
    updateUI();
  });
}

function setRoles(myColor) {
  if (myColor === BLACK) {
    blackRoleTag.textContent = "(You)";
    whiteRoleTag.textContent = "(Friend)";
  } else if (myColor === WHITE) {
    blackRoleTag.textContent = "(Friend)";
    whiteRoleTag.textContent = "(You)";
  } else {
    blackRoleTag.textContent = "";
    whiteRoleTag.textContent = "";
  }
}

function handlePeerMessage(data) {
  switch (data.type) {
    case 'ASSIGN_ROLE':
      // The other side told us roles
      break;

    case 'MOVE':
      const res = engine.playMove(data.r, data.c);
      if (res.success) {
        logMove(data.r, data.c, res.player, res.captured.length);
        updateUI();
      }
      break;

    case 'PASS':
      const pRes = engine.pass();
      if (pRes.success) {
        logMessage(`${pRes.passedBy === BLACK ? 'Black' : 'White'} passed.`);
        if (pRes.phaseChanged) {
          logMessage("Both passed! Japanese dead-stone scoring phase started.");
        }
        updateUI();
      }
      break;

    case 'RESIGN':
      engine.resign(data.color);
      logMessage(`${data.color === BLACK ? 'Black' : 'White'} resigned.`);
      updateUI();
      break;

    case 'NEW_GAME':
      engine = new GoEngine(data.size, 6.5);
      boardSizeSelect.value = data.size;
      logMessage(`New game started (${data.size}x${data.size}).`);
      updateUI();
      break;

    case 'TOGGLE_DEAD':
      engine.toggleDeadStone(data.r, data.c);
      updateUI();
      break;

    case 'ACCEPT_SCORE':
      engine.phase = 'finished';
      logMessage("Both players accepted the score!");
      updateUI();
      break;
  }
}

// Coordinate conversions
function toGoCoord(r, c) {
  const letters = "ABCDEFGHJKLMNOPQRST"; // I is omitted in traditional Go notation
  return `${letters[c]}${engine.size - r}`;
}

function logMove(r, c, player, capturedCount) {
  const coord = toGoCoord(r, c);
  const pName = player === BLACK ? "Black" : "White";
  let msg = `${pName} played at ${coord}`;
  if (capturedCount > 0) {
    msg += ` (Captured ${capturedCount} stone${capturedCount > 1 ? 's' : ''})`;
  }
  lastMoveEl.textContent = `Last Move: ${pName} at ${coord}`;
  logMessage(msg);
}

function logMessage(msg) {
  const div = document.createElement('div');
  div.textContent = msg;
  gameLogEl.appendChild(div);
  gameLogEl.scrollTop = gameLogEl.scrollHeight;
}

// User Actions
function handleBoardClick(r, c) {
  if (engine.phase === 'playing') {
    // If online, ensure it's our turn
    if (conn && myRole && engine.turn !== myRole) {
      logMessage("Wait for your turn!");
      return;
    }

    const res = engine.playMove(r, c);
    if (!res.success) {
      logMessage(`Move error: ${res.reason}`);
      return;
    }

    logMove(r, c, res.player, res.captured.length);

    // Sync with peer
    if (conn && conn.open) {
      conn.send({ type: 'MOVE', r, c });
    }
    updateUI();

  } else if (engine.phase === 'scoring') {
    engine.toggleDeadStone(r, c);
    if (conn && conn.open) {
      conn.send({ type: 'TOGGLE_DEAD', r, c });
    }
    updateUI();
  }
}

// Canvas Rendering
function renderBoard() {
  const width = canvas.width;
  const height = canvas.height;
  const size = engine.size;
  const padding = 35;
  const cell = (width - padding * 2) / (size - 1);

  ctx.clearRect(0, 0, width, height);

  // Background wood color
  ctx.fillStyle = '#deb887';
  ctx.fillRect(0, 0, width, height);

  // Grid lines
  ctx.strokeStyle = '#3e2723';
  ctx.lineWidth = 1.2;

  for (let i = 0; i < size; i++) {
    // Horizontal
    ctx.beginPath();
    ctx.moveTo(padding, padding + i * cell);
    ctx.lineTo(width - padding, padding + i * cell);
    ctx.stroke();

    // Vertical
    ctx.beginPath();
    ctx.moveTo(padding + i * cell, padding);
    ctx.lineTo(padding + i * cell, height - padding);
    ctx.stroke();
  }

  // Coordinate Labels
  const letters = "ABCDEFGHJKLMNOPQRST";
  ctx.fillStyle = '#4a2c11';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < size; i++) {
    // Columns (letters)
    ctx.fillText(letters[i], padding + i * cell, 16);
    ctx.fillText(letters[i], padding + i * cell, height - 16);
    // Rows (numbers)
    ctx.fillText(`${size - i}`, 16, padding + i * cell);
    ctx.fillText(`${size - i}`, width - 16, padding + i * cell);
  }

  // Star Points (Hoshi)
  const starCoords = getStarPoints(size);
  ctx.fillStyle = '#3e2723';
  for (const [sr, sc] of starCoords) {
    ctx.beginPath();
    ctx.arc(padding + sc * cell, padding + sr * cell, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Territory markers if in scoring/finished phase
  if (engine.phase === 'scoring' || engine.phase === 'finished') {
    const scoreData = engine.calculateJapaneseScore();
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const owner = scoreData.territoryMap[r][c];
        if (owner !== EMPTY) {
          ctx.fillStyle = owner === BLACK ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.6)';
          const squareSize = cell * 0.35;
          ctx.fillRect(padding + c * cell - squareSize / 2, padding + r * cell - squareSize / 2, squareSize, squareSize);
        }
      }
    }
  }

  // Stones
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const stone = engine.board[r][c];
      if (stone !== EMPTY) {
        const isDead = engine.deadStones[r][c];
        drawStone(r, c, stone, cell, padding, isDead);
      }
    }
  }

  // Hover Ghost Stone Preview
  if (hoverCoord && engine.phase === 'playing' && engine.board[hoverCoord.r][hoverCoord.c] === EMPTY) {
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
      for (const c of pts) {
        coords.push([r, c]);
      }
    }
    return coords;
  } else if (size === 13) {
    return [[3, 3], [3, 9], [6, 6], [9, 3], [9, 9]];
  } else if (size === 9) {
    return [[2, 2], [2, 6], [4, 4], [6, 2], [6, 6]];
  }
  return [];
}

function drawStone(r, c, color, cell, padding, isDead = false) {
  const x = padding + c * cell;
  const y = padding + r * cell;
  const radius = cell * 0.46;

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);

  // Gradient shading for realistic stones
  const grad = ctx.createRadialGradient(
    x - radius * 0.3, y - radius * 0.3, radius * 0.1,
    x, y, radius
  );

  if (color === BLACK) {
    grad.addColorStop(0, '#555');
    grad.addColorStop(1, '#111');
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
  } else {
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#dedede');
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
  }

  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  // If marked dead during scoring phase, draw a red X
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
  ctx.fillStyle = color === BLACK ? 'rgba(0, 0, 0, 0.45)' : 'rgba(255, 255, 255, 0.55)';
  ctx.fill();
  ctx.restore();
}

function updateUI() {
  renderBoard();

  blackCapturesEl.textContent = engine.captured[BLACK];
  whiteCapturesEl.textContent = engine.captured[WHITE];

  const isPlaying = engine.phase === 'playing';
  passBtn.disabled = !isPlaying;
  resignBtn.disabled = !isPlaying;

  if (engine.phase === 'playing') {
    turnIndicatorEl.innerHTML = `Current Turn: <strong>${engine.turn === BLACK ? 'Black' : 'White'}</strong>`;
    gamePhaseEl.textContent = "Phase: Playing";
    scoringCard.classList.add('hidden');
    blackPlayerBox.classList.toggle('active-turn', engine.turn === BLACK);
    whitePlayerBox.classList.toggle('active-turn', engine.turn === WHITE);
  } else if (engine.phase === 'scoring') {
    turnIndicatorEl.innerHTML = `<strong>Japanese Scoring Phase</strong>`;
    gamePhaseEl.textContent = "Phase: Confirming Dead Stones";
    scoringCard.classList.remove('hidden');

    const score = engine.calculateJapaneseScore();
    scoreSummaryEl.innerHTML = `
      <strong>Black:</strong> ${score.black.territory} terr + ${score.black.prisoners} captured + ${score.black.deadEnemyStones} dead = <strong>${score.black.total}</strong><br>
      <strong>White:</strong> ${score.white.territory} terr + ${score.white.prisoners} captured + ${score.white.deadEnemyStones} dead + ${score.white.komi} komi = <strong>${score.white.total}</strong><br>
      <em>Projected Leader: ${score.winner === BLACK ? 'Black' : 'White'} by ${score.margin.toFixed(1)} pts</em>
    `;
  } else if (engine.phase === 'finished') {
    turnIndicatorEl.innerHTML = `<strong>Game Finished</strong>`;
    gamePhaseEl.textContent = "Phase: Finished";
    scoringCard.classList.remove('hidden');
    const score = engine.calculateJapaneseScore();
    scoreSummaryEl.innerHTML = `
      <strong>Result:</strong> ${score.winner === BLACK ? 'Black' : 'White'} wins by ${score.margin.toFixed(1)} points!
    `;
  }
}

// Canvas Mouse Events
function getGridCoordFromMouse(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const mouseX = (e.clientX - rect.left) * scaleX;
  const mouseY = (e.clientY - rect.top) * scaleY;

  const padding = 35;
  const cell = (canvas.width - padding * 2) / (engine.size - 1);

  const c = Math.round((mouseX - padding) / cell);
  const r = Math.round((mouseY - padding) / cell);

  if (r >= 0 && r < engine.size && c >= 0 && c < engine.size) {
    return { r, c };
  }
  return null;
}

canvas.addEventListener('mousemove', (e) => {
  const coord = getGridCoordFromMouse(e);
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
  const coord = getGridCoordFromMouse(e);
  if (coord) {
    handleBoardClick(coord.r, coord.c);
  }
});

// Button Handlers
passBtn.addEventListener('click', () => {
  if (conn && myRole && engine.turn !== myRole) {
    logMessage("Wait for your turn to pass!");
    return;
  }
  const res = engine.pass();
  if (res.success) {
    logMessage(`${res.passedBy === BLACK ? 'Black' : 'White'} passed.`);
    if (res.phaseChanged) {
      logMessage("Both players passed. Moving to Japanese dead-stone scoring.");
    }
    if (conn && conn.open) conn.send({ type: 'PASS' });
    updateUI();
  }
});

resignBtn.addEventListener('click', () => {
  if (!confirm("Are you sure you want to resign?")) return;
  const resigningColor = (conn && myRole) ? myRole : engine.turn;
  engine.resign(resigningColor);
  logMessage(`${resigningColor === BLACK ? 'Black' : 'White'} resigned.`);
  if (conn && conn.open) conn.send({ type: 'RESIGN', color: resigningColor });
  updateUI();
});

newGameBtn.addEventListener('click', () => {
  const chosenSize = parseInt(boardSizeSelect.value, 10);
  engine = new GoEngine(chosenSize, 6.5);
  logMessage(`New game started (${chosenSize}x${chosenSize}).`);
  if (conn && conn.open) conn.send({ type: 'NEW_GAME', size: chosenSize });
  updateUI();
});

finishScoringBtn.addEventListener('click', () => {
  engine.phase = 'finished';
  logMessage("Score accepted.");
  if (conn && conn.open) conn.send({ type: 'ACCEPT_SCORE' });
  updateUI();
});

connectBtn.addEventListener('click', () => {
  let targetId = targetPeerIdInput.value.trim();
  if (!targetId) return;
  // If the user pasted the entire invite link, extract the ?join= param
  if (targetId.includes('?join=')) {
    try {
      const url = new URL(targetId);
      targetId = url.searchParams.get('join') || targetId;
    } catch (_) {}
  }
  connectToPeer(targetId);
});

copyLinkBtn.addEventListener('click', () => {
  if (!peer || !peer.id) return;
  const url = `${window.location.origin}${window.location.pathname}?join=${peer.id}`;
  navigator.clipboard.writeText(url).then(() => {
    alert("Invite link copied to clipboard! Send it to your friend.");
  }).catch(() => {
    prompt("Copy this invite link:", url);
  });
});

// Start Peer and initial render
initPeer();
updateUI();
