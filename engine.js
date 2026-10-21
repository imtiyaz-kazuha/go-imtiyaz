// Go (Baduk) Game Engine with Japanese Rules (Nihon Ki-in)

const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;

class GoEngine {
  constructor(size = 19, komi = 6.5) {
    this.size = size;
    this.komi = komi;
    this.reset();
  }

  reset() {
    this.board = Array(this.size).fill(null).map(() => Array(this.size).fill(EMPTY));
    this.turn = BLACK;
    this.consecutivePasses = 0;
    this.captured = { [BLACK]: 0, [WHITE]: 0 }; // captures made by BLACK and WHITE
    this.koPoint = null; // [r, c] that is illegal due to Ko
    this.phase = 'playing'; // 'playing', 'scoring', 'finished'
    this.deadStones = Array(this.size).fill(null).map(() => Array(this.size).fill(false));
    this.history = []; // snapshots for undo and full game review
  }

  opponent(color) {
    return color === BLACK ? WHITE : BLACK;
  }

  isValidCoord(r, c) {
    return r >= 0 && r < this.size && c >= 0 && c < this.size;
  }

  getNeighbors(r, c) {
    const neighbors = [];
    const deltas = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of deltas) {
      const nr = r + dr;
      const nc = c + dc;
      if (this.isValidCoord(nr, nc)) {
        neighbors.push([nr, nc]);
      }
    }
    return neighbors;
  }

  // Find chain of connected stones and liberties
  getChainAndLiberties(r, c, board = this.board) {
    const color = board[r][c];
    if (color === EMPTY) return { chain: [], liberties: new Set() };

    const chain = [];
    const liberties = new Set();
    const visited = Array(this.size).fill(null).map(() => Array(this.size).fill(false));
    const queue = [[r, c]];
    visited[r][c] = true;

    while (queue.length > 0) {
      const [currR, currC] = queue.shift();
      chain.push([currR, currC]);

      for (const [nr, nc] of this.getNeighbors(currR, currC)) {
        if (board[nr][nc] === EMPTY) {
          liberties.add(`${nr},${nc}`);
        } else if (board[nr][nc] === color && !visited[nr][nc]) {
          visited[nr][nc] = true;
          queue.push([nr, nc]);
        }
      }
    }

    return { chain, liberties };
  }

  saveSnapshot(actionType, r = null, c = null) {
    this.history.push({
      board: this.board.map(row => [...row]),
      turn: this.turn,
      consecutivePasses: this.consecutivePasses,
      captured: { ...this.captured },
      koPoint: this.koPoint ? [...this.koPoint] : null,
      phase: this.phase,
      action: { type: actionType, r, c, player: this.turn }
    });
  }

  // Attempt to play a stone at (r, c) for the current turn
  playMove(r, c) {
    if (this.phase !== 'playing') {
      return { success: false, reason: "Game is not in playing phase" };
    }

    if (!this.isValidCoord(r, c)) {
      return { success: false, reason: "Out of bounds" };
    }

    if (this.board[r][c] !== EMPTY) {
      return { success: false, reason: "Intersection already occupied" };
    }

    // Check basic Ko rule
    if (this.koPoint && this.koPoint[0] === r && this.koPoint[1] === c) {
      return { success: false, reason: "Illegal move: Ko rule violation" };
    }

    const player = this.turn;
    const opp = this.opponent(player);

    // Create a speculative board to evaluate captures & liberties
    const tempBoard = this.board.map(row => [...row]);
    tempBoard[r][c] = player;

    // Check captures of opponent's groups adjacent to (r, c)
    const capturedStones = [];
    for (const [nr, nc] of this.getNeighbors(r, c)) {
      if (tempBoard[nr][nc] === opp) {
        const { chain, liberties } = this.getChainAndLiberties(nr, nc, tempBoard);
        if (liberties.size === 0) {
          for (const [cr, cc] of chain) {
            tempBoard[cr][cc] = EMPTY;
            capturedStones.push([cr, cc]);
          }
        }
      }
    }

    // Check suicide rule (if own group has 0 liberties after potential captures)
    const { liberties: ownLiberties, chain: ownChain } = this.getChainAndLiberties(r, c, tempBoard);
    if (ownLiberties.size === 0) {
      return { success: false, reason: "Illegal move: Suicide is forbidden under Japanese rules" };
    }

    // Save snapshot prior to applying move
    this.saveSnapshot('move', r, c);

    // Check for single stone Ko creation:
    if (capturedStones.length === 1 && ownChain.length === 1 && ownLiberties.size === 1) {
      this.koPoint = capturedStones[0];
    } else {
      this.koPoint = null;
    }

    // Apply move
    this.board = tempBoard;
    this.captured[player] += capturedStones.length;
    this.consecutivePasses = 0;
    this.turn = opp;

    return {
      success: true,
      captured: capturedStones,
      player,
      nextTurn: this.turn
    };
  }

  pass() {
    if (this.phase !== 'playing') return { success: false };

    this.saveSnapshot('pass');

    this.consecutivePasses++;
    this.koPoint = null;
    const previousTurn = this.turn;
    this.turn = this.opponent(this.turn);

    // If both players pass consecutively, enter Japanese scoring phase
    if (this.consecutivePasses >= 2) {
      this.phase = 'scoring';
      return { success: true, phaseChanged: true, newPhase: 'scoring', passedBy: previousTurn };
    }

    return { success: true, phaseChanged: false, passedBy: previousTurn, nextTurn: this.turn };
  }

  // Undo move: Reverts 1 or 2 turns back
  undo(steps = 1) {
    if (this.history.length === 0) return false;
    let targetSnapshot = null;
    while (steps > 0 && this.history.length > 0) {
      targetSnapshot = this.history.pop();
      steps--;
    }
    if (!targetSnapshot) return false;

    this.board = targetSnapshot.board;
    this.turn = targetSnapshot.turn;
    this.consecutivePasses = targetSnapshot.consecutivePasses;
    this.captured = targetSnapshot.captured;
    this.koPoint = targetSnapshot.koPoint;
    this.phase = targetSnapshot.phase;
    return true;
  }

  resign(color) {
    this.phase = 'finished';
    const winner = this.opponent(color);
    return { success: true, winner, byResignation: true };
  }

  toggleDeadStone(r, c) {
    if (this.phase !== 'scoring') return false;
    if (this.board[r][c] === EMPTY) return false;

    // Toggle dead status for the whole chain
    const { chain } = this.getChainAndLiberties(r, c);
    const newStatus = !this.deadStones[r][c];
    for (const [cr, cc] of chain) {
      this.deadStones[cr][cc] = newStatus;
    }
    return true;
  }

  // Japanese Territory Calculation
  calculateJapaneseScore() {
    const visited = Array(this.size).fill(null).map(() => Array(this.size).fill(false));
    let blackTerritory = 0;
    let whiteTerritory = 0;
    const territoryMap = Array(this.size).fill(null).map(() => Array(this.size).fill(EMPTY));

    // Create effective board considering dead stones
    const effectiveBoard = Array(this.size).fill(null).map((_, r) =>
      Array(this.size).fill(null).map((_, c) => {
        if (this.deadStones[r][c]) return EMPTY;
        return this.board[r][c];
      })
    );

    // Dead stones count as prisoners for the capturer
    let deadBlackCount = 0;
    let deadWhiteCount = 0;
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.deadStones[r][c]) {
          if (this.board[r][c] === BLACK) deadBlackCount++;
          if (this.board[r][c] === WHITE) deadWhiteCount++;
        }
      }
    }

    // Flood fill empty regions to identify territory
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (effectiveBoard[r][c] === EMPTY && !visited[r][c]) {
          const region = [];
          const borderingColors = new Set();
          const queue = [[r, c]];
          visited[r][c] = true;

          while (queue.length > 0) {
            const [currR, currC] = queue.shift();
            region.push([currR, currC]);

            for (const [nr, nc] of this.getNeighbors(currR, currC)) {
              const neighborColor = effectiveBoard[nr][nc];
              if (neighborColor === EMPTY) {
                if (!visited[nr][nc]) {
                  visited[nr][nc] = true;
                  queue.push([nr, nc]);
                }
              } else {
                borderingColors.add(neighborColor);
              }
            }
          }

          // If region touches strictly only BLACK stones -> Black Territory
          if (borderingColors.has(BLACK) && !borderingColors.has(WHITE)) {
            blackTerritory += region.length;
            for (const [ptR, ptC] of region) territoryMap[ptR][ptC] = BLACK;
          }
          // If region touches strictly only WHITE stones -> White Territory
          else if (borderingColors.has(WHITE) && !borderingColors.has(BLACK)) {
            whiteTerritory += region.length;
            for (const [ptR, ptC] of region) territoryMap[ptR][ptC] = WHITE;
          }
        }
      }
    }

    const blackScore = blackTerritory + this.captured[BLACK] + deadWhiteCount;
    const whiteScore = whiteTerritory + this.captured[WHITE] + deadBlackCount + this.komi;

    return {
      black: {
        territory: blackTerritory,
        prisoners: this.captured[BLACK],
        deadEnemyStones: deadWhiteCount,
        total: blackScore
      },
      white: {
        territory: whiteTerritory,
        prisoners: this.captured[WHITE],
        deadEnemyStones: deadBlackCount,
        komi: this.komi,
        total: whiteScore
      },
      winner: blackScore > whiteScore ? BLACK : WHITE,
      margin: Math.abs(blackScore - whiteScore),
      territoryMap
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GoEngine, EMPTY, BLACK, WHITE };
}
