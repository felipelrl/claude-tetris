'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#f06292', // + (Plus) pentomino - pink
  '#4db6ac', // U pentomino - teal
  '#7986cb', // Y pentomino - indigo
  '#ffffff', // single (1x1) - recompensa tras un Tetris
  '#ff8a65', // 3x3 hueca - reto
];

// ---- Skins visuales (selector independiente del toggle claro/oscuro) ----
// Cada skin define su propia paleta de colores (mismos índices que COLORS/PIECES)
// y su bandera de estilo de dibujo (glow neón, esquinas redondeadas, textura pixel-art).
const SKIN_STORAGE_KEY = 'tetris-skin';
const SKINS = {
  retro: {
    label: 'Retro',
    colors: COLORS, // aspecto original — este es el skin por defecto
  },
  neon: {
    label: 'Neon',
    colors: [
      null,
      '#00e5ff', '#ffea00', '#e040fb', '#00e676', '#ff1744',
      '#2979ff', '#ff9100', '#f50057', '#1de9b6', '#651fff',
      '#ffffff', '#ff6e40',
    ],
  },
  pastel: {
    label: 'Pastel',
    colors: [
      null,
      '#b2ebf2', '#fff9c4', '#e1bee7', '#c8e6c9', '#ffcdd2',
      '#bbdefb', '#ffe0b2', '#f8bbd0', '#b2dfdb', '#c5cae9',
      '#fffde7', '#ffccbc',
    ],
  },
  pixel: {
    label: 'Pixel Art',
    colors: COLORS, // misma paleta base; la textura la distingue visualmente
  },
};
let currentSkin = 'retro';

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[0,8,0],[8,8,8],[0,8,0]],                  // + pentomino
  [[9,0,9],[9,9,9]],                          // U pentomino
  [[0,10],[10,10],[0,10],[0,10]],             // Y pentomino
  [[11]],                                     // single (1x1) - recompensa
  [[12,12,12],[12,0,12],[12,12,12]],          // 3x3 hueca - reto
];

const STANDARD_TYPE_COUNT = 7;
const PENTOMINO_TYPES = [8, 9, 10]; // +, U, Y
const PENTOMINO_CHANCE = 0.12; // aparición ocasional
const CHALLENGE_TYPE = 12; // pieza 3x3 hueca
const CHALLENGE_CHANCE = 0.05; // aparición ocasional como reto
const REWARD_TYPE = 11; // pieza única 1x1, recompensa tras un Tetris

const LINE_SCORES = [0, 100, 300, 500, 800];

const WILDCARD = -1; // valor de celda para "comodín"; fuera del rango de índices de PIECES/COLORS para no colisionar con ningún tipo de pieza
const SPECIAL_LINE_INTERVAL = 5; // cada N líneas eliminadas, la próxima pieza generada es especial
const SPECIAL_TYPES = ['bomb', 'rayo', 'tinte', 'gravedad', 'congelar'];
const SPECIAL_INFO = {
  bomb: { color: '#ff5252', symbol: '💣' },
  rayo: { color: '#fff176', symbol: '⚡' },
  tinte: { color: '#f06292', symbol: '🎨' },
  gravedad: { color: '#a1887f', symbol: '⬇' },
  congelar: { color: '#4dd0e1', symbol: '❄' },
};

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeSwitch = document.getElementById('theme-switch');
const skinSelect = document.getElementById('skin-select');

const THEME_STORAGE_KEY = 'tetris-theme';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, rewardPending;
let pendingSpecial, freezeUntil;

function gridLineColor() {
  return getComputedStyle(document.body).getPropertyValue('--grid-line').trim();
}

function applyTheme(theme) {
  document.body.classList.toggle('light-theme', theme === 'light');
  themeSwitch.checked = theme === 'light';
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

function initTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  applyTheme(stored === 'light' ? 'light' : 'dark');
  themeSwitch.addEventListener('change', () => {
    applyTheme(themeSwitch.checked ? 'light' : 'dark');
  });
}

function applySkin(skin) {
  if (!SKINS[skin]) skin = 'retro';
  currentSkin = skin;
  Object.keys(SKINS).forEach(name => document.body.classList.remove(`skin-${name}`));
  document.body.classList.add(`skin-${skin}`);
  if (skinSelect) skinSelect.value = skin;
  localStorage.setItem(SKIN_STORAGE_KEY, skin);
  // Redibuja en caliente si el juego ya arrancó (sin recargar la página).
  if (board) draw();
  if (next) drawNext();
}

function initSkin() {
  const stored = localStorage.getItem(SKIN_STORAGE_KEY);
  applySkin(SKINS[stored] ? stored : 'retro');
  skinSelect.addEventListener('change', () => applySkin(skinSelect.value));
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function pieceFromType(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPiece(special) {
  if (special) {
    const kind = SPECIAL_TYPES[Math.floor(Math.random() * SPECIAL_TYPES.length)];
    return { special: kind, shape: [[1]], x: Math.floor(COLS / 2), y: 0 };
  }
  const roll = Math.random();
  let type;
  if (roll < CHALLENGE_CHANCE) {
    type = CHALLENGE_TYPE;
  } else if (roll < CHALLENGE_CHANCE + PENTOMINO_CHANCE) {
    type = PENTOMINO_TYPES[Math.floor(Math.random() * PENTOMINO_TYPES.length)];
  } else {
    type = Math.floor(Math.random() * STANDARD_TYPE_COUNT) + 1;
  }
  return pieceFromType(type);
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    const before = lines;
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    if (cleared === 4) rewardPending = true;
    if (Math.floor(lines / SPECIAL_LINE_INTERVAL) > Math.floor(before / SPECIAL_LINE_INTERVAL)) {
      pendingSpecial = true;
    }
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  if (current.special) {
    applySpecialEffect(current.special, current.x, current.y);
  } else {
    merge();
  }
  clearLines();
  spawn();
}

function applyBomb(cx, cy) {
  for (let r = cy - 1; r <= cy + 1; r++)
    for (let c = cx - 1; c <= cx + 1; c++)
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) board[r][c] = 0;
}

function applyRayo(cx, cy) {
  if (cy >= 0 && cy < ROWS) board[cy].fill(0);
  if (cx >= 0 && cx < COLS) for (let r = 0; r < ROWS; r++) board[r][cx] = 0;
}

function applyTinte() {
  const present = new Set();
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c] && board[r][c] !== WILDCARD) present.add(board[r][c]);
  if (!present.size) return;
  const colors = [...present];
  const target = colors[Math.floor(Math.random() * colors.length)];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c] === target) board[r][c] = WILDCARD;
}

function applyGravedad() {
  for (let c = 0; c < COLS; c++) {
    const vals = [];
    for (let r = 0; r < ROWS; r++) if (board[r][c]) vals.push(board[r][c]);
    const startRow = ROWS - vals.length;
    for (let r = 0; r < ROWS; r++) board[r][c] = r >= startRow ? vals[r - startRow] : 0;
  }
}

function applyCongelar() {
  freezeUntil = performance.now() + 5000;
}

const SPECIAL_EFFECTS = {
  bomb: applyBomb,
  rayo: applyRayo,
  tinte: applyTinte,
  gravedad: applyGravedad,
  congelar: applyCongelar,
};

function applySpecialEffect(type, cx, cy) {
  SPECIAL_EFFECTS[type](cx, cy);
  score += 50;
  updateHUD();
}

function spawn() {
  current = next;
  if (rewardPending) {
    next = pieceFromType(REWARD_TYPE);
  } else if (pendingSpecial) {
    next = randomPiece(true);
  } else {
    next = randomPiece();
  }
  rewardPending = false;
  pendingSpecial = false;
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

// Traza un rectángulo de esquinas redondeadas (skin Pastel) sin depender de
// ctx.roundRect, que no está disponible en todos los navegadores.
function pathRoundedRect(context, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + w, y, x + w, y + h, radius);
  context.arcTo(x + w, y + h, x, y + h, radius);
  context.arcTo(x, y + h, x, y, radius);
  context.arcTo(x, y, x + w, y, radius);
  context.closePath();
}

// Cache de la textura "pixel art" por tamaño de bloque: se dibuja una sola vez
// en un canvas fuera de pantalla y se reutiliza en cada frame (evita repetir
// decenas de fillRect por bloque en cada tick del loop de animación).
const pixelTextureCache = new Map();
function getPixelTexture(size) {
  let tex = pixelTextureCache.get(size);
  if (tex) return tex;
  const cell = Math.max(3, Math.floor(size / 6));
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const octx = off.getContext('2d');
  octx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let row = 0; row * cell < size; row++) {
    for (let col = 0; col * cell < size; col++) {
      if ((row + col) % 2 === 0) {
        octx.fillRect(col * cell, row * cell, cell, cell);
      }
    }
  }
  tex = off;
  pixelTextureCache.set(size, tex);
  return tex;
}

// Dibuja el patrón de textura tipo "pixel art" (mosaico oscuro) sobre el bloque.
function drawPixelTexture(context, x, y, size) {
  context.drawImage(getPixelTexture(size), x, y);
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const isWildcard = colorIndex === WILDCARD;
  const skin = SKINS[currentSkin] || SKINS.retro;
  const color = isWildcard ? '#fff8e1' : skin.colors[colorIndex];
  const px = x * size + 1;
  const py = y * size + 1;
  const s = size - 2;
  const highlight = isWildcard ? 'rgba(255,215,0,0.35)' : 'rgba(255,255,255,0.12)';

  context.save();
  context.globalAlpha = alpha ?? 1;

  if (currentSkin === 'neon') {
    context.shadowColor = color;
    context.shadowBlur = size * 0.4;
    context.fillStyle = color;
    context.fillRect(px, py, s, s);
    context.shadowBlur = 0;
    context.fillStyle = isWildcard ? highlight : 'rgba(255,255,255,0.3)';
    context.fillRect(px, py, s, 3);
  } else if (currentSkin === 'pastel') {
    const r = Math.min(8, s / 3);
    pathRoundedRect(context, px, py, s, s, r);
    context.fillStyle = color;
    context.fill();
    pathRoundedRect(context, px, py, s, s * 0.4, r);
    context.fillStyle = isWildcard ? highlight : 'rgba(255,255,255,0.45)';
    context.fill();
  } else if (currentSkin === 'pixel') {
    context.fillStyle = color;
    context.fillRect(px, py, s, s);
    drawPixelTexture(context, px, py, s);
    context.fillStyle = highlight;
    context.fillRect(px, py, s, 4);
  } else {
    // retro (skin por defecto, idéntico al aspecto original)
    context.fillStyle = color;
    context.fillRect(px, py, s, s);
    context.fillStyle = highlight;
    context.fillRect(px, py, s, 4);
  }

  context.restore();
}

function drawSpecialBlock(context, x, y, type, size, alpha) {
  const info = SPECIAL_INFO[type];
  const px = x * size + 1;
  const py = y * size + 1;
  const s = size - 2;

  context.save();
  context.globalAlpha = alpha ?? 1;

  if (currentSkin === 'neon') {
    context.shadowColor = info.color;
    context.shadowBlur = size * 0.45;
    context.fillStyle = info.color;
    context.fillRect(px, py, s, s);
    context.shadowBlur = 0;
  } else if (currentSkin === 'pastel') {
    const r = Math.min(8, s / 3);
    pathRoundedRect(context, px, py, s, s, r);
    context.fillStyle = info.color;
    context.fill();
  } else if (currentSkin === 'pixel') {
    context.fillStyle = info.color;
    context.fillRect(px, py, s, s);
    drawPixelTexture(context, px, py, s);
  } else {
    context.fillStyle = info.color;
    context.fillRect(px, py, s, s);
  }

  context.fillStyle = '#1a1a1a';
  context.font = `${Math.floor(size * 0.6)}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(info.symbol, x * size + size / 2, y * size + size / 2 + 1);
  context.restore();
}

function drawGrid() {
  ctx.strokeStyle = gridLineColor();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost + current piece
  const gy = ghostY();
  if (current.special) {
    drawSpecialBlock(ctx, current.x, gy, current.special, BLOCK, 0.35);
    drawSpecialBlock(ctx, current.x, current.y, current.special, BLOCK);
  } else {
    for (let r = 0; r < current.shape.length; r++)
      for (let c = 0; c < current.shape[r].length; c++)
        if (current.shape[r][c])
          drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

    for (let r = 0; r < current.shape.length; r++)
      for (let c = 0; c < current.shape[r].length; c++)
        drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
  }

  if (performance.now() < freezeUntil) {
    ctx.save();
    ctx.fillStyle = 'rgba(128,222,234,0.9)';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('CONGELADO', canvas.width / 2, 20);
    ctx.restore();
  }
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (next.special) {
    drawSpecialBlock(nextCtx, 1, 1, next.special, NB);
    return;
  }
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  if (performance.now() >= freezeUntil) {
    dropAccum += dt;
    if (dropAccum >= dropInterval) {
      dropAccum = 0;
      if (!collide(current.shape, current.x, current.y + 1)) {
        current.y++;
      } else {
        lockPiece();
      }
    }
  }
  if (gameOver) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  rewardPending = false;
  pendingSpecial = false;
  freezeUntil = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

initTheme();
init();
initSkin();
