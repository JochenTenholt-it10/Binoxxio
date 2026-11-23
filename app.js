const APP_META = {
  author: 'it10',
  version: '2026.11'
};

const STORAGE_STATE_KEY = 'binoxxo_saved_state_v1';
const STORAGE_STATS_KEY = 'binoxxo_stats_v1';

const DIFFICULTY_RATIOS = {
  easy: 0.44,
  medium: 0.35,
  hard: 0.27
};

const DIFFICULTY_LABELS = {
  easy: 'Leicht',
  medium: 'Mittel',
  hard: 'Schwer'
};

let size = 6;
let difficulty = 'medium';
let solution = [];
let fixed = [];
let grid = [];
let historyStack = [];
let selectedCell = { r: 0, c: 0 };
let timerInterval = null;
let secondsElapsed = 0;
let gameSolved = false;
let hasMovedInCurrentGame = false;

// Service Worker für PWA-Installation registrieren
if ('serviceWorker' in navigator && (location.protocol === 'http:' || location.protocol === 'https:')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

function getStats() {
  try {
    const raw = localStorage.getItem(STORAGE_STATS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { played: 0, solved: 0, streak: 0, bestTimes: {} };
}

function saveStats(stats) {
  localStorage.setItem(STORAGE_STATS_KEY, JSON.stringify(stats));
}

function saveGameState() {
  const state = {
    size,
    difficulty,
    solution,
    fixed,
    grid,
    historyStack,
    secondsElapsed,
    gameSolved,
    hasMovedInCurrentGame
  };
  localStorage.setItem(STORAGE_STATE_KEY, JSON.stringify(state));
}

function loadGameState() {
  try {
    const raw = localStorage.getItem(STORAGE_STATE_KEY);
    if (!raw) return false;
    const state = JSON.parse(raw);
    if (!state || !state.grid || !state.solution) return false;

    size = state.size || 6;
    difficulty = state.difficulty || 'medium';
    solution = state.solution;
    fixed = state.fixed;
    grid = state.grid;
    historyStack = state.historyStack || [];
    secondsElapsed = state.secondsElapsed || 0;
    gameSolved = !!state.gameSolved;
    hasMovedInCurrentGame = !!state.hasMovedInCurrentGame;
    selectedCell = { r: 0, c: 0 };

    document.getElementById('sizeSelect').value = String(size);
    document.getElementById('diffSelect').value = difficulty;

    updateUndoButton();
    loadBestTime();
    updateTimerDisplay();
    updatePrintMeta();
    renderBoard();

    if (gameSolved) {
      setStatus(`🎉 Gelöst in ${formatTime(secondsElapsed)}! Starte ein neues Rätsel.`, 'status-ok');
    } else {
      startTimer(true);
      checkBoard(false);
    }
    return true;
  } catch (e) {
    return false;
  }
}

// Dark Mode
if (localStorage.getItem('binoxxo_dark') === 'true') {
  document.body.classList.add('dark');
  document.getElementById('themeBtn').textContent = '☀️ Light';
}

function toggleTheme() {
  const isDark = document.body.classList.toggle('dark');
  localStorage.setItem('binoxxo_dark', isDark);
  document.getElementById('themeBtn').textContent = isDark ? '☀️ Light' : '🌙 Dark';
}

// Druckfunktion
function updatePrintMeta() {
  const el = document.getElementById('printMeta');
  if (!el) return;
  const dateStr = new Date().toLocaleDateString('de-DE');
  const diffLabel = DIFFICULTY_LABELS[difficulty] || difficulty;
  el.textContent = `Spielfeld: ${size} × ${size} | Schwierigkeit: ${diffLabel} | Datum: ${dateStr}`;
}

function printPuzzle() {
  updatePrintMeta();
  window.print();
}

window.addEventListener('beforeprint', updatePrintMeta);

// Timer
function startTimer(resume = false) {
  stopTimer();
  if (!resume) secondsElapsed = 0;
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    secondsElapsed++;
    updateTimerDisplay();
    saveGameState();
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function formatTime(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function updateTimerDisplay() {
  document.getElementById('timerDisplay').textContent = formatTime(secondsElapsed);
}

function getBestKey(s = size, d = difficulty) {
  return `${s}_${d}`;
}

function loadBestTime() {
  const stats = getStats();
  const best = stats.bestTimes[getBestKey()];
  document.getElementById('bestTimeDisplay').textContent = best !== undefined ? formatTime(best) : '--:--';
}

function recordGameWin() {
  const stats = getStats();
  stats.solved += 1;
  stats.streak += 1;

  const key = getBestKey();
  const prevBest = stats.bestTimes[key];
  let isNewRecord = false;
  if (prevBest === undefined || secondsElapsed < prevBest) {
    stats.bestTimes[key] = secondsElapsed;
    isNewRecord = true;
  }
  saveStats(stats);
  loadBestTime();
  return isNewRecord;
}

function registerStartedGame() {
  if (!hasMovedInCurrentGame) {
    hasMovedInCurrentGame = true;
    const stats = getStats();
    stats.played += 1;
    saveStats(stats);
  }
}

function startNewGameConfirmed() {
  if (!gameSolved && hasMovedInCurrentGame) {
    const stats = getStats();
    stats.streak = 0;
    saveStats(stats);
  }
  newGame();
}

function newGame() {
  size = parseInt(document.getElementById('sizeSelect').value, 10);
  difficulty = document.getElementById('diffSelect').value;
  solution = generateValidBoard(size);
  grid = Array.from({ length: size }, () => Array(size).fill(''));
  fixed = Array.from({ length: size }, () => Array(size).fill(false));
  historyStack = [];
  selectedCell = { r: 0, c: 0 };
  gameSolved = false;
  hasMovedInCurrentGame = false;

  const ratio = DIFFICULTY_RATIOS[difficulty] || 0.35;
  const revealCount = Math.floor(size * size * ratio);
  let placed = 0;
  while (placed < revealCount) {
    const r = Math.floor(Math.random() * size);
    const c = Math.floor(Math.random() * size);
    if (!fixed[r][c]) {
      fixed[r][c] = true;
      grid[r][c] = solution[r][c];
      placed++;
    }
  }

  updateUndoButton();
  loadBestTime();
  updatePrintMeta();
  startTimer(false);
  setStatus('', '');
  renderBoard();
  saveGameState();
}

function resetBoard() {
  if (gameSolved) return;
  let changed = false;
  const snapshot = grid.map(row => [...row]);

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!fixed[r][c] && grid[r][c] !== '') {
        grid[r][c] = '';
        changed = true;
      }
    }
  }

  if (changed) {
    historyStack.push(snapshot);
    updateUndoButton();
    saveGameState();
  }
  setStatus('', '');
  renderBoard();
}

function pushHistory() {
  historyStack.push(grid.map(row => [...row]));
  updateUndoButton();
}

function undoMove() {
  if (gameSolved || historyStack.length === 0) return;
  grid = historyStack.pop();
  updateUndoButton();
  renderBoard();
  checkBoard(false);
  saveGameState();
}

function updateUndoButton() {
  document.getElementById('undoBtn').disabled = historyStack.length === 0 || gameSolved;
}

function giveHint() {
  if (gameSolved) return;
  const candidates = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!fixed[r][c] && grid[r][c] !== solution[r][c]) {
        candidates.push([r, c]);
      }
    }
  }

  if (candidates.length === 0) return;

  registerStartedGame();
  pushHistory();
  const [r, c] = candidates[Math.floor(Math.random() * candidates.length)];
  grid[r][c] = solution[r][c];
  fixed[r][c] = true;
  selectedCell = { r, c };
  renderBoard();

  const cellEl = document.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
  if (cellEl) {
    cellEl.classList.add('hint-flash');
    setTimeout(() => cellEl.classList.remove('hint-flash'), 900);
  }

  checkBoard(false);
  saveGameState();
}

function generateValidBoard(n) {
  const board = Array.from({ length: n }, () => Array(n).fill(''));
  const half = n / 2;

  function isValidStep(r, c, val) {
    if (c >= 2 && board[r][c - 1] === val && board[r][c - 2] === val) return false;
    if (r >= 2 && board[r - 1][c] === val && board[r - 2][c] === val) return false;

    let rowCount = 1;
    for (let j = 0; j < c; j++) if (board[r][j] === val) rowCount++;
    if (rowCount > half) return false;

    let colCount = 1;
    for (let i = 0; i < r; i++) if (board[i][c] === val) colCount++;
    if (colCount > half) return false;

    if (c === n - 1) {
      const currentRow = board[r].slice(0, c).concat(val).join('');
      for (let i = 0; i < r; i++) {
        if (board[i].join('') === currentRow) return false;
      }
    }

    if (r === n - 1) {
      let currentCol = '';
      for (let i = 0; i < r; i++) currentCol += board[i][c];
      currentCol += val;
      for (let j = 0; j < c; j++) {
        let otherCol = '';
        for (let i = 0; i < n; i++) otherCol += board[i][j];
        if (otherCol === currentCol) return false;
      }
    }
    return true;
  }

  function solve(pos) {
    if (pos === n * n) return true;
    const r = Math.floor(pos / n);
    const c = pos % n;
    const choices = Math.random() < 0.5 ? ['X', 'O'] : ['O', 'X'];

    for (const val of choices) {
      if (isValidStep(r, c, val)) {
        board[r][c] = val;
        if (solve(pos + 1)) return true;
        board[r][c] = '';
      }
    }
    return false;
  }

  solve(0);
  return board;
}

function createCounterCell(remX, remO) {
  const el = document.createElement('div');
  el.className = 'counter-cell';

  const spanX = document.createElement('span');
  spanX.className = 'cnt-x' + (remX === 0 ? ' cnt-done' : remX < 0 ? ' cnt-over' : '');
  spanX.textContent = `X:${remX}`;

  const spanO = document.createElement('span');
  spanO.className = 'cnt-o' + (remO === 0 ? ' cnt-done' : remO < 0 ? ' cnt-over' : '');
  spanO.textContent = `O:${remO}`;

  el.appendChild(spanX);
  el.appendChild(spanO);
  return el;
}

function renderBoard() {
  const boardEl = document.getElementById('board');
  boardEl.style.gridTemplateColumns = `repeat(${size}, 1fr) 0.85fr`;
  boardEl.innerHTML = '';
  const half = size / 2;

  for (let r = 0; r < size; r++) {
    let rowX = 0, rowO = 0;

    for (let c = 0; c < size; c++) {
      const val = grid[r][c];
      if (val === 'X') rowX++;
      if (val === 'O') rowO++;

      const cell = document.createElement('div');
      const isSelected = selectedCell.r === r && selectedCell.c === c && !gameSolved;
      cell.className = 'cell' + (fixed[r][c] ? ' fixed' : '') + (isSelected ? ' selected' : '');
      cell.dataset.r = r;
      cell.dataset.c = c;
      cell.dataset.val = val;
      cell.textContent = val;

      cell.addEventListener('click', () => {
        selectedCell = { r, c };
        if (!fixed[r][c] && !gameSolved) {
          toggleCell(r, c);
        } else {
          renderBoard();
          checkBoard(false);
        }
      });

      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        selectedCell = { r, c };
        if (!fixed[r][c] && !gameSolved) {
          toggleCell(r, c, true);
        }
      });

      boardEl.appendChild(cell);
    }

    boardEl.appendChild(createCounterCell(half - rowX, half - rowO));
  }

  for (let c = 0; c < size; c++) {
    let colX = 0, colO = 0;
    for (let r = 0; r < size; r++) {
      if (grid[r][c] === 'X') colX++;
      if (grid[r][c] === 'O') colO++;
    }
    boardEl.appendChild(createCounterCell(half - colX, half - colO));
  }

  const corner = document.createElement('div');
  corner.className = 'counter-cell counter-corner';
  boardEl.appendChild(corner);
}

function setCellValue(r, c, newVal) {
  if (gameSolved || fixed[r][c]) return;
  if (grid[r][c] === newVal) return;
  registerStartedGame();
  pushHistory();
  grid[r][c] = newVal;
  renderBoard();
  checkBoard(false);
  saveGameState();
}

function toggleCell(r, c, reverse = false) {
  if (gameSolved || fixed[r][c]) return;
  const order = ['', 'X', 'O'];
  let idx = order.indexOf(grid[r][c]);
  idx = reverse ? (idx + 2) % 3 : (idx + 1) % 3;
  setCellValue(r, c, order[idx]);
}

document.addEventListener('keydown', (e) => {
  if (document.getElementById('statsModal').classList.contains('open')) {
    if (e.key === 'Escape') closeStatsModal();
    return;
  }
  if (e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON') return;

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undoMove();
    return;
  }

  if (gameSolved) return;

  const { r, c } = selectedCell;
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedCell.r = (r - 1 + size) % size;
    renderBoard();
    checkBoard(false);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedCell.r = (r + 1) % size;
    renderBoard();
    checkBoard(false);
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    selectedCell.c = (c - 1 + size) % size;
    renderBoard();
    checkBoard(false);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    selectedCell.c = (c + 1) % size;
    renderBoard();
    checkBoard(false);
  } else if (e.key.toLowerCase() === 'x') {
    setCellValue(r, c, grid[r][c] === 'X' ? '' : 'X');
  } else if (e.key.toLowerCase() === 'o' || e.key === '0') {
    setCellValue(r, c, grid[r][c] === 'O' ? '' : 'O');
  } else if (e.key === 'Backspace' || e.key === 'Delete') {
    setCellValue(r, c, '');
  } else if (e.key === ' ') {
    e.preventDefault();
    toggleCell(r, c);
  }
});

function checkBoard(manual) {
  const cells = document.querySelectorAll('.cell');
  cells.forEach(cell => cell.classList.remove('error'));

  const errors = new Set();
  const half = size / 2;
  let emptyCount = 0;

  for (let r = 0; r < size; r++) {
    let xCount = 0, oCount = 0;
    for (let c = 0; c < size; c++) {
      const v = grid[r][c];
      if (!v) { emptyCount++; continue; }
      if (v === 'X') xCount++; else oCount++;

      if (c <= size - 3 && v === grid[r][c + 1] && v === grid[r][c + 2]) {
        errors.add(`${r},${c}`);
        errors.add(`${r},${c + 1}`);
        errors.add(`${r},${c + 2}`);
      }
    }
    if (xCount > half || oCount > half) {
      for (let c = 0; c < size; c++) errors.add(`${r},${c}`);
    }
  }

  for (let c = 0; c < size; c++) {
    let xCount = 0, oCount = 0;
    for (let r = 0; r < size; r++) {
      const v = grid[r][c];
      if (!v) continue;
      if (v === 'X') xCount++; else oCount++;

      if (r <= size - 3 && v === grid[r + 1][c] && v === grid[r + 2][c]) {
        errors.add(`${r},${c}`);
        errors.add(`${r + 1},${c}`);
        errors.add(`${r + 2},${c}`);
      }
    }
    if (xCount > half || oCount > half) {
      for (let r = 0; r < size; r++) errors.add(`${r},${c}`);
    }
  }

  const rowMap = {};
  for (let r = 0; r < size; r++) {
    if (!grid[r].includes('')) {
      const key = grid[r].join('');
      if (rowMap[key] !== undefined) {
        for (let c = 0; c < size; c++) {
          errors.add(`${r},${c}`);
          errors.add(`${rowMap[key]},${c}`);
        }
      } else {
        rowMap[key] = r;
      }
    }
  }

  const colMap = {};
  for (let c = 0; c < size; c++) {
    let colStr = '';
    for (let r = 0; r < size; r++) colStr += grid[r][c];
    if (colStr.length === size) {
      if (colMap[colStr] !== undefined) {
        for (let r = 0; r < size; r++) {
          errors.add(`${r},${c}`);
          errors.add(`${r},${colMap[colStr]}`);
        }
      } else {
        colMap[colStr] = c;
      }
    }
  }

  errors.forEach(coord => {
    const [r, c] = coord.split(',');
    const el = document.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
    if (el) el.classList.add('error');
  });

  if (errors.size > 0) {
    setStatus('Regelverstoß entdeckt (rot markiert).', 'status-err');
  } else if (emptyCount === 0 && !gameSolved) {
    gameSolved = true;
    stopTimer();
    updateUndoButton();
    const isNewRecord = recordGameWin();
    saveGameState();
    renderBoard();
    setStatus(
      isNewRecord
        ? `🎉 Neue Bestzeit (${formatTime(secondsElapsed)})! Rätsel gelöst!`
        : `🎉 Glückwunsch! Gelöst in ${formatTime(secondsElapsed)}.`,
      'status-ok'
    );
  } else if (manual && !gameSolved) {
    setStatus(`Bisher alles richtig! Noch ${emptyCount} freie Felder.`, 'status-ok');
  } else if (!gameSolved) {
    setStatus('', '');
  }
}

function setStatus(msg, cls) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = cls;
}

function openStatsModal() {
  const stats = getStats();
  document.getElementById('stPlayed').textContent = stats.played;
  document.getElementById('stSolved').textContent = stats.solved;
  document.getElementById('stStreak').textContent = stats.streak;

  const tbody = document.getElementById('bestTimesBody');
  tbody.innerHTML = '';
  for (const s of [6, 8, 10]) {
    const tr = document.createElement('tr');
    const easy = stats.bestTimes[`${s}_easy`];
    const med = stats.bestTimes[`${s}_medium`];
    const hard = stats.bestTimes[`${s}_hard`];
    tr.innerHTML = `
      <td><strong>${s} × ${s}</strong></td>
      <td>${easy !== undefined ? formatTime(easy) : '--:--'}</td>
      <td>${med !== undefined ? formatTime(med) : '--:--'}</td>
      <td>${hard !== undefined ? formatTime(hard) : '--:--'}</td>
    `;
    tbody.appendChild(tr);
  }

  document.getElementById('statsModal').classList.add('open');
}

function closeStatsModal() {
  document.getElementById('statsModal').classList.remove('open');
}

function clearStats() {
  localStorage.removeItem(STORAGE_STATS_KEY);
  loadBestTime();
  openStatsModal();
}

if (!loadGameState()) {
  newGame();
}
