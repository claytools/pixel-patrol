(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const W = canvas.width, H = canvas.height;

  const $ = id => document.getElementById(id);
  const ui = {
    score: $('score'), level: $('level'), lives: $('lives'),
    start: $('startOverlay'), over: $('gameOverOverlay'), levelCard: $('levelOverlay'),
    startBtn: $('startButton'), againBtn: $('playAgainButton'), saveBtn: $('saveScoreButton'),
    initials: $('initials'), final: $('finalScore'), board: $('leaderboard')
  };

  const keys = new Set(), shots = [], enemyShots = [], invaders = [], particles = [], stars = [];
  const colors = ['#61e9ff', '#a9ff68', '#ff7edb', '#ff9d5c', '#b893ff'];
  const player = { x: W / 2, y: H - 56, w: 44, h: 26, speed: 340, invuln: 0 };

  let playing = false, paused = false, score = 1000, lives = 10, level = 1, last = 0;
  let direction = 1, enemySpeed = 32, enemyFire = 0, fireCooldown = 0;
  let bonus = null, bonusTimer = 6, flash = 0;

  function hud() {
    ui.score.textContent = Math.floor(score);
    ui.level.textContent = level;
    ui.lives.textContent = lives;
  }

  function makeStars() {
    let seed = 1337;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 125; i++) stars.push({ x: rnd() * W, y: rnd() * H, s: rnd() < .84 ? 1 : 2, a: .35 + rnd() * .65 });
  }

  function stats(row) {
    if (row === 0) return { kind: 'brute', points: 400, scale: 1.24 };
    if (row <= 2) return { kind: 'striker', points: 200, scale: 1 };
    return { kind: 'scout', points: 100, scale: .82 };
  }

  function showLevel() {
    ui.levelCard.textContent = `LEVEL ${level}`;
    ui.levelCard.classList.add('shown');
    setTimeout(() => ui.levelCard.classList.remove('shown'), 900);
  }

  function wave() {
    invaders.length = shots.length = enemyShots.length = 0;
    direction = 1;
    enemySpeed = 32 + (level - 1) * 8;
    const rows = Math.min(5 + Math.floor((level - 1) / 3), 7);
    const cols = Math.min(9 + Math.floor((level - 1) / 2), 12);
    const gapX = 67, gapY = 54, startX = W / 2 - ((cols - 1) * gapX) / 2;
    for (let r = 0; r < rows; r++) {
      const s = stats(r);
      for (let c = 0; c < cols; c++) invaders.push({
        x: startX + c * gapX, y: 95 + r * gapY, w: 36 * s.scale, h: 26 * s.scale,
        row: r, col: c, kind: s.kind, points: s.points, color: colors[r % colors.length], alive: true
      });
    }
    showLevel();
  }

  function reset() {
    score = 1000; lives = 10; level = 1; paused = false;
    player.x = W / 2; player.invuln = 0;
    particles.length = 0; bonus = null; bonusTimer = 6;
    wave(); hud();
  }

  function start() {
    reset(); playing = true;
    ui.start.classList.remove('shown'); ui.over.classList.remove('shown');
    last = performance.now();
  }

  function gameOver() {
    playing = false; ui.final.textContent = Math.floor(score); ui.initials.value = '';
    ui.over.classList.add('shown'); setTimeout(() => ui.initials.focus(), 50);
  }

  const overlap = (a, b) => a.x - a.w/2 < b.x + b.w/2 && a.x + a.w/2 > b.x - b.w/2 && a.y - a.h/2 < b.y + b.h/2 && a.y + a.h/2 > b.y - b.h/2;

  function burst(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, speed = 45 + Math.random() * 170;
      particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: .35 + Math.random() * .45, color, size: 2 + Math.random() * 3 });
    }
  }

  function fire() {
    if (!playing || paused || fireCooldown > 0) return;
    shots.push({ x: player.x, y: player.y - 24, w: 4, h: 14, vy: -560 });
    fireCooldown = .22;
  }

  function shooter() {
    const front = new Map();
    for (const i of invaders) if (i.alive) {
      const current = front.get(i.col);
      if (!current || i.y > current.y) front.set(i.col, i);
    }
    const choices = [...front.values()];
    return choices[Math.floor(Math.random() * choices.length)];
  }

  function hitPlayer() {
    if (player.invuln > 0) return;
    lives--; player.invuln = 1.6; flash = .18; burst(player.x, player.y, '#fff', 24); hud();
    if (lives <= 0) gameOver();
  }

  function update(dt) {
    if (!playing || paused) return;
    fireCooldown = Math.max(0, fireCooldown - dt); player.invuln = Math.max(0, player.invuln - dt); flash = Math.max(0, flash - dt);
    if (keys.has('ArrowLeft') || keys.has('KeyA')) player.x -= player.speed * dt;
    if (keys.has('ArrowRight') || keys.has('KeyD')) player.x += player.speed * dt;
    player.x = Math.max(30, Math.min(W - 30, player.x));

    for (const s of shots) s.y += s.vy * dt;
    for (const s of enemyShots) s.y += s.vy * dt;

    for (let n = shots.length - 1; n >= 0; n--) {
      const shot = shots[n]; let used = shot.y < -20;
      if (bonus && !used && overlap(shot, bonus)) {
        score += 1000; burst(bonus.x, bonus.y, '#ffd966', 28); bonus = null; used = true; hud();
      }
      if (!used) for (const i of invaders) if (i.alive && overlap(shot, i)) {
        i.alive = false; score += i.points; burst(i.x, i.y, i.color, i.kind === 'brute' ? 20 : 12); used = true; hud(); break;
      }
      if (used) shots.splice(n, 1);
    }

    for (let n = enemyShots.length - 1; n >= 0; n--) {
      const s = enemyShots[n];
      if (overlap(s, player)) { enemyShots.splice(n, 1); hitPlayer(); }
      else if (s.y > H + 30) enemyShots.splice(n, 1);
    }

    const alive = invaders.filter(i => i.alive);
    if (alive.length) {
      let minX = Infinity, maxX = -Infinity;
      for (const i of alive) { i.x += direction * enemySpeed * dt; minX = Math.min(minX, i.x - i.w/2); maxX = Math.max(maxX, i.x + i.w/2); }
      if ((direction > 0 && maxX > W - 24) || (direction < 0 && minX < 24)) { direction *= -1; for (const i of alive) i.y += 18; }
      if (alive.some(i => i.y + i.h/2 >= player.y - 12)) { lives = 0; hud(); gameOver(); }
    } else if (invaders.length) {
      invaders.length = 0; level++; score += 150 * level; hud(); setTimeout(wave, 420);
    }

    enemyFire -= dt;
    if (enemyFire <= 0) {
      const s = shooter();
      if (s) enemyShots.push({ x: s.x, y: s.y + s.h/2, w: 5, h: 14, vy: 195 + level * 16 });
      enemyFire = Math.max(.25, 1.05 - level * .07) * (.65 + Math.random() * .7);
    }

    bonusTimer -= dt;
    if (!bonus && bonusTimer <= 0) {
      const dir = Math.random() < .5 ? 1 : -1;
      bonus = { x: dir > 0 ? -40 : W + 40, y: 54, w: 54, h: 22, vx: dir * (105 + level * 5) };
      bonusTimer = 9 + Math.random() * 9;
    }
    if (bonus) { bonus.x += bonus.vx * dt; if (bonus.x < -80 || bonus.x > W + 80) bonus = null; }

    for (let n = particles.length - 1; n >= 0; n--) {
      const p = particles[n]; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 180 * dt; p.life -= dt;
      if (p.life <= 0) particles.splice(n, 1);
    }
  }

  function rect(x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }

  function drawPlayer() {
    if (player.invuln > 0 && Math.floor(player.invuln * 12) % 2 === 0) return;
    const x = Math.round(player.x), y = Math.round(player.y);
    rect(x - 20, y + 4, 40, 8, '#d9f7ff'); rect(x - 14, y - 4, 28, 9, '#d9f7ff');
    rect(x - 5, y - 13, 10, 10, '#72f2cf'); rect(x - 2, y - 19, 4, 7, '#72f2cf');
  }

  function drawInvader(i, t) {
    const u = Math.max(2, Math.round(i.w / 12)), x0 = Math.round(i.x - u * 6), y0 = Math.round(i.y - u * 4), bob = Math.floor(t * 3 + i.row + i.col) % 2;
    const A = ['00100100100','00011111000','01111111110','11101110111','11111111111','00110001100','01101110110', bob ? '11010001011' : '00110001100'];
    const B = ['00011011000','00111111100','01110101110','11111111111','10111111101','10100000101','00011011000', bob ? '01100000110' : '00011011000'];
    const pattern = i.kind === 'brute' ? B : A; ctx.fillStyle = i.color;
    pattern.forEach((row, r) => [...row].forEach((v, c) => { if (v === '1') ctx.fillRect(x0 + c*u, y0 + r*u, u, u); }));
  }

  function draw(t) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    for (const s of stars) { ctx.globalAlpha = s.a * (.75 + .25 * Math.sin(t * 1.4 + s.x)); rect(s.x, s.y, s.s, s.s, '#fff'); }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#1a3a38'; ctx.lineWidth = 2; ctx.setLineDash([8,8]); ctx.beginPath(); ctx.moveTo(0, H - 28); ctx.lineTo(W, H - 28); ctx.stroke(); ctx.setLineDash([]);
    for (const i of invaders) if (i.alive) drawInvader(i, t);
    if (bonus) { const x = Math.round(bonus.x), y = Math.round(bonus.y); rect(x-24,y,48,7,'#ffd966'); rect(x-17,y-7,34,7,'#ff9d5c'); rect(x-8,y-12,16,5,'#fff'); rect(x-18,y+7,7,5,'#ff7edb'); rect(x+11,y+7,7,5,'#ff7edb'); }
    for (const s of shots) rect(s.x-s.w/2, s.y-s.h/2, s.w, s.h, '#d9fff7');
    for (const s of enemyShots) { rect(s.x-s.w/2, s.y-s.h/2, s.w, s.h, '#ff6f91'); rect(s.x-1,s.y-5,2,4,'#fff'); }
    drawPlayer();
    for (const p of particles) { ctx.globalAlpha = Math.min(1, p.life * 2.5); rect(p.x,p.y,p.size,p.size,p.color); }
    ctx.globalAlpha = 1;
    if (paused && playing) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0,0,W,H); ctx.fillStyle = '#fff'; ctx.textAlign='center'; ctx.font='bold 44px monospace'; ctx.fillText('PAUSED',W/2,H/2); }
    if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash * 1.8})`; ctx.fillRect(0,0,W,H); }
  }

  function loop(now) { const dt = Math.min(.034, (now - last) / 1000 || 0); last = now; update(dt); draw(now / 1000); requestAnimationFrame(loop); }

  function loadScores() { try { return JSON.parse(localStorage.getItem('pixel-patrol-scores') || '[]'); } catch { return []; } }
  function renderScores() {
    const scores = loadScores().sort((a,b) => b.score - a.score).slice(0,8); ui.board.innerHTML = '';
    if (!scores.length) { const li = document.createElement('li'); li.textContent = 'NO SCORES YET'; ui.board.appendChild(li); return; }
    for (const e of scores) { const li = document.createElement('li'), span = document.createElement('span'); li.append(document.createTextNode(e.initials)); span.textContent = e.score; li.appendChild(span); ui.board.appendChild(li); }
  }
  function saveScore() {
    const initials = ui.initials.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3) || '???';
    const scores = loadScores(); scores.push({ initials, score: Math.floor(score), at: Date.now() }); scores.sort((a,b) => b.score - a.score);
    localStorage.setItem('pixel-patrol-scores', JSON.stringify(scores.slice(0,20))); renderScores(); ui.saveBtn.textContent = 'SAVED!'; setTimeout(() => ui.saveBtn.textContent = 'SAVE SCORE', 900);
  }

  addEventListener('keydown', e => {
    if (['ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
    keys.add(e.code); if (e.code === 'Space') fire(); if (e.code === 'KeyP' && playing) paused = !paused; if (e.code === 'KeyR') start();
  }, { passive: false });
  addEventListener('keyup', e => keys.delete(e.code));
  ui.startBtn.addEventListener('click', start); ui.againBtn.addEventListener('click', start); ui.saveBtn.addEventListener('click', saveScore);
  ui.initials.addEventListener('input', () => ui.initials.value = ui.initials.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3));
  ui.initials.addEventListener('keydown', e => { if (e.key === 'Enter') saveScore(); });

  makeStars(); renderScores(); hud(); requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); });
})();
