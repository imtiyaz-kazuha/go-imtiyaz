// Verification test suite for Japanese Territory Scoring (Nihon Ki-in)
const { GoEngine, EMPTY, BLACK, WHITE } = require('./engine.js');

console.log("=== RUNNING JAPANESE SCORING VERIFICATION SUITE ===\n");

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

// -------------------------------------------------------------
// Test 1: Empty Board Scoring
// -------------------------------------------------------------
{
  const g = new GoEngine(9, 6.5);
  const score = g.calculateJapaneseScore();
  assert(score.black.territory === 0, "Empty board: Black territory is 0");
  assert(score.white.territory === 0, "Empty board: White territory is 0");
  assert(score.white.total === 6.5, "Empty board: White total equals Komi (6.5)");
  assert(score.winner === WHITE, "Empty board: White wins by 6.5 Komi");
}

// -------------------------------------------------------------
// Test 2: Two Kingdoms dividing the 9x9 board with neutral wall
// -------------------------------------------------------------
{
  const g = new GoEngine(9, 6.5);
  // Black occupies Row 3 across all columns 0..8
  // White occupies Row 5 across all columns 0..8
  // Row 4 is empty neutral dame (touches both Black and White)
  // Rows 0, 1, 2 = 3 * 9 = 27 empty points touching strictly Black!
  // Rows 6, 7, 8 = 3 * 9 = 27 empty points touching strictly White!
  for (let c = 0; c < 9; c++) {
    g.board[3][c] = BLACK;
    g.board[5][c] = WHITE;
  }

  const score = g.calculateJapaneseScore();
  assert(score.black.territory === 27, `Divided board: Black territory should be 27 (got ${score.black.territory})`);
  assert(score.white.territory === 27, `Divided board: White territory should be 27 (got ${score.white.territory})`);
  assert(score.black.total === 27, `Black total: 27 (got ${score.black.total})`);
  assert(score.white.total === 33.5, `White total: 27 + 6.5 = 33.5 (got ${score.white.total})`);
  assert(score.winner === WHITE, `White wins by 6.5 (got winner ${score.winner})`);
}

// -------------------------------------------------------------
// Test 3: Dead Stone Marking & Japanese Scoring Formula
// -------------------------------------------------------------
{
  const g = new GoEngine(9, 6.5);
  // Divide board again
  for (let c = 0; c < 9; c++) {
    g.board[3][c] = BLACK;
    g.board[5][c] = WHITE;
  }

  // Suppose White has an invading dead stone in Black territory at (1, 4)
  g.board[1][4] = WHITE;

  // Mark White stone as dead during scoring phase
  g.phase = 'scoring';
  g.toggleDeadStone(1, 4);

  // Black captured 3 prisoners during game
  g.captured[BLACK] = 3;
  // White captured 2 prisoners during game
  g.captured[WHITE] = 2;

  const score = g.calculateJapaneseScore();

  // With the white dead stone marked dead:
  // Black territory is restored to all 27 points!
  // Dead white stone counts as an extra prisoner (+1)
  // Black captured 3 prisoners
  // Black total = 27 (terr) + 3 (prisoners) + 1 (dead stone) = 31.
  assert(score.black.territory === 27, `Territory with dead stone: 27 (got ${score.black.territory})`);
  assert(score.black.prisoners === 3, `Black prisoners: 3 (got ${score.black.prisoners})`);
  assert(score.black.deadEnemyStones === 1, `Dead enemy stones: 1 (got ${score.black.deadEnemyStones})`);
  assert(score.black.total === 31, `Black total: 31 (got ${score.black.total})`);

  // White total = 27 (terr) + 2 (prisoners) + 0 (dead) + 6.5 (komi) = 35.5.
  assert(score.white.total === 35.5, `White total: 35.5 (got ${score.white.total})`);
  assert(score.winner === WHITE, "White wins by 4.5 pts");
  assert(score.margin === 4.5, `Margin is exactly 4.5 (got ${score.margin})`);
}

// -------------------------------------------------------------
// Test 4: Dame / Neutral Disputed Territory
// -------------------------------------------------------------
{
  const g = new GoEngine(9, 6.5);
  for (let c = 0; c < 9; c++) {
    g.board[3][c] = BLACK;
    g.board[5][c] = WHITE;
  }
  const score = g.calculateJapaneseScore();
  // Row 4 points should be neutral (EMPTY)
  for (let c = 0; c < 9; c++) {
    assert(score.territoryMap[4][c] === EMPTY, `Dame point at (4, ${c}) is neutral (not territory)`);
  }
}

console.log("\nALL JAPANESE SCORING UNIT TESTS PASSED PERFECTLY! 🎯");
