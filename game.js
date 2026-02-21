// ============================================================
//  CAPYBARA RUN! – 2D Endless Runner / Platformer
//  by TobWan Gaming
//
//  v2.0 features:
//    • Floating platforms to jump on
//    • Gun with shooting (Z key / tap right side)
//    • Sound effects via Web Audio API (no files needed!)
//    • Explosion particles
// ============================================================

// ── Canvas Setup ─────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

canvas.width  = 900;
canvas.height = 500;

function resizeCanvas() {
  const w = Math.min(window.innerWidth - 32, 900);
  canvas.style.width  = w + 'px';
  canvas.style.height = Math.round(w * (500 / 900)) + 'px';
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ── Constants ─────────────────────────────────────────────────
const GROUND   = 430;    // y-coordinate of ground surface
const GRAVITY  = 0.70;   // downward pull each frame
const JUMP_VEL = -13;    // upward speed when jumping
const BASE_SPD = 5;      // starting scroll speed

// ── Sound Engine (Web Audio API – zero audio files!) ──────────
// The browser can synthesise beeps and booms from scratch.
let audioCtx = null;

function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

// Play a tone that sweeps from startF to endF over `dur` seconds
function tone(startF, endF, type, dur, vol) {
  try {
    const ac   = getAudio();
    const osc  = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(startF, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(endF, ac.currentTime + dur);
    gain.gain.setValueAtTime(vol, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + dur + 0.01);
  } catch (e) { /* fail silently if audio blocked */ }
}

// White noise burst (great for explosions)
function noise(dur, vol) {
  try {
    const ac  = getAudio();
    const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src  = ac.createBufferSource();
    src.buffer = buf;
    const gain = ac.createGain();
    src.connect(gain);
    gain.connect(ac.destination);
    gain.gain.setValueAtTime(vol, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    src.start(ac.currentTime);
  } catch (e) {}
}

// Named sound effects
function sfx(name) {
  switch (name) {
    case 'jump':      tone(200, 420, 'sine',     0.22, 0.28); break;
    case 'dbljump':   tone(320, 640, 'sine',     0.18, 0.22); break;
    case 'shoot':     tone(900, 180, 'sawtooth', 0.10, 0.35); break;
    case 'hit':       noise(0.22, 0.45); tone(140, 40, 'square', 0.20, 0.28); break;
    case 'land':      tone(100,  60, 'sine',     0.09, 0.18); break;
    case 'gameover':  tone(400,  80, 'sawtooth', 0.45, 0.38); break;
    case 'milestone': tone(600, 900, 'sine',     0.18, 0.25); break;
  }
}

// ── Game State ────────────────────────────────────────────────
let state          = 'start';   // 'start' | 'playing' | 'over'
let score          = 0;
let highScore      = 0;
let speed          = BASE_SPD;
let frame          = 0;
let nextObstacleIn = 90;
let nextPlatformIn = 220;
let lastMilestone  = 0;
let shootCooldown  = 0;         // frames until next shot allowed

// ── Capybara ──────────────────────────────────────────────────
const capy = {
  x: 130,
  y: GROUND - 52,
  w: 88,
  h: 52,
  vy: 0,
  grounded: true,
  jumpsLeft: 2,
  legPhase: 0,
  blinkIn: 120,
  blinking: false,
};

// ── World Objects ─────────────────────────────────────────────
let obstacles = [];
let platforms = [];
let bullets   = [];
let particles = [];
let clouds    = [];

// Scrolling ground dots give a sense of speed
let groundDots = [];
for (let i = 0; i < 20; i++) {
  groundDots.push({
    x: Math.random() * canvas.width,
    y: GROUND + 6 + Math.random() * 20,
    r: 1 + Math.random() * 2,
  });
}

// ── Input ─────────────────────────────────────────────────────
function doJump() {
  if (state === 'start' || state === 'over') { startGame(); return; }
  if (capy.jumpsLeft > 0) {
    sfx(capy.grounded ? 'jump' : 'dbljump');
    capy.vy        = JUMP_VEL;
    capy.grounded  = false;
    capy.jumpsLeft--;
  }
}

function doShoot() {
  if (state !== 'playing' || shootCooldown > 0) return;
  sfx('shoot');
  bullets.push({
    x: capy.x + capy.w + 6,   // start at barrel tip
    y: capy.y + 16,
    w: 16, h: 6,
  });
  shootCooldown = 14;  // ~0.23 s cooldown between shots
}

document.addEventListener('keydown', e => {
  if (e.repeat) return;  // ignore key-held repeats
  if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); doJump();  }
  if (e.code === 'KeyZ'  || e.code === 'KeyF')    { e.preventDefault(); doShoot(); }
});

canvas.addEventListener('pointerdown', e => {
  const rect  = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  const cx    = (e.clientX - rect.left) * scaleX;
  const cy    = (e.clientY - rect.top)  * scaleY;

  if (state !== 'playing') { doJump(); return; }

  // Right 35% of screen + lower half = FIRE button
  if (cx > canvas.width * 0.65 && cy > canvas.height * 0.5) {
    doShoot();
  } else {
    doJump();
  }
});

// ── Game Flow ─────────────────────────────────────────────────
function startGame() {
  score = 0; speed = BASE_SPD; frame = 0;
  nextObstacleIn = 90; nextPlatformIn = 220;
  lastMilestone  = 0;  shootCooldown  = 0;
  obstacles = []; platforms = []; bullets = []; particles = [];
  capy.y = GROUND - capy.h; capy.vy = 0;
  capy.grounded = true; capy.jumpsLeft = 2;
  state = 'playing';
}

function endGame() {
  if (score > highScore) highScore = score;
  sfx('gameover');
  state = 'over';
}

// ── Obstacle Spawning ─────────────────────────────────────────
const OBS_DEFS = [
  { type: 'log',      w: 46, h: 38 },
  { type: 'log',      w: 46, h: 38 },
  { type: 'cactus',   w: 32, h: 64 },
  { type: 'cactus',   w: 32, h: 64 },
  { type: 'bigCactus',w: 36, h: 92 },
  { type: 'twinLogs', w: 72, h: 38 },
];

function spawnObstacle() {
  let def;
  do { def = OBS_DEFS[Math.floor(Math.random() * OBS_DEFS.length)]; }
  while (def.type === 'twinLogs' && score < 200);
  obstacles.push({ type: def.type, x: canvas.width + 20, y: GROUND - def.h, w: def.w, h: def.h });
}

// ── Platform Spawning ─────────────────────────────────────────
// Three heights – all reachable with a single jump from the ground
const PLAT_HEIGHTS = [GROUND - 100, GROUND - 120, GROUND - 145];

function spawnPlatform() {
  const y = PLAT_HEIGHTS[Math.floor(Math.random() * PLAT_HEIGHTS.length)];
  const w = 110 + Math.floor(Math.random() * 90);
  platforms.push({ x: canvas.width + 20, y, w, h: 18 });
}

// ── Explosion Particles ───────────────────────────────────────
function burst(cx, cy) {
  const COLORS = ['#FF6B35', '#F7C59F', '#FFD700', '#FF4500', '#FFFFFF'];
  for (let i = 0; i < 16; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd   = 2 + Math.random() * 5;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd - 2,
      r: 3 + Math.random() * 5,
      life: 1.0,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    });
  }
}

// ── Update (runs every frame while playing) ───────────────────
function update() {
  frame++;
  score = Math.floor(frame * speed / 28);
  speed = Math.min(BASE_SPD + Math.sqrt(score) * 0.26, 16);

  // Play a chime every 100 points
  const milestone = Math.floor(score / 100);
  if (milestone > lastMilestone) { lastMilestone = milestone; sfx('milestone'); }

  if (shootCooldown > 0) shootCooldown--;

  // ── Capybara physics ──────────────────────────────────────
  const prevBottom = capy.y + capy.h;   // bottom position BEFORE moving
  capy.vy += GRAVITY;
  capy.y  += capy.vy;
  if (capy.grounded) capy.legPhase += speed * 0.11;

  // ── Blink timer ───────────────────────────────────────────
  capy.blinkIn--;
  if (capy.blinkIn <= 0) {
    capy.blinking = true;
    if (capy.blinkIn < -4) { capy.blinking = false; capy.blinkIn = 90 + Math.random() * 140; }
  }

  // ── Ground collision ──────────────────────────────────────
  if (capy.y + capy.h >= GROUND) {
    const wasAir  = !capy.grounded;
    capy.y        = GROUND - capy.h;
    capy.vy       = 0;
    capy.grounded = true;
    capy.jumpsLeft = 2;
    if (wasAir) sfx('land');
  } else {
    // ── Platform collision ────────────────────────────────
    // Logic: if capybara was ABOVE the platform last frame and
    // is now AT or BELOW it, and horizontally overlapping → land.
    // When the platform scrolls away, overlapX becomes false → fall.
    let onPlat = false;
    for (const plat of platforms) {
      const overlapX = capy.x + 16 < plat.x + plat.w &&
                       capy.x + capy.w - 16 > plat.x;
      if (overlapX && capy.vy >= 0 &&
          prevBottom <= plat.y + 3 &&
          capy.y + capy.h >= plat.y) {
        const wasAir  = !capy.grounded;
        capy.y        = plat.y - capy.h;
        capy.vy       = 0;
        capy.grounded = true;
        capy.jumpsLeft = 2;
        onPlat        = true;
        if (wasAir) sfx('land');
        break;
      }
    }
    if (!onPlat) capy.grounded = false;
  }

  // ── Bullets ───────────────────────────────────────────────
  bullets.forEach(b => { b.x += 15; });
  bullets = bullets.filter(b => b.x < canvas.width + 30);

  // Bullet → obstacle hit detection
  outer: for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const b = bullets[bi];
    for (let oi = obstacles.length - 1; oi >= 0; oi--) {
      const o = obstacles[oi];
      if (b.x < o.x + o.w && b.x + b.w > o.x &&
          b.y < o.y + o.h && b.y + b.h > o.y) {
        burst(o.x + o.w / 2, o.y + o.h / 2);
        sfx('hit');
        obstacles.splice(oi, 1);
        bullets.splice(bi, 1);
        break outer;
      }
    }
  }

  // ── Spawn obstacles ───────────────────────────────────────
  nextObstacleIn -= speed;
  if (nextObstacleIn <= 0) {
    spawnObstacle();
    const minGap = Math.max(130, 340 - score * 0.09);
    nextObstacleIn = minGap + Math.random() * 160;
  }
  obstacles.forEach(o => { o.x -= speed; });
  obstacles = obstacles.filter(o => o.x + o.w > -20);

  // ── Spawn platforms ───────────────────────────────────────
  nextPlatformIn -= speed;
  if (nextPlatformIn <= 0) {
    spawnPlatform();
    nextPlatformIn = 380 + Math.random() * 280;
  }
  platforms.forEach(p => { p.x -= speed; });
  platforms = platforms.filter(p => p.x + p.w > -20);

  // ── Particles ─────────────────────────────────────────────
  particles.forEach(p => {
    p.x += p.vx; p.y += p.vy;
    p.vy  += 0.20;
    p.life -= 0.034;
    p.r   *= 0.97;
  });
  particles = particles.filter(p => p.life > 0);

  // ── Clouds ────────────────────────────────────────────────
  clouds.forEach(c => {
    c.x -= c.spd;
    if (c.x + c.r * 2 < 0) { c.x = canvas.width + c.r; c.y = 35 + Math.random() * 110; }
  });

  // ── Ground dots (parallax) ────────────────────────────────
  groundDots.forEach(d => {
    d.x -= speed * 0.8;
    if (d.x < -4) d.x += canvas.width + 8;
  });

  // ── Capybara ↔ obstacle collision ─────────────────────────
  const hx = capy.x + 14, hy = capy.y + 7;
  const hw = capy.w - 28,  hh = capy.h - 9;
  for (const o of obstacles) {
    if (hx < o.x + o.w && hx + hw > o.x &&
        hy < o.y + o.h && hy + hh > o.y) {
      endGame(); return;
    }
  }
}

// ── Draw Helpers ──────────────────────────────────────────────
function roundRect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h,     x,     y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y,         x + r, y);
  ctx.closePath();
}

// ── Draw Background ───────────────────────────────────────────
function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, '#42a5f5');
  sky.addColorStop(1, '#bbdefb');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, GROUND);

  // Glowing sun
  ctx.save();
  ctx.shadowColor = '#ffee58';
  ctx.shadowBlur  = 28;
  ctx.fillStyle   = '#fff176';
  ctx.beginPath();
  ctx.arc(canvas.width - 95, 72, 36, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── Draw Clouds ───────────────────────────────────────────────
function drawClouds() {
  ctx.fillStyle = 'rgba(255,255,255,0.90)';
  clouds.forEach(({ x, y, r }) => {
    ctx.beginPath();
    ctx.arc(x,            y,           r,        0, Math.PI * 2);
    ctx.arc(x + r * 0.8,  y - r * 0.2, r * 0.68, 0, Math.PI * 2);
    ctx.arc(x + r * 1.5,  y + r * 0.1, r * 0.54, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ── Draw Ground ───────────────────────────────────────────────
function drawGround() {
  const dirt = ctx.createLinearGradient(0, GROUND, 0, canvas.height);
  dirt.addColorStop(0, '#8d6e63');
  dirt.addColorStop(1, '#5d4037');
  ctx.fillStyle = dirt;
  ctx.fillRect(0, GROUND, canvas.width, canvas.height - GROUND);

  ctx.fillStyle = '#43a047';
  ctx.fillRect(0, GROUND, canvas.width, 10);
  ctx.fillStyle = '#66bb6a';
  ctx.fillRect(0, GROUND, canvas.width, 4);

  ctx.fillStyle = '#6d4c41';
  groundDots.forEach(({ x, y, r }) => {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  });
}

// ── Draw Platform ─────────────────────────────────────────────
function drawPlatform(p) {
  // Shadow beneath platform
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur  = 8;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#795548';
  roundRect(p.x, p.y, p.w, p.h, 5);
  ctx.fill();
  ctx.restore();

  // Wood grain lines
  ctx.strokeStyle = '#6d4c41';
  ctx.lineWidth   = 1;
  for (let i = 1; i <= 3; i++) {
    const lx = p.x + p.w * i / 4;
    ctx.beginPath();
    ctx.moveTo(lx, p.y + 10);
    ctx.lineTo(lx, p.y + p.h - 2);
    ctx.stroke();
  }

  // Grass on top
  ctx.fillStyle = '#43a047';
  roundRect(p.x, p.y, p.w, 7, 4);
  ctx.fill();
  ctx.fillStyle = '#66bb6a';
  ctx.fillRect(p.x + 4, p.y, p.w - 8, 3);
}

// ── Draw Capybara ─────────────────────────────────────────────
function drawCapybara() {
  const { x, y, w, h, legPhase, grounded, blinking } = capy;
  ctx.save();

  // ── Legs (4, animated while running) ──
  const legDefs = [
    { lx: x + 14, lag: 0 },
    { lx: x + 32, lag: Math.PI },
    { lx: x + 52, lag: 0.4 },
    { lx: x + 70, lag: Math.PI + 0.4 },
  ];
  legDefs.forEach(({ lx, lag }) => {
    const swing = grounded ? Math.sin(legPhase + lag) * 9 : 0;
    const footX = lx + swing * 0.4;
    const footY = y + h + 12 + (grounded ? Math.abs(swing) * 0.2 : 0);
    ctx.strokeStyle = '#6d4c41'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(lx, y + h - 4); ctx.lineTo(footX, footY); ctx.stroke();
    ctx.fillStyle = '#5d4037';
    ctx.beginPath(); ctx.ellipse(footX, footY + 2, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
  });

  // ── Body ──
  ctx.fillStyle = '#8d6e63';
  roundRect(x + 4, y + 10, w - 10, h - 12, 20);
  ctx.fill();

  // Belly lighter area
  ctx.fillStyle = '#bcaaa4';
  roundRect(x + 14, y + 22, w - 38, h - 34, 12);
  ctx.fill();

  // ── Head (at the right = front of movement) ──
  const hx = x + w - 28, hy = y + 2, HW = 44, HH = 30;
  ctx.fillStyle = '#8d6e63';
  roundRect(hx, hy, HW, HH, 10);
  ctx.fill();

  // ── Ear ──
  ctx.fillStyle = '#795548';
  ctx.beginPath(); ctx.ellipse(hx + 9, hy - 1, 8, 6, -0.25, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ef9a9a';
  ctx.beginPath(); ctx.ellipse(hx + 9, hy - 1, 5, 3.5, -0.25, 0, Math.PI * 2); ctx.fill();

  // ── Flat capybara snout ──
  ctx.fillStyle = '#795548';
  roundRect(hx + HW - 16, hy + 8, 20, 16, 5);
  ctx.fill();
  ctx.fillStyle = '#4e342e';
  ctx.beginPath(); ctx.ellipse(hx + HW + 1, hy + 13, 4.5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#3e2723'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(hx + HW + 1, hy + 10); ctx.lineTo(hx + HW + 1, hy + 14); ctx.stroke();

  // ── GUN ──────────────────────────────────────────────────
  // Gun body (attached near snout)
  ctx.fillStyle = '#455a64';
  roundRect(hx + HW + 1, hy + 13, 14, 9, 3);
  ctx.fill();
  // Barrel (longer, sticks out front)
  ctx.fillStyle = '#37474f';
  roundRect(hx + HW + 9, hy + 15, 20, 5, 2);
  ctx.fill();
  // Grip highlight
  ctx.fillStyle = '#607d8b';
  roundRect(hx + HW + 2, hy + 19, 7, 5, 2);
  ctx.fill();
  // Muzzle flash (only when cooldown was just triggered)
  if (shootCooldown > 10) {
    ctx.save();
    ctx.shadowColor = '#ff9800';
    ctx.shadowBlur  = 12;
    ctx.fillStyle   = '#ffeb3b';
    ctx.beginPath();
    ctx.arc(hx + HW + 30, hy + 17, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── Eye ──
  if (!blinking) {
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath(); ctx.arc(hx + 15, hy + 13, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'white';
    ctx.beginPath(); ctx.arc(hx + 17, hy + 11, 2, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(hx + 10, hy + 13); ctx.lineTo(hx + 20, hy + 13); ctx.stroke();
  }

  ctx.restore();
}

// ── Draw Obstacles ────────────────────────────────────────────
function drawObstacle(o) {
  ctx.save();
  if (o.type === 'log' || o.type === 'twinLogs') {
    const count = o.type === 'twinLogs' ? 2 : 1;
    const lw    = o.type === 'twinLogs' ? (o.w - 8) / 2 : o.w;
    for (let i = 0; i < count; i++) {
      const lx = o.x + i * (lw + 8);
      ctx.fillStyle = '#795548'; roundRect(lx, o.y, lw, o.h, 6); ctx.fill();
      ctx.strokeStyle = '#6d4c41'; ctx.lineWidth = 1.5;
      for (let r = 4; r < 12; r += 4) {
        ctx.beginPath();
        ctx.ellipse(lx + lw / 2, o.y + 6, lw / 2 - r, 5 - r * 0.3, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.strokeStyle = '#a1887f'; ctx.lineWidth = 1;
      const strips = Math.floor(lw / 12);
      for (let j = 1; j <= strips; j++) {
        const gx = lx + j * (lw / (strips + 1));
        ctx.beginPath();
        ctx.moveTo(gx, o.y + 14);
        ctx.quadraticCurveTo(gx + 3, o.y + o.h / 2, gx, o.y + o.h - 5);
        ctx.stroke();
      }
    }
  } else if (o.type === 'cactus' || o.type === 'bigCactus') {
    ctx.fillStyle = '#388e3c';
    roundRect(o.x + 7, o.y, o.w - 14, o.h, 8);
    ctx.fill();
    if (o.type === 'bigCactus') {
      ctx.fillStyle = '#388e3c';
      roundRect(o.x,            o.y + 30, 16, 11, 5); ctx.fill();
      roundRect(o.x,            o.y + 18, 10, 17, 5); ctx.fill();
      roundRect(o.x + o.w - 16, o.y + 38, 16, 11, 5); ctx.fill();
      roundRect(o.x + o.w - 10, o.y + 26, 10, 17, 5); ctx.fill();
    }
    ctx.strokeStyle = '#2e7d32'; ctx.lineWidth = 1.5;
    const spines = Math.floor(o.h / 16);
    for (let i = 0; i < spines; i++) {
      const sy = o.y + 14 + i * 16;
      ctx.beginPath(); ctx.moveTo(o.x + 7, sy); ctx.lineTo(o.x + 1, sy - 5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(o.x + o.w - 7, sy); ctx.lineTo(o.x + o.w - 1, sy - 5); ctx.stroke();
    }
    ctx.fillStyle = '#4caf50';
    roundRect(o.x + 10, o.y + 5, 5, o.h - 12, 3);
    ctx.fill();
  }
  ctx.restore();
}

// ── Draw Bullets ──────────────────────────────────────────────
function drawBullets() {
  bullets.forEach(b => {
    ctx.save();
    ctx.shadowColor = '#ff9800';
    ctx.shadowBlur  = 12;
    ctx.fillStyle   = '#ff9800';
    roundRect(b.x, b.y, b.w, b.h, 3);
    ctx.fill();
    ctx.fillStyle = '#ffeb3b';
    roundRect(b.x + 2, b.y + 1, b.w - 5, b.h - 2, 2);
    ctx.fill();
    ctx.restore();
  });
}

// ── Draw Particles ────────────────────────────────────────────
function drawParticles() {
  particles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle   = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.1, p.r), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

// ── Draw HUD ──────────────────────────────────────────────────
function drawHUD() {
  // Score
  ctx.textAlign = 'left';
  ctx.fillStyle = '#1a237e';
  ctx.font      = 'bold 22px "Courier New", monospace';
  ctx.fillText('Score: ' + String(score).padStart(5, '0'), 20, 36);

  // High score
  if (highScore > 0) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#5c6bc0';
    ctx.font      = '16px "Courier New", monospace';
    ctx.fillText('BEST: ' + String(highScore).padStart(5, '0'), canvas.width - 20, 36);
  }

  // Control hint (subtle)
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(20,40,100,0.40)';
  ctx.font      = '13px Arial';
  ctx.fillText('SPACE/tap = jump  •  Z/tap right = SHOOT', canvas.width / 2, canvas.height - 8);
}

// ── Draw mobile FIRE zone hint ────────────────────────────────
function drawFireZone() {
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle   = '#ff5722';
  roundRect(canvas.width * 0.65, canvas.height * 0.5,
            canvas.width * 0.35, canvas.height * 0.5, 12);
  ctx.fill();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle   = '#ff5722';
  ctx.font        = 'bold 15px Arial';
  ctx.textAlign   = 'center';
  ctx.fillText('FIRE', canvas.width * 0.825, canvas.height - 16);
  ctx.restore();
}

// ── Draw Overlay Screens ──────────────────────────────────────
function drawOverlay(title, lines) {
  ctx.fillStyle = 'rgba(0,0,0,0.44)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign   = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur  = 10;
  ctx.fillStyle   = '#ffffff';
  ctx.font        = 'bold 54px Arial, sans-serif';
  ctx.fillText(title, canvas.width / 2, 178);
  ctx.shadowBlur  = 0;

  lines.forEach((line, i) => {
    ctx.font      = `${line.size || 22}px Arial, sans-serif`;
    ctx.fillStyle = line.color || '#e0f7fa';
    ctx.fillText(line.text, canvas.width / 2, 236 + i * 48);
  });
}

// ── TobWan Gaming logo ────────────────────────────────────────
// Drawn in the bottom-left corner of overlay screens
function drawStudioLogo(x, y) {
  ctx.save();

  // Controller icon background pill
  const pw = 140, ph = 38;
  const px = x, py = y - ph / 2;

  // Glowing pill background
  ctx.shadowColor = '#7c4dff';
  ctx.shadowBlur  = 14;
  const grad = ctx.createLinearGradient(px, py, px + pw, py + ph);
  grad.addColorStop(0, '#1a0050');
  grad.addColorStop(1, '#4a0080');
  ctx.fillStyle = grad;
  roundRect(px, py, pw, ph, ph / 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Thin purple border
  ctx.strokeStyle = '#9c27b0';
  ctx.lineWidth   = 1.5;
  roundRect(px, py, pw, ph, ph / 2);
  ctx.stroke();

  // Tiny controller icon (⬛ shape)
  const cx = px + 18, cy = y;
  ctx.fillStyle = '#ce93d8';
  // Controller body
  roundRect(cx - 10, cy - 7, 20, 13, 4); ctx.fill();
  // Left grip
  roundRect(cx - 14, cy - 2, 6, 9, 3); ctx.fill();
  // Right grip
  roundRect(cx + 8, cy - 2, 6, 9, 3); ctx.fill();
  // D-pad dot
  ctx.fillStyle = '#6a0080';
  ctx.beginPath(); ctx.arc(cx - 5, cy, 2, 0, Math.PI * 2); ctx.fill();
  // Buttons
  ctx.fillStyle = '#ff80ab';
  ctx.beginPath(); ctx.arc(cx + 4, cy - 2, 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#80d8ff';
  ctx.beginPath(); ctx.arc(cx + 7, cy + 1, 2, 0, Math.PI * 2); ctx.fill();

  // "TobWan" text
  ctx.fillStyle   = '#e040fb';
  ctx.font        = 'bold 13px Arial, sans-serif';
  ctx.textAlign   = 'left';
  ctx.shadowColor = '#ff00ff';
  ctx.shadowBlur  = 6;
  ctx.fillText('TobWan', px + 34, y + 5);
  ctx.shadowBlur = 0;

  // "GAMING" text
  ctx.fillStyle = '#ce93d8';
  ctx.font      = '9px Arial, sans-serif';
  ctx.fillText('GAMING', px + 34, y - 6);

  ctx.restore();
}

// ── Main Loop ─────────────────────────────────────────────────
function loop() {
  if (state === 'playing') update();

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawBackground();
  drawClouds();
  drawGround();
  platforms.forEach(drawPlatform);
  obstacles.forEach(drawObstacle);
  drawBullets();
  drawParticles();
  drawCapybara();

  if (state === 'playing') {
    drawHUD();
    drawFireZone();
  }

  if (state === 'start') {
    drawOverlay('CAPYBARA RUN!', [
      { text: 'SPACE or tap left → jump',           size: 22, color: '#fff9c4' },
      { text: 'Z or tap right → SHOOT obstacles',   size: 22, color: '#ffccbc' },
      { text: 'Land on platforms for a height boost!', size: 18, color: '#b2ebf2' },
      { text: 'Press SPACE or tap to begin',         size: 20, color: '#e0f7fa' },
    ]);
    drawStudioLogo(22, canvas.height - 30);
  }

  if (state === 'over') {
    const newRecord = score > 0 && score >= highScore;
    drawOverlay('GAME OVER', [
      { text: 'Score: ' + score,                        size: 30, color: '#fff9c4' },
      newRecord
        ? { text: 'New High Score!',                    size: 25, color: '#ffd54f' }
        : { text: 'Best:  ' + highScore,                size: 22, color: '#b2ebf2' },
      { text: 'Press SPACE or tap to try again',        size: 20, color: '#e0f7fa' },
    ]);
    drawStudioLogo(22, canvas.height - 30);
  }

  requestAnimationFrame(loop);
}

// ── Initialise ────────────────────────────────────────────────
function initClouds() {
  clouds = [];
  for (let i = 0; i < 6; i++) {
    clouds.push({
      x:   Math.random() * canvas.width,
      y:   35 + Math.random() * 110,
      r:   35 + Math.random() * 50,
      spd: 0.4 + Math.random() * 0.5,
    });
  }
}

initClouds();
loop();
