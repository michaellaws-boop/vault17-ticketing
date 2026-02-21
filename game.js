// ============================================================
//  CAPYBARA RUN! – Dark Jungle Edition  v3.0
//  by TobWan Gaming
//
//  Capybara design inspired by: chubby, cream-furred,
//  wide flat snout, hair tufts, gentle smile — bipedal,
//  carrying a classic revolver.
//
//  Background: parallax dark cartoon jungle, moonlit sky,
//  glowing mushrooms, foreground tropical leaves.
// ============================================================

// ── Canvas ───────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
canvas.width  = 900;
canvas.height = 500;

function resizeCanvas() {
  const w = Math.min(window.innerWidth - 32, 900);
  canvas.style.width  = w + 'px';
  canvas.style.height = Math.round(w * 500 / 900) + 'px';
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ── Constants ────────────────────────────────────────────────
const GROUND   = 432;
const GRAVITY  = 0.70;
const JUMP_VEL = -13;
const BASE_SPD = 5;
const CAPY_W   = 58;
const CAPY_H   = 84;

// ── Audio (Web Audio API) ────────────────────────────────────
let audioCtx = null;
function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function tone(sf, ef, type, dur, vol) {
  try {
    const ac = getAudio(), osc = ac.createOscillator(), g = ac.createGain();
    osc.connect(g); g.connect(ac.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(sf, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(ef, ac.currentTime + dur);
    g.gain.setValueAtTime(vol, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    osc.start(); osc.stop(ac.currentTime + dur + 0.01);
  } catch (e) {}
}
function noise(dur, vol) {
  try {
    const ac = getAudio();
    const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(), g = ac.createGain();
    src.buffer = buf; src.connect(g); g.connect(ac.destination);
    g.gain.setValueAtTime(vol, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    src.start();
  } catch (e) {}
}
function sfx(name) {
  switch (name) {
    case 'jump':      tone(200, 420, 'sine',     0.22, 0.28); break;
    case 'dbljump':   tone(320, 640, 'sine',     0.18, 0.22); break;
    case 'shoot':     tone(900, 180, 'sawtooth', 0.10, 0.35); break;
    case 'hit':       noise(0.22, 0.45); tone(140, 40, 'square', 0.20, 0.28); break;
    case 'land':      tone(100,  60,  'sine',    0.09, 0.18); break;
    case 'gameover':  tone(400,  80,  'sawtooth',0.45, 0.38); break;
    case 'milestone': tone(600, 900,  'sine',    0.18, 0.25); break;
  }
}

// ── Game State ───────────────────────────────────────────────
let state = 'start', score = 0, highScore = 0;
let speed = BASE_SPD, frame = 0, bgX = 0;
let nextObstacleIn = 90, nextPlatformIn = 240;
let lastMilestone = 0, shootCooldown = 0;

// ── Capybara ─────────────────────────────────────────────────
const capy = {
  x: 120, y: GROUND - CAPY_H,
  w: CAPY_W, h: CAPY_H,
  vy: 0, grounded: true, jumpsLeft: 2,
  legPhase: 0, blinkIn: 130, blinking: false,
};

// ── World Objects ────────────────────────────────────────────
let obstacles = [], platforms = [], bullets = [], particles = [], clouds = [];

// ── Pre-generated background data (set once at init) ─────────
// Using separate let so we can fill in init()
let stars      = [];
let jungleLayers = [];
let mushrooms  = [];
let hairTufts  = [];

function rnd(a, b) { return a + Math.random() * (b - a); }

function initBackground() {
  // Stars
  stars = Array.from({ length: 65 }, () => ({
    x: rnd(0, canvas.width),
    y: rnd(0, 210),
    r: rnd(0.5, 2.0),
    phase: rnd(0, Math.PI * 2),
  }));

  // Jungle parallax layers — farthest to nearest
  const defs = [
    { parallax: 0.05, tileW: 540, n: 4,
      thMin: 115, thMax: 155, lrMin: 56, lrMax: 80,
      dark: '#0b1c0b', light: '#0e250e', trunk: '#07110a' },
    { parallax: 0.14, tileW: 430, n: 6,
      thMin: 85,  thMax: 118, lrMin: 42, lrMax: 62,
      dark: '#0f230f', light: '#142e14', trunk: '#0a170c' },
    { parallax: 0.30, tileW: 350, n: 8,
      thMin: 65,  thMax: 95,  lrMin: 34, lrMax: 52,
      dark: '#152e15', light: '#1c3d1c', trunk: '#0f200f' },
  ];
  jungleLayers = defs.map(d => ({
    ...d,
    trees: Array.from({ length: d.n }, (_, i) => ({
      x:      (d.tileW / d.n) * i + rnd(-12, 22),
      trunkH: rnd(d.thMin, d.thMax),
      leafR:  rnd(d.lrMin, d.lrMax),
    })),
  }));

  // Ground mushrooms
  mushrooms = Array.from({ length: 14 }, () => ({
    x:    rnd(0, canvas.width),
    size: rnd(3, 7),
    glow: rnd(0.5, 1.0),
  }));

  // Capybara hair tufts (pre-generated to avoid per-frame random)
  hairTufts = Array.from({ length: 7 }, (_, i) => ({
    dx:   -8 + i * 2.7,
    h:    rnd(5, 12),
    lean: rnd(-0.3, 0.3),
  }));
}

function initClouds() {
  clouds = Array.from({ length: 5 }, () => ({
    x: rnd(0, canvas.width), y: rnd(45, 140),
    r: rnd(28, 55), spd: rnd(0.25, 0.55),
    alpha: rnd(0.05, 0.13),
  }));
}

// ── Input ────────────────────────────────────────────────────
function doJump() {
  if (state !== 'playing') { startGame(); return; }
  if (capy.jumpsLeft > 0) {
    sfx(capy.grounded ? 'jump' : 'dbljump');
    capy.vy = JUMP_VEL; capy.grounded = false; capy.jumpsLeft--;
  }
}
function doShoot() {
  if (state !== 'playing' || shootCooldown > 0) return;
  sfx('shoot');
  // Barrel tip is ~38px right of capybara bounding box, at shoulder height
  bullets.push({ x: capy.x + capy.w + 38, y: capy.y + 52, w: 18, h: 7 });
  shootCooldown = 14;
}

document.addEventListener('keydown', e => {
  if (e.repeat) return;
  if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); doJump(); }
  if (e.code === 'KeyZ'  || e.code === 'KeyF')    { e.preventDefault(); doShoot(); }
});
canvas.addEventListener('pointerdown', e => {
  const rect = canvas.getBoundingClientRect();
  const cx = (e.clientX - rect.left) * (canvas.width  / rect.width);
  const cy = (e.clientY - rect.top)  * (canvas.height / rect.height);
  if (state !== 'playing') { doJump(); return; }
  (cx > canvas.width * 0.65 && cy > canvas.height * 0.5) ? doShoot() : doJump();
});

// ── Game Flow ────────────────────────────────────────────────
function startGame() {
  score = 0; speed = BASE_SPD; frame = 0; bgX = 0;
  nextObstacleIn = 90; nextPlatformIn = 240;
  lastMilestone = 0; shootCooldown = 0;
  obstacles = []; platforms = []; bullets = []; particles = [];
  capy.y = GROUND - capy.h; capy.vy = 0; capy.grounded = true; capy.jumpsLeft = 2;
  state = 'playing';
}
function endGame() {
  if (score > highScore) highScore = score;
  sfx('gameover'); state = 'over';
}

// ── Spawning ─────────────────────────────────────────────────
const OBS_DEFS = [
  { type: 'log',      w: 48,  h: 40 },
  { type: 'log',      w: 48,  h: 40 },
  { type: 'rock',     w: 50,  h: 58 },
  { type: 'rock',     w: 50,  h: 58 },
  { type: 'bigRock',  w: 64,  h: 76 },
  { type: 'twinLogs', w: 74,  h: 40 },
];
function spawnObstacle() {
  let def;
  do { def = OBS_DEFS[Math.floor(Math.random() * OBS_DEFS.length)]; }
  while (def.type === 'twinLogs' && score < 200);
  obstacles.push({ ...def, x: canvas.width + 20, y: GROUND - def.h });
}

const PLAT_HEIGHTS = [GROUND - 98, GROUND - 122, GROUND - 148];
function spawnPlatform() {
  const y = PLAT_HEIGHTS[Math.floor(Math.random() * PLAT_HEIGHTS.length)];
  const w = (rnd(115, 210) | 0);
  // Pre-generate vine positions so draw doesn't use random()
  const vines = [];
  for (let vx = 14; vx < w - 10; vx += (rnd(18, 34) | 0)) {
    vines.push({ x: vx, len: rnd(8, 20) | 0 });
  }
  platforms.push({ x: canvas.width + 20, y, w, h: 18, vines });
}

// ── Explosion Particles ───────────────────────────────────────
function burst(cx, cy) {
  const COLS = ['#FF6B35', '#F7C59F', '#FFD700', '#FF4500', '#ffffff'];
  for (let i = 0; i < 18; i++) {
    const a = Math.random() * Math.PI * 2, s = rnd(2, 6);
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2,
      r: rnd(3, 7), life: 1,
      color: COLS[Math.floor(Math.random() * COLS.length)],
    });
  }
}

// ── Update ───────────────────────────────────────────────────
function update() {
  frame++; bgX += speed;
  score = Math.floor(frame * speed / 28);
  speed = Math.min(BASE_SPD + Math.sqrt(score) * 0.26, 16);

  const milestone = Math.floor(score / 100);
  if (milestone > lastMilestone) { lastMilestone = milestone; sfx('milestone'); }
  if (shootCooldown > 0) shootCooldown--;

  // Physics
  const prevBottom = capy.y + capy.h;
  capy.vy += GRAVITY; capy.y += capy.vy;
  if (capy.grounded) capy.legPhase += speed * 0.11;

  // Blink
  capy.blinkIn--;
  if (capy.blinkIn <= 0) {
    capy.blinking = true;
    if (capy.blinkIn < -5) { capy.blinking = false; capy.blinkIn = 90 + Math.random() * 150; }
  }

  // Ground landing
  if (capy.y + capy.h >= GROUND) {
    const wasAir = !capy.grounded;
    capy.y = GROUND - capy.h; capy.vy = 0; capy.grounded = true; capy.jumpsLeft = 2;
    if (wasAir) sfx('land');
  } else {
    // Platform landing
    // Key logic: capybara was ABOVE platform, now at/below it → land.
    // When platform scrolls away, overlapX becomes false → capybara falls naturally.
    let onPlat = false;
    for (const p of platforms) {
      const overlapX = capy.x + 18 < p.x + p.w && capy.x + capy.w - 18 > p.x;
      if (overlapX && capy.vy >= 0 && prevBottom <= p.y + 3 && capy.y + capy.h >= p.y) {
        const wasAir = !capy.grounded;
        capy.y = p.y - capy.h; capy.vy = 0; capy.grounded = true; capy.jumpsLeft = 2;
        onPlat = true;
        if (wasAir) sfx('land');
        break;
      }
    }
    if (!onPlat) capy.grounded = false;
  }

  // Bullets
  bullets.forEach(b => { b.x += 15; });
  bullets = bullets.filter(b => b.x < canvas.width + 30);
  outer: for (let bi = bullets.length - 1; bi >= 0; bi--) {
    for (let oi = obstacles.length - 1; oi >= 0; oi--) {
      const b = bullets[bi], o = obstacles[oi];
      if (b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y) {
        burst(o.x + o.w / 2, o.y + o.h / 2);
        sfx('hit'); obstacles.splice(oi, 1); bullets.splice(bi, 1);
        break outer;
      }
    }
  }

  // Obstacles
  nextObstacleIn -= speed;
  if (nextObstacleIn <= 0) {
    spawnObstacle();
    nextObstacleIn = Math.max(130, 340 - score * 0.09) + Math.random() * 160;
  }
  obstacles.forEach(o => { o.x -= speed; });
  obstacles = obstacles.filter(o => o.x + o.w > -20);

  // Platforms
  nextPlatformIn -= speed;
  if (nextPlatformIn <= 0) { spawnPlatform(); nextPlatformIn = rnd(380, 660); }
  platforms.forEach(p => { p.x -= speed; });
  platforms = platforms.filter(p => p.x + p.w > -20);

  // Particles
  particles.forEach(p => {
    p.x += p.vx; p.y += p.vy; p.vy += 0.20; p.life -= 0.033; p.r *= 0.97;
  });
  particles = particles.filter(p => p.life > 0);

  // Clouds
  clouds.forEach(c => {
    c.x -= c.spd;
    if (c.x + c.r * 2 < 0) { c.x = canvas.width + c.r; c.y = rnd(45, 140); }
  });

  // Mushrooms scroll with world
  mushrooms.forEach(m => {
    m.x -= speed;
    if (m.x < -10) m.x = canvas.width + 10;
  });

  // Capybara ↔ obstacle collision (use a forgiving inner hitbox)
  const hx = capy.x + 10, hy = capy.y + 8;
  const hw = capy.w - 20, hh = capy.h - 14;
  for (const o of obstacles) {
    if (hx < o.x + o.w && hx + hw > o.x && hy < o.y + o.h && hy + hh > o.y) {
      endGame(); return;
    }
  }
}

// ── Draw Helpers ─────────────────────────────────────────────
function roundRect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x,     y + h, x,     y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x,     y,     x + r, y);
  ctx.closePath();
}

// ── Draw: Sky, Moon, Stars, Clouds ───────────────────────────
function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, GROUND);
  g.addColorStop(0,   '#040d18');
  g.addColorStop(0.5, '#071410');
  g.addColorStop(1,   '#091c0b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, GROUND);

  // Moon with warm glow
  ctx.save();
  ctx.shadowColor = '#c8e890'; ctx.shadowBlur = 55;
  ctx.fillStyle   = '#eeeac0';
  ctx.beginPath(); ctx.arc(canvas.width - 105, 65, 30, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  // Craters
  ctx.fillStyle = 'rgba(160,148,80,0.28)';
  ctx.beginPath(); ctx.arc(canvas.width - 94, 56, 7,  0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(canvas.width - 116, 70, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(canvas.width - 103, 78, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // Twinkling stars
  stars.forEach(s => {
    const a = 0.25 + 0.45 * Math.sin(frame * 0.022 + s.phase);
    ctx.fillStyle = `rgba(255,255,228,${a})`;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
  });

  // Moonlit wispy clouds
  clouds.forEach(({ x, y, r, alpha }) => {
    ctx.fillStyle = `rgba(170,200,150,${alpha})`;
    ctx.beginPath();
    ctx.arc(x,           y,           r,       0, Math.PI * 2);
    ctx.arc(x + r * 0.8, y - r * 0.2, r * 0.6, 0, Math.PI * 2);
    ctx.arc(x + r * 1.5, y + r * 0.1, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ── Draw: Jungle Parallax Layers ─────────────────────────────
function drawJungleTree(x, trunkH, leafR, dark, light, trunk) {
  const tw = Math.max(7, leafR * 0.17);
  ctx.fillStyle = trunk;
  roundRect(x - tw / 2, GROUND - trunkH - leafR * 0.3, tw, trunkH + leafR * 0.3, tw / 2);
  ctx.fill();
  // Main canopy blobs
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.arc(x,               GROUND - trunkH,              leafR,        0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x - leafR * 0.55, GROUND - trunkH + leafR * 0.2, leafR * 0.73, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + leafR * 0.50, GROUND - trunkH + leafR * 0.15, leafR * 0.68, 0, Math.PI * 2); ctx.fill();
  // Lighter crown
  ctx.fillStyle = light;
  ctx.beginPath(); ctx.arc(x - leafR * 0.1, GROUND - trunkH - leafR * 0.18, leafR * 0.5, 0, Math.PI * 2); ctx.fill();
}

function drawJungleLayers() {
  jungleLayers.forEach(layer => {
    const offset = -(bgX * layer.parallax % layer.tileW);
    for (let tx = offset - layer.tileW; tx < canvas.width + layer.tileW; tx += layer.tileW) {
      layer.trees.forEach(t => drawJungleTree(tx + t.x, t.trunkH, t.leafR, layer.dark, layer.light, layer.trunk));
    }
  });
}

// ── Draw: Ground ─────────────────────────────────────────────
function drawGround() {
  // Dark earth
  const g = ctx.createLinearGradient(0, GROUND, 0, canvas.height);
  g.addColorStop(0, '#190d07'); g.addColorStop(1, '#0c0805');
  ctx.fillStyle = g;
  ctx.fillRect(0, GROUND, canvas.width, canvas.height - GROUND);

  // Moss stripe
  ctx.fillStyle = '#1e4d0e'; ctx.fillRect(0, GROUND,     canvas.width, 10);
  ctx.fillStyle = '#2a6e16'; ctx.fillRect(0, GROUND,     canvas.width, 4);

  // Glowing bioluminescent mushrooms
  mushrooms.forEach(m => {
    ctx.save();
    ctx.shadowColor = '#4dff70'; ctx.shadowBlur = 14 * m.glow;
    ctx.fillStyle = '#81c784';
    ctx.fillRect(m.x - 1, GROUND - m.size * 2.5 + 3, 3, m.size * 2.5);
    ctx.fillStyle = '#a5d6a7';
    ctx.beginPath(); ctx.arc(m.x, GROUND - m.size * 2.5 + 3, m.size, Math.PI, 2 * Math.PI); ctx.fill();
    // Tiny dots on cap
    ctx.shadowBlur = 0; ctx.fillStyle = '#c8e6c9';
    ctx.beginPath(); ctx.arc(m.x - m.size * 0.3, GROUND - m.size * 2.5, m.size * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });
}

// ── Draw: Platforms (mossy stone) ────────────────────────────
function drawPlatform(p) {
  // Drop shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#2c2c22';
  roundRect(p.x, p.y, p.w, p.h, 6); ctx.fill();
  ctx.restore();

  // Stone body
  ctx.fillStyle = '#3a3a2e';
  roundRect(p.x + 2, p.y + 3, p.w - 4, p.h - 4, 4); ctx.fill();

  // Stone highlight
  ctx.fillStyle = '#48483a';
  roundRect(p.x + 4, p.y + 4, p.w - 14, p.h - 10, 3); ctx.fill();

  // Crack
  ctx.strokeStyle = '#20201a'; ctx.lineWidth = 1;
  const cx = p.x + p.w * 0.38;
  ctx.beginPath(); ctx.moveTo(cx, p.y + 6); ctx.lineTo(cx + 5, p.y + p.h - 4); ctx.stroke();

  // Moss on top
  ctx.fillStyle = '#234f10'; roundRect(p.x, p.y, p.w, 7, 4); ctx.fill();
  ctx.fillStyle = '#357218'; ctx.fillRect(p.x + 6, p.y, p.w - 12, 3);

  // Hanging vines (pre-generated positions)
  if (p.vines) {
    ctx.strokeStyle = '#2a5e12'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    p.vines.forEach(v => {
      ctx.beginPath();
      ctx.moveTo(p.x + v.x, p.y + p.h);
      ctx.lineTo(p.x + v.x + 2, p.y + p.h + v.len);
      ctx.stroke();
      // Tiny leaf at vine tip
      ctx.fillStyle = '#3a7a1e';
      ctx.beginPath(); ctx.ellipse(p.x + v.x + 2, p.y + p.h + v.len + 3, 4, 2, 0.4, 0, Math.PI * 2); ctx.fill();
    });
  }
}

// ── Draw: Revolver ────────────────────────────────────────────
// hx, hy = grip position (top-left of grip)
function drawRevolver(hx, hy) {
  ctx.save();

  // Grip (dark polished wood)
  const gGrad = ctx.createLinearGradient(hx, hy, hx + 11, hy + 19);
  gGrad.addColorStop(0, '#6d4c41'); gGrad.addColorStop(1, '#3e2723');
  ctx.fillStyle = gGrad;
  roundRect(hx, hy, 11, 20, 3); ctx.fill();
  ctx.strokeStyle = '#2e1a14'; ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(hx + 2, hy + 3 + i * 4); ctx.lineTo(hx + 9, hy + 3 + i * 4); ctx.stroke();
  }

  // Frame body (metal)
  const fGrad = ctx.createLinearGradient(hx + 4, hy - 5, hx + 4, hy + 11);
  fGrad.addColorStop(0, '#607d8b'); fGrad.addColorStop(1, '#37474f');
  ctx.fillStyle = fGrad;
  roundRect(hx + 4, hy - 6, 32, 14, 4); ctx.fill();

  // Cylinder (the iconic revolver feature — 6 chambers)
  const cGrad = ctx.createRadialGradient(hx + 14, hy + 1, 2, hx + 14, hy + 1, 10);
  cGrad.addColorStop(0, '#80969e'); cGrad.addColorStop(1, '#455a64');
  ctx.fillStyle = cGrad;
  ctx.beginPath(); ctx.arc(hx + 14, hy + 1, 10, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#263238'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(hx + 14, hy + 1, 10, 0, Math.PI * 2); ctx.stroke();
  // 6 chamber holes
  ctx.fillStyle = '#182028';
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI * 2 / 6) * i - Math.PI / 6;
    ctx.beginPath();
    ctx.arc(hx + 14 + Math.cos(a) * 5.8, hy + 1 + Math.sin(a) * 5.8, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Barrel (long, pointing right)
  ctx.fillStyle = '#455a64';
  roundRect(hx + 22, hy - 5, 26, 8, 2); ctx.fill();
  ctx.fillStyle = '#607d8b'; // highlight
  roundRect(hx + 23, hy - 4, 22, 2, 1); ctx.fill();
  ctx.fillStyle = '#37474f'; // muzzle end
  roundRect(hx + 45, hy - 4, 4, 6, 1); ctx.fill();

  // Hammer
  ctx.fillStyle = '#546e7a';
  roundRect(hx + 8, hy - 10, 8, 6, 2); ctx.fill();
  ctx.fillStyle = '#37474f';
  roundRect(hx + 12, hy - 12, 4, 4, 1); ctx.fill();

  // Trigger guard
  ctx.strokeStyle = '#37474f'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(hx + 13, hy + 17, 8, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();

  // Muzzle flash when shooting
  if (shootCooldown > 10) {
    ctx.save();
    ctx.shadowColor = '#ff9800'; ctx.shadowBlur = 24;
    // White core
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(hx + 50, hy - 1, 5, 0, Math.PI * 2); ctx.fill();
    // Orange star rays
    ctx.fillStyle = '#ffcc00';
    for (let i = 0; i < 7; i++) {
      const a = (Math.PI * 2 / 7) * i;
      ctx.beginPath();
      ctx.moveTo(hx + 50, hy - 1);
      ctx.lineTo(hx + 50 + Math.cos(a) * 10, hy - 1 + Math.sin(a) * 10);
      ctx.lineTo(hx + 50 + Math.cos(a + Math.PI / 7) * 5, hy - 1 + Math.sin(a + Math.PI / 7) * 5);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  ctx.restore();
}

// ── Draw: Capybara (bipedal, chubby, cream-furred) ────────────
function drawCapybara() {
  const { x, y, w, h, legPhase, grounded, blinking } = capy;
  const cx = x + w / 2;

  // Walk cycle
  const walk = grounded ? Math.sin(legPhase) : 0;
  // Gentle body bob
  const bob  = grounded ? Math.sin(legPhase * 2) * 1.8 : 0;

  // Vertical landmarks (measured from top of bounding box)
  const FOOT_Y  = y + h;
  const HIP_Y   = y + h - 20;
  const BODY_CY = y + h - 42;   // center of the big oval body
  const SHLDR_Y = y + h - 58;
  const HEAD_CY = y + 26;

  ctx.save();
  ctx.translate(0, bob);

  // ── BACK LEG ──────────────────────────────────────────────
  {
    const sw = -walk * 11;
    ctx.fillStyle = '#b89672';
    ctx.save();
    ctx.translate(cx - 10 + sw * 0.2, HIP_Y);
    ctx.rotate(sw * 0.045);
    roundRect(-6, 0, 13, 16, 5); ctx.fill();   // upper leg
    ctx.fillStyle = '#a07a58';
    roundRect(-6, 14, 14, 8, 4); ctx.fill();   // foot
    ctx.restore();
  }

  // ── BODY (big chubby oval — cream/golden fur) ──────────────
  // Drop shadow on ground
  ctx.fillStyle = 'rgba(0,0,0,0.20)';
  ctx.beginPath(); ctx.ellipse(cx + 3, FOOT_Y - 3, 24, 7, 0, 0, Math.PI * 2); ctx.fill();

  // Body fill with radial gradient for that fluffy 3D look
  const bodyGrad = ctx.createRadialGradient(cx - 8, BODY_CY - 10, 3, cx, BODY_CY, 32);
  bodyGrad.addColorStop(0, '#eedec0');
  bodyGrad.addColorStop(0.6, '#d4b690');
  bodyGrad.addColorStop(1,   '#c0986a');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath(); ctx.ellipse(cx, BODY_CY, 28, 32, 0, 0, Math.PI * 2); ctx.fill();

  // Lighter belly highlight (like the photo — creamy centre)
  const bellyGrad = ctx.createRadialGradient(cx - 4, BODY_CY + 6, 2, cx - 2, BODY_CY + 8, 18);
  bellyGrad.addColorStop(0, '#f8f0de');
  bellyGrad.addColorStop(1, 'rgba(248,240,222,0)');
  ctx.fillStyle = bellyGrad;
  ctx.beginPath(); ctx.ellipse(cx - 2, BODY_CY + 6, 18, 22, 0, 0, Math.PI * 2); ctx.fill();

  // ── NON-GUN ARM (back, swinging) ──────────────────────────
  {
    const sw = walk * 9;
    ctx.fillStyle = '#c4a07a';
    ctx.save();
    ctx.translate(cx - 22, SHLDR_Y + 8);
    ctx.rotate(-0.3 + sw * 0.055);
    roundRect(-4, 0, 12, 18, 5); ctx.fill();
    ctx.fillStyle = '#a8845e';
    roundRect(-5, 16, 13, 7, 4); ctx.fill();   // paw
    ctx.restore();
  }

  // ── FRONT LEG ─────────────────────────────────────────────
  {
    const sw = walk * 11;
    ctx.fillStyle = '#caa87e';
    ctx.save();
    ctx.translate(cx + 10 + sw * 0.2, HIP_Y);
    ctx.rotate(sw * 0.045);
    roundRect(-6, 0, 13, 16, 5); ctx.fill();
    ctx.fillStyle = '#b08a62';
    roundRect(-6, 14, 14, 8, 4); ctx.fill();
    ctx.restore();
  }

  // ── GUN ARM (right side, extended, holding revolver) ───────
  {
    const ay = SHLDR_Y + 10;
    const handX = cx + 38;
    const handY = ay + 8;
    ctx.fillStyle = '#c4a07a';
    ctx.save(); ctx.translate(cx + 20, ay);
    roundRect(-3, 0, 12, 20, 4); ctx.fill();
    ctx.restore();
    drawRevolver(handX, handY);
  }

  // ── NECK (merges head with body) ───────────────────────────
  const neckGrad = ctx.createLinearGradient(cx - 10, HEAD_CY + 18, cx + 10, HEAD_CY + 30);
  neckGrad.addColorStop(0, '#d8c0a0');
  neckGrad.addColorStop(1, '#c4a07a');
  ctx.fillStyle = neckGrad;
  roundRect(cx - 10, HEAD_CY + 20, 20, 14, 8); ctx.fill();

  // ── HEAD (large, round, cartoon — based on reference photo) ─
  const HR = 25;   // head radius
  const headGrad = ctx.createRadialGradient(cx - 9, HEAD_CY - 11, 3, cx, HEAD_CY, HR);
  headGrad.addColorStop(0,   '#f2e0c4');
  headGrad.addColorStop(0.6, '#d4b690');
  headGrad.addColorStop(1,   '#c0986a');
  ctx.fillStyle = headGrad;
  ctx.beginPath(); ctx.arc(cx, HEAD_CY, HR, 0, Math.PI * 2); ctx.fill();

  // Head side highlight
  ctx.fillStyle = 'rgba(255,248,232,0.35)';
  ctx.beginPath(); ctx.arc(cx - 9, HEAD_CY - 9, HR * 0.4, 0, Math.PI * 2); ctx.fill();

  // ── EARS ──────────────────────────────────────────────────
  ctx.fillStyle = '#b08860';
  ctx.beginPath(); ctx.ellipse(cx - 18, HEAD_CY - HR + 8, 12, 9, -0.45, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f4a8b0';   // pink inner ear
  ctx.beginPath(); ctx.ellipse(cx - 18, HEAD_CY - HR + 8, 7, 5, -0.45, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#b08860';
  ctx.beginPath(); ctx.ellipse(cx + 15, HEAD_CY - HR + 10, 10, 8, 0.45, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f4a8b0';
  ctx.beginPath(); ctx.ellipse(cx + 15, HEAD_CY - HR + 10, 6, 4.5, 0.45, 0, Math.PI * 2); ctx.fill();

  // ── HAIR TUFTS (signature feature from the reference photo!) ─
  ctx.strokeStyle = '#a07848'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  hairTufts.forEach(t => {
    ctx.beginPath();
    ctx.moveTo(cx + t.dx, HEAD_CY - HR + 4);
    ctx.lineTo(cx + t.dx + t.lean * 7, HEAD_CY - HR - t.h);
    ctx.stroke();
  });

  // ── WIDE FLAT CAPYBARA SNOUT (the key feature!) ────────────
  // The snout is wide and fills the lower face — exactly like the photo
  const snoutGrad = ctx.createRadialGradient(cx + 2, HEAD_CY + 8, 3, cx + 2, HEAD_CY + 10, 22);
  snoutGrad.addColorStop(0, '#dfc0a0');
  snoutGrad.addColorStop(1, '#b89070');
  ctx.fillStyle = snoutGrad;
  ctx.beginPath(); ctx.ellipse(cx + 2, HEAD_CY + 10, 22, 15, 0, 0, Math.PI * 2); ctx.fill();

  // Snout top highlight
  ctx.fillStyle = 'rgba(255,248,232,0.3)';
  ctx.beginPath(); ctx.ellipse(cx, HEAD_CY + 7, 14, 8, 0, 0, Math.PI * 2); ctx.fill();

  // Two nostrils (like the photo)
  ctx.fillStyle = '#8b5e3c';
  ctx.beginPath(); ctx.ellipse(cx - 6, HEAD_CY + 12, 5, 4, -0.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + 10, HEAD_CY + 12, 5, 4,  0.2, 0, Math.PI * 2); ctx.fill();

  // Philtrum groove
  ctx.strokeStyle = '#7a5030'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx + 2, HEAD_CY + 8); ctx.lineTo(cx + 2, HEAD_CY + 14); ctx.stroke();

  // Gentle smile (like in the reference!)
  ctx.strokeStyle = '#9a6840'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 6,  HEAD_CY + 21);
  ctx.quadraticCurveTo(cx + 2, HEAD_CY + 26, cx + 12, HEAD_CY + 21);
  ctx.stroke();

  // ── EYES (two eyes, beady and expressive like the photo) ───
  if (!blinking) {
    // Left eye
    ctx.fillStyle = '#f5f2ec';
    ctx.beginPath(); ctx.ellipse(cx - 9, HEAD_CY - 3, 7.5, 9, -0.12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2e1c10';
    ctx.beginPath(); ctx.ellipse(cx - 8, HEAD_CY - 2, 5, 7, -0.12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0a0403';
    ctx.beginPath(); ctx.arc(cx - 7, HEAD_CY - 1, 3.8, 0, Math.PI * 2); ctx.fill();
    // Primary shine
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath(); ctx.arc(cx - 5,  HEAD_CY - 5, 2.8, 0, Math.PI * 2); ctx.fill();
    // Secondary tiny shine
    ctx.beginPath(); ctx.arc(cx - 10, HEAD_CY + 1, 1.2, 0, Math.PI * 2); ctx.fill();

    // Right eye
    ctx.fillStyle = '#f5f2ec';
    ctx.beginPath(); ctx.ellipse(cx + 11, HEAD_CY - 4, 6.5, 8, 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2e1c10';
    ctx.beginPath(); ctx.ellipse(cx + 12, HEAD_CY - 3, 4.5, 6.5, 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0a0403';
    ctx.beginPath(); ctx.arc(cx + 12, HEAD_CY - 2, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath(); ctx.arc(cx + 14, HEAD_CY - 6, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 10, HEAD_CY + 1, 1.0, 0, Math.PI * 2); ctx.fill();
  } else {
    // Happy squint blink
    ctx.strokeStyle = '#2c1810'; ctx.lineWidth = 2.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx - 8, HEAD_CY + 1, 6.5, Math.PI + 0.4, 2 * Math.PI - 0.4); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + 11, HEAD_CY,    5.5, Math.PI + 0.4, 2 * Math.PI - 0.4); ctx.stroke();
  }

  ctx.restore();
}

// ── Draw: Obstacles ──────────────────────────────────────────
function drawObstacle(o) {
  ctx.save();

  if (o.type === 'log' || o.type === 'twinLogs') {
    const count = o.type === 'twinLogs' ? 2 : 1;
    const lw    = o.type === 'twinLogs' ? (o.w - 8) / 2 : o.w;
    for (let i = 0; i < count; i++) {
      const lx = o.x + i * (lw + 8);
      // Dark jungle log
      const lg = ctx.createLinearGradient(lx, o.y, lx + lw, o.y + o.h);
      lg.addColorStop(0, '#4e3020'); lg.addColorStop(1, '#2e1c10');
      ctx.fillStyle = lg; roundRect(lx, o.y, lw, o.h, 6); ctx.fill();
      // Moss on top
      ctx.fillStyle = '#245a12'; roundRect(lx, o.y, lw, 10, 6); ctx.fill();
      ctx.fillStyle = '#37721e'; roundRect(lx + 4, o.y, lw - 8, 5, 4); ctx.fill();
      // Wood rings at top end
      ctx.strokeStyle = '#3a2010'; ctx.lineWidth = 1.5;
      for (let r = 5; r < 14; r += 4) {
        ctx.beginPath();
        ctx.ellipse(lx + lw / 2, o.y + 7, lw / 2 - r, 5 - r * 0.22, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Grain lines
      ctx.strokeStyle = '#5c3c22'; ctx.lineWidth = 1;
      const strips = Math.max(1, Math.floor(lw / 10));
      for (let j = 1; j <= strips; j++) {
        const gx = lx + j * (lw / (strips + 1));
        ctx.beginPath();
        ctx.moveTo(gx, o.y + 14);
        ctx.quadraticCurveTo(gx + 3, o.y + o.h / 2, gx, o.y + o.h - 5);
        ctx.stroke();
      }
    }

  } else if (o.type === 'rock' || o.type === 'bigRock') {
    // Mossy jungle boulder
    const rg = ctx.createLinearGradient(o.x, o.y, o.x + o.w, o.y + o.h);
    rg.addColorStop(0, '#4c4c3a'); rg.addColorStop(1, '#2e2e1e');
    ctx.fillStyle = rg;
    roundRect(o.x + 5, o.y + 9, o.w - 10, o.h - 9, 20); ctx.fill();

    // Rock highlight face
    ctx.fillStyle = '#5c5c48';
    roundRect(o.x + 10, o.y + 14, o.w - 28, o.h - 28, 14); ctx.fill();

    // Thick moss covering the top
    ctx.fillStyle = '#224d10'; roundRect(o.x + 5, o.y + 9, o.w - 10, 16, 16); ctx.fill();
    ctx.fillStyle = '#347220'; roundRect(o.x + 8, o.y + 10, o.w - 22, 8, 10); ctx.fill();

    // Crack detail
    ctx.strokeStyle = '#1e1e14'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(o.x + o.w * 0.38, o.y + o.h * 0.28);
    ctx.lineTo(o.x + o.w * 0.52, o.y + o.h * 0.62);
    ctx.lineTo(o.x + o.w * 0.46, o.y + o.h * 0.88);
    ctx.stroke();

    // Big rock gets a second boulder stacked on top
    if (o.type === 'bigRock') {
      ctx.fillStyle = '#44443a';
      roundRect(o.x + 14, o.y, o.w - 30, o.h * 0.45, 16); ctx.fill();
      ctx.fillStyle = '#545448';
      roundRect(o.x + 18, o.y + 5, o.w - 42, o.h * 0.24, 10); ctx.fill();
      ctx.fillStyle = '#224d10';
      roundRect(o.x + 14, o.y, o.w - 30, 12, 12); ctx.fill();
      ctx.fillStyle = '#347220';
      roundRect(o.x + 18, o.y + 1, o.w - 44, 6, 8); ctx.fill();
    }
  }

  ctx.restore();
}

// ── Draw: Bullets ────────────────────────────────────────────
function drawBullets() {
  bullets.forEach(b => {
    ctx.save();
    ctx.shadowColor = '#ff8c00'; ctx.shadowBlur = 16;
    ctx.fillStyle = '#ff9800';
    roundRect(b.x, b.y, b.w, b.h, 3); ctx.fill();
    ctx.fillStyle = '#ffee58';
    roundRect(b.x + 2, b.y + 1, b.w - 5, b.h - 2, 2); ctx.fill();
    ctx.restore();
  });
}

// ── Draw: Particles ──────────────────────────────────────────
function drawParticles() {
  particles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.1, p.r), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });
}

// ── Draw: Foreground Jungle Leaves (decorative) ───────────────
function drawForegroundLeaves() {
  function leaf(lx, ly, size, angle, dark, light) {
    ctx.save(); ctx.translate(lx, ly); ctx.rotate(angle);
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-size * 0.3, -size * 0.55, 0,           -size * 1.1, size * 0.5, -size);
    ctx.bezierCurveTo( size * 1.0, -size * 0.9,  size * 1.1, -size * 0.4,  size,       0);
    ctx.bezierCurveTo( size * 0.7,  size * 0.2,  size * 0.2,  size * 0.15, 0,          0);
    ctx.fill();
    // Midrib
    ctx.strokeStyle = light; ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(size * 0.2, -size * 0.4, size * 0.38, -size * 0.8, size * 0.5, -size);
    ctx.stroke();
    ctx.restore();
  }
  ctx.save(); ctx.globalAlpha = 0.85;
  // Bottom-left cluster
  leaf(-15, canvas.height + 8,  95, 0.35,  '#184a08', '#286018');
  leaf(28,  canvas.height - 12, 74, -0.45, '#12380a', '#1e5212');
  leaf(-8,  canvas.height - 34, 58, 0.85,  '#1e4a10', '#2c661c');
  leaf(55,  canvas.height - 5,  50, -1.1,  '#153808', '#224a12');
  // Bottom-right cluster
  leaf(canvas.width + 14,  canvas.height + 8,  90, Math.PI - 0.35,  '#184a08', '#286018');
  leaf(canvas.width - 28,  canvas.height - 8,  80, Math.PI + 0.5,   '#12380a', '#1e5212');
  leaf(canvas.width + 8,   canvas.height - 32, 62, Math.PI - 0.9,   '#1e4a10', '#2c661c');
  leaf(canvas.width - 58,  canvas.height - 2,  48, Math.PI + 1.2,   '#153808', '#224a12');
  ctx.restore();
}

// ── Draw: HUD ────────────────────────────────────────────────
function drawHUD() {
  // Score panel
  ctx.save();
  ctx.fillStyle = 'rgba(0,10,0,0.45)';
  roundRect(12, 10, 208, 40, 8); ctx.fill();
  ctx.fillStyle = '#a8ff78';
  ctx.font = 'bold 20px "Courier New", monospace';
  ctx.textAlign = 'left';
  ctx.fillText('Score: ' + String(score).padStart(5, '0'), 22, 36);

  if (highScore > 0) {
    ctx.fillStyle = 'rgba(0,10,0,0.45)';
    roundRect(canvas.width - 178, 10, 166, 40, 8); ctx.fill();
    ctx.fillStyle = '#78d8ff';
    ctx.font = '15px "Courier New", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('BEST: ' + String(highScore).padStart(5, '0'), canvas.width - 22, 36);
  }
  ctx.restore();

  // Control hint
  ctx.fillStyle = 'rgba(168,255,120,0.32)';
  ctx.font = '12px Arial'; ctx.textAlign = 'center';
  ctx.fillText('SPACE / tap = jump  •  Z / tap right = SHOOT', canvas.width / 2, canvas.height - 8);
}

function drawFireZone() {
  ctx.save(); ctx.globalAlpha = 0.10;
  ctx.fillStyle = '#ff5722';
  roundRect(canvas.width * 0.65, canvas.height * 0.5, canvas.width * 0.35, canvas.height * 0.5, 10);
  ctx.fill(); ctx.globalAlpha = 0.38;
  ctx.fillStyle = '#ff8a65'; ctx.font = 'bold 14px Arial'; ctx.textAlign = 'center';
  ctx.fillText('FIRE', canvas.width * 0.825, canvas.height - 12);
  ctx.restore();
}

// ── Draw: Overlay Screens ────────────────────────────────────
function drawOverlay(title, lines) {
  ctx.fillStyle = 'rgba(0,8,2,0.65)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.shadowColor = '#44ff88'; ctx.shadowBlur = 22;
  ctx.fillStyle = '#a8ff78';
  ctx.font = 'bold 56px Arial, sans-serif';
  ctx.fillText(title, canvas.width / 2, 178);
  ctx.shadowBlur = 0;
  lines.forEach((l, i) => {
    ctx.font = `${l.size || 22}px Arial, sans-serif`;
    ctx.fillStyle = l.color || '#d0f0b0';
    ctx.fillText(l.text, canvas.width / 2, 238 + i * 52);
  });
}

// ── Draw: TobWan Gaming Studio Logo ──────────────────────────
function drawStudioLogo(lx, ly) {
  ctx.save();
  const pw = 152, ph = 42, px = lx, py = ly - ph / 2;
  ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 14;
  const lg = ctx.createLinearGradient(px, py, px + pw, py + ph);
  lg.addColorStop(0, '#010d06'); lg.addColorStop(1, '#031a0a');
  ctx.fillStyle = lg; roundRect(px, py, pw, ph, ph / 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#00cc66'; ctx.lineWidth = 1.5;
  roundRect(px, py, pw, ph, ph / 2); ctx.stroke();
  // Mini controller icon
  const icx = px + 20, icy = ly;
  ctx.fillStyle = '#55ff99';
  roundRect(icx - 11, icy - 8, 22, 14, 4); ctx.fill();
  roundRect(icx - 15, icy - 3, 6, 10, 3);  ctx.fill();
  roundRect(icx + 9,  icy - 3, 6, 10, 3);  ctx.fill();
  ctx.fillStyle = '#003322';
  ctx.beginPath(); ctx.arc(icx - 5, icy, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffdd44';
  ctx.beginPath(); ctx.arc(icx + 4, icy - 2, 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff4466';
  ctx.beginPath(); ctx.arc(icx + 7, icy + 2, 2, 0, Math.PI * 2); ctx.fill();
  // Text
  ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 8;
  ctx.fillStyle = '#44ff99'; ctx.font = 'bold 14px Arial'; ctx.textAlign = 'left';
  ctx.fillText('TobWan', px + 38, ly + 6);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#55bb88'; ctx.font = '9px Arial';
  ctx.fillText('GAMING', px + 38, ly - 7);
  ctx.restore();
}

// ── Main Loop ────────────────────────────────────────────────
function loop() {
  if (state === 'playing') update();

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // World (back to front)
  drawSky();
  drawJungleLayers();
  drawGround();
  platforms.forEach(drawPlatform);
  obstacles.forEach(drawObstacle);
  drawBullets();
  drawParticles();
  drawCapybara();
  drawForegroundLeaves();   // drawn in front of everything for immersion

  // UI
  if (state === 'playing') { drawHUD(); drawFireZone(); }

  if (state === 'start') {
    drawOverlay('CAPYBARA RUN!', [
      { text: 'SPACE or tap left  →  jump',          size: 22, color: '#fff9c4' },
      { text: 'Z  or tap right  →  SHOOT',           size: 22, color: '#ffccbc' },
      { text: 'Land on platforms — they help!',       size: 18, color: '#b2f2e0' },
      { text: 'Press SPACE or tap to begin',          size: 20, color: '#a8ff78' },
    ]);
    drawStudioLogo(20, canvas.height - 30);
  }

  if (state === 'over') {
    const newRecord = score > 0 && score >= highScore;
    drawOverlay('GAME OVER', [
      { text: 'Score: ' + score,                     size: 30, color: '#fff9c4' },
      newRecord
        ? { text: 'New High Score!',                 size: 26, color: '#ffd54f' }
        : { text: 'Best: ' + highScore,              size: 22, color: '#b2ebf2' },
      { text: 'Press SPACE or tap to try again',     size: 20, color: '#a8ff78' },
    ]);
    drawStudioLogo(20, canvas.height - 30);
  }

  requestAnimationFrame(loop);
}

// ── Initialise and Start ──────────────────────────────────────
initBackground();
initClouds();
loop();
