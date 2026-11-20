'use strict';
/*
 * 各工程（ステージ）。
 * run({ root, scope, state, finish }) を呼ぶと root に UI を構築し、
 * 完了時に finish(score 0..100, comment) を一度だけ呼ぶ。
 */

function stageLayout(root, hintHtml) {
  const hint = el('p', 'hint', hintHtml);
  const view = el('div', 'view');
  const status = el('div', 'status');
  const controls = el('div', 'controls');
  root.append(hint, view, status, controls);
  return { hint, view, status, controls };
}

function meter(label, value, cls = '') {
  return `<div class="meter ${cls}"><span>${label}</span><i><b style="width:${clamp(value, 0, 1) * 100}%"></b></i></div>`;
}

/* 鍛冶場の背景（板壁・土間・金床） */
function drawSmithy(g, W, H, light = 0.5, anvilX = 470) {
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#120c09');
  bg.addColorStop(0.7, '#1c130e');
  bg.addColorStop(1, '#0c0807');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // 板壁
  g.strokeStyle = 'rgba(0,0,0,0.45)';
  g.lineWidth = 2;
  for (let x = 30; x < W; x += 62) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H * 0.72); g.stroke(); }
  // 土間
  g.fillStyle = '#17100b';
  g.fillRect(0, H * 0.72, W, H * 0.28);
  // 金床
  const ax = anvilX, ay = H * 0.72 - 50;
  g.fillStyle = '#16171a';
  g.beginPath();
  g.moveTo(ax - 30, H * 0.72 + 30); g.lineTo(ax + 230, H * 0.72 + 30);
  g.lineTo(ax + 200, ay + 24); g.lineTo(ax, ay + 24); g.closePath(); g.fill();
  const top = g.createLinearGradient(0, ay, 0, ay + 24);
  top.addColorStop(0, `rgba(150,150,155,${0.35 + light * 0.3})`);
  top.addColorStop(0.2, '#2a2b30');
  top.addColorStop(1, '#141518');
  g.fillStyle = top;
  g.fillRect(ax - 20, ay, 240, 24);
  // 木の台
  g.fillStyle = '#2a1a10';
  g.fillRect(ax - 10, H * 0.72 + 30, 220, H * 0.28 - 30);
}

/* ============================================================
 * 一、玉鋼選び
 * ============================================================ */
function drawOre(g, q, seed, W, H) {
  const r = rng(seed);
  g.clearRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2 + 4;
  // ごつごつした塊の輪郭（ノイズ付きの滑らかな閉曲線）
  const n = 28, pts = [];
  const k1 = r() * TAU, k2 = r() * TAU, k3 = r() * TAU;
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU;
    const rad = W * 0.3 * (1 + 0.16 * Math.sin(a * 2 + k1) + 0.1 * Math.sin(a * 3 + k2) + 0.06 * Math.sin(a * 7 + k3) + (r() - 0.5) * 0.12);
    pts.push([cx + Math.cos(a) * rad * 1.15, cy + Math.sin(a) * rad * 0.78]);
  }
  const path = new Path2D();
  for (let i = 0; i < n; i++) {
    const p0 = pts[i], p1 = pts[(i + 1) % n];
    const m = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
    if (i === 0) path.moveTo(m[0], m[1]);
    else path.quadraticCurveTo(p0[0], p0[1], m[0], m[1]);
  }
  path.quadraticCurveTo(pts[0][0], pts[0][1], (pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2);
  path.closePath();
  // 影
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.85)'; g.shadowBlur = 16; g.shadowOffsetY = 7;
  g.fillStyle = '#1a1a1a'; g.fill(path);
  g.restore();
  g.save();
  g.clip(path);
  // 地の色：良質ほど銀白色、悪いものは黒ずんで褐色を帯びる
  const b = 70 + q * 105;
  const base = mixRGB([b * 0.95, b * 0.85, b * 0.75], [b, b * 1.02, b * 1.06], q);
  g.fillStyle = rgbStr(base);
  g.fillRect(0, 0, W, H);
  // 結晶粒（破面のきらめき）：良質ほど細かく揃う
  const cell = q > 0.8 ? 1.6 : q > 0.45 ? 2.6 : 3.8;
  g.save();
  g.filter = 'blur(0.5px)';
  for (let y = 0; y < H; y += cell) {
    for (let x = 0; x < W; x += cell) {
      const lv = r();
      const a = lv > 0.5 ? (lv - 0.5) * (0.25 + 0.5 * q) : (0.5 - lv) * 0.55;
      g.fillStyle = lv > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
      g.fillRect(x + (r() - 0.5) * cell, y + (r() - 0.5) * cell, cell * (0.6 + r() * 0.8), cell * (0.6 + r() * 0.8));
    }
  }
  g.restore();
  // 立体感（左上から光）
  const sh = g.createRadialGradient(cx - 22, cy - 18, 4, cx, cy, W * 0.42);
  sh.addColorStop(0, `rgba(255,255,255,${0.18 + 0.15 * q})`);
  sh.addColorStop(0.5, 'rgba(0,0,0,0)');
  sh.addColorStop(1, 'rgba(0,0,0,0.6)');
  g.fillStyle = sh;
  g.fillRect(0, 0, W, H);
  // 割れ面の稜線
  g.lineWidth = 0.8;
  for (let i = 0; i < 6; i++) {
    const x0 = cx + (r() - 0.5) * 80, y0 = cy + (r() - 0.5) * 50;
    g.strokeStyle = `rgba(255,255,255,${0.08 + 0.15 * q})`;
    g.beginPath(); g.moveTo(x0, y0);
    g.lineTo(x0 + (r() - 0.5) * 40, y0 + (r() - 0.5) * 30);
    g.lineTo(x0 + (r() - 0.5) * 60, y0 + (r() - 0.5) * 40);
    g.stroke();
  }
  // 輝点（細かな結晶面の反射）
  const spk = Math.round(q * q * 34);
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < spk; i++) {
    const x = cx + (r() - 0.5) * W * 0.6, y = cy + (r() - 0.5) * H * 0.48;
    const rad = 0.8 + r() * 2.2;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(255,255,255,${0.35 + r() * 0.5})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.restore();
  // 錆・ノロ（不純物）
  const bad = Math.round((1 - q) * 14);
  g.save();
  g.filter = 'blur(1.2px)';
  for (let i = 0; i < bad; i++) {
    const x = cx + (r() - 0.5) * W * 0.62, y = cy + (r() - 0.5) * H * 0.5;
    const rad = 3 + r() * 12 * (1 - q);
    const rg = g.createRadialGradient(x, y, 0, x, y, rad);
    rg.addColorStop(0, `rgba(${120 + r() * 40},${58 + r() * 20},24,0.7)`);
    rg.addColorStop(1, 'rgba(100,48,20,0)');
    g.fillStyle = rg;
    g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
  }
  g.restore();
  for (let i = 0; i < bad; i++) {                // ノロの気泡穴
    if (r() > 0.7) continue;
    const x = cx + (r() - 0.5) * W * 0.6, y = cy + (r() - 0.5) * H * 0.45;
    const rad = 0.8 + r() * 3.2 * (1 - q);
    g.fillStyle = 'rgba(6,5,5,0.9)';
    g.beginPath(); g.ellipse(x, y, rad, rad * 0.8, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 0.6;
    g.beginPath(); g.arc(x, y, rad, 0.2, 1.6); g.stroke();
  }
  g.restore();
  g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 1; g.stroke(path);
}

function stageSelect({ root, scope, state, finish }) {
  const ui = stageLayout(root, 'たたら製鉄で生まれた<strong>玉鋼</strong>から、刀に使う良質な塊を<strong>5つ</strong>選べ。<br>破面が<strong>銀白色に輝き、きめが細かい</strong>ものほど良質。赤錆やノロ（不純物の黒い穴）が多いものは避けよ。');
  const qs = [];
  for (let i = 0; i < 4; i++) qs.push(rand(0.84, 1));
  for (let i = 0; i < 4; i++) qs.push(rand(0.48, 0.72));
  for (let i = 0; i < 4; i++) qs.push(rand(0.1, 0.38));
  shuffle(qs);
  const sel = new Set();
  const grid = el('div', 'ore-grid');
  const cards = [];
  const confirm = btn('この5つで鍛える', 'primary', () => decide());
  confirm.disabled = true;
  const count = el('span', 'count', '選択 0 / 5');
  qs.forEach((q, i) => {
    const [c, g] = makeCanvas(170, 130, 'ore-canvas');
    drawOre(g, q, 1000 + i * 37 + Math.floor(Math.random() * 1000), 170, 130);
    const card = el('button', 'ore');
    card.type = 'button';
    card.append(c);
    const tag = el('span', 'ore-tag', '');
    card.append(tag);
    card.addEventListener('click', () => {
      if (sel.has(i)) sel.delete(i);
      else if (sel.size < 5) sel.add(i);
      else return;
      Sound.thud();
      card.classList.toggle('on', sel.has(i));
      count.textContent = `選択 ${sel.size} / 5`;
      confirm.disabled = sel.size !== 5;
    });
    cards.push({ card, tag });
    grid.append(card);
  });
  ui.view.append(grid);
  ui.controls.append(count, confirm);

  let done = false;
  function decide() {
    if (done) return;
    done = true;
    const sorted = qs.slice().sort((a, b) => b - a);
    const best = sorted.slice(0, 5).reduce((a, b) => a + b, 0);
    const worst = sorted.slice(-5).reduce((a, b) => a + b, 0);
    const sum = [...sel].reduce((a, i) => a + qs[i], 0);
    const score = Math.round(clamp((sum - worst) / (best - worst), 0, 1) * 100);
    cards.forEach(({ card, tag }, i) => {
      const q = qs[i];
      tag.textContent = q > 0.8 ? '上' : q > 0.45 ? '中' : '下';
      tag.className = 'ore-tag show ' + (q > 0.8 ? 'hi' : q > 0.45 ? 'mid' : 'lo');
      card.disabled = true;
    });
    state.material = score;
    confirm.disabled = true;
    scope.timeout(() => finish(score,
      score >= 90 ? '見事な目利き。上質な玉鋼ばかりが揃った。' :
      score >= 65 ? 'おおむね良い鋼を選べた。' :
      score >= 40 ? '並の鋼が混じっている。鍛錬で不純物を叩き出さねば。' :
      '質の悪い鋼が多い。先が思いやられる…'), 1800);
  }
}

/* ============================================================
 * 二、積み沸かし・折り返し鍛錬
 * ============================================================ */
function stageForge({ root, scope, state, finish }) {
  const ui = stageLayout(root,
    '<strong>ふいご</strong>を吹いて鋼を<strong>沸かし</strong>（黄白色に輝く約1300℃）、取り出して<strong>鎚で打つ</strong>。打っては折り返し、不純物を叩き出して鋼を鍛える。<br>' +
    '<kbd>Space</kbd>長押し：ふいご ／ <kbd>Enter</kbd>：取り出す ／ <kbd>Space</kbd>：打つ（目印が中央に来た瞬間）');
  const [c, g] = makeCanvas(860, 400);
  ui.view.append(c);
  const W = c.W, H = c.H;
  const parts = makeParticles();

  const MIN_FOLDS = 8, MAX_FOLDS = 15;
  let purity = 0.32 + (state.material || 50) / 100 * 0.25;
  let carbon = 1.18 + Math.random() * 0.06;
  let folds = 0;
  let T = 760;
  let phase = 'heat';         // heat | strike | fold | choice
  let blowing = false, blowTimer = 0;
  let heatQ = 0;
  let strikes = [];
  let marker = 0, mTime = 0;
  let hammer = 0;             // 0..1 振り下ろしアニメ
  let foldAnim = 0;
  let msg = '', msgT = 0;
  let overheat = 0;
  let time = 0;
  const qualities = [];
  const ANVIL_X = 470, BAR_Y = H * 0.72 - 50 - 30;

  function say(s, d = 1.4) { msg = s; msgT = d; }

  // ---- 操作
  const blowBtn = btn('ふいごを吹く（長押し）', 'primary hold');
  const takeBtn = btn('取り出して打つ', '', () => takeOut());
  const hitBtn = btn('打つ', 'primary big', () => strike());
  const moreBtn = btn('さらに折り返す', 'primary', () => { phase = 'heat'; T = Math.max(T, 700); renderControls(); });
  const endBtn = btn('鍛錬を終える', '', () => end());

  const startBlow = e => { e && e.preventDefault(); blowing = true; Sound.init(); };
  const stopBlow = () => { blowing = false; };
  scope.on(blowBtn, 'pointerdown', startBlow);
  scope.on(blowBtn, 'pointerup', stopBlow);
  scope.on(blowBtn, 'pointerleave', stopBlow);
  scope.on(blowBtn, 'pointercancel', stopBlow);
  scope.on(c, 'pointerdown', () => { if (phase === 'strike') strike(); });

  scope.on(window, 'keydown', e => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (e.repeat) return;
      if (phase === 'heat') startBlow();
      else if (phase === 'strike') strike();
    } else if (e.code === 'Enter') {
      e.preventDefault();
      if (phase === 'heat') takeOut();
    }
  });
  scope.on(window, 'keyup', e => { if (e.code === 'Space') stopBlow(); });

  function renderControls() {
    ui.controls.innerHTML = '';
    if (phase === 'heat') ui.controls.append(blowBtn, takeBtn);
    else if (phase === 'strike') ui.controls.append(hitBtn);
    else if (phase === 'choice') {
      ui.controls.append(moreBtn, endBtn);
      if (folds >= MAX_FOLDS) moreBtn.disabled = true;
    }
  }
  renderControls();

  function takeOut() {
    if (phase !== 'heat') return;
    if (T < 900) { say('まだ鋼が沸いていない！'); return; }
    blowing = false;
    heatQ = clamp(1 - Math.abs(T - 1320) / 170, 0, 1);
    say(T > 1440 ? '沸かしすぎ…鋼が焼けている' : heatQ > 0.75 ? '良い沸き具合！' : T < 1220 ? '沸きが足りない' : 'まずまず', 1.2);
    phase = 'strike';
    strikes = [];
    mTime = Math.random() * 2;
    Sound.thud();
    renderControls();
  }

  function strike() {
    if (phase !== 'strike' || hammer > 0.01) return;
    const d = Math.abs(marker);
    const q = d < 0.07 ? 1 : d < 0.18 ? 0.6 : 0.15;
    strikes.push(q * clamp((T - 750) / 450, 0.2, 1));
    hammer = 1;
    const coldness = T < 950;
    Sound.clang(0.6 + q * 0.4, coldness);
    parts.spark(ANVIL_X + 100, BAR_Y, Math.round(10 + q * 35 * heatGlow(T) * 1.5), { T: T + 60 });
    say(q === 1 ? '会心！' : q > 0.5 ? '良し' : '外した…', 0.6);
    T -= 55;
    if (strikes.length >= 3) {
      scope.timeout(() => {
        const sAvg = strikes.reduce((a, b) => a + b, 0) / strikes.length;
        const fq = heatQ * 0.4 + sAvg * 0.6;
        qualities.push(fq);
        purity += (1 - purity) * 0.19 * fq;
        carbon -= 0.034 + (heatQ < 0.4 && T > 1300 ? 0.01 : 0);
        folds++;
        phase = 'fold';
        foldAnim = 0;
        Sound.thud();
        renderControls();
      }, 380);
    }
  }

  function end() {
    if (phase === 'done') return;
    phase = 'done';
    Sound.stopLoops();
    const carbonScore = clamp(1 - Math.abs(carbon - 0.68) / 0.35, 0, 1);
    const score = Math.round(clamp((purity - 0.5) / 0.48 * 80 + carbonScore * 20, 0, 100));
    state.folds = folds;
    state.purity = purity;
    state.carbon = carbon;
    finish(score,
      `${folds}回折り返し、${(2 ** folds).toLocaleString()}層の鋼となった。炭素量 約${carbon.toFixed(2)}%。` +
      (carbon > 0.85 ? '炭素が多く硬いが、脆さが残る。' : carbon < 0.55 ? '炭素が抜けすぎ、粘るが刃が甘い。' : '硬さと粘りの釣り合いが良い。'));
  }

  scope.loop((dt, now) => {
    time += dt;
    // ---- 状態更新
    if (phase === 'heat') {
      if (blowing) {
        T += (190 + Math.max(0, 1300 - T) * 0.12) * dt;
        blowTimer -= dt;
        if (blowTimer <= 0) { Sound.whoosh(); blowTimer = 0.5; }
      } else {
        T += (T < 950 ? 25 : -35) * dt;
      }
      Sound.fire(blowing ? 0.9 : 0.4);
      if (T > 1440) {
        overheat += dt;
        purity -= 0.04 * dt;
        carbon -= 0.025 * dt;
        if (Math.random() < dt * 25) parts.spark(140 + rand(-40, 40), BAR_Y + 30, 2, { T: 1500, angle: -Math.PI / 2, spread: 0.6, min: 200, max: 500 });
      }
      if (T > 1250 && Math.random() < dt * 10) parts.spark(150 + rand(-50, 50), BAR_Y + 20, 1, { T: 1400, angle: -Math.PI / 2, spread: 0.5, min: 100, max: 300 });
      T = Math.min(T, 1560);
    } else {
      Sound.fire(0.2);
      if (phase === 'strike') {
        T -= 20 * dt;
        mTime += dt * (0.62 + folds * 0.055);
        const f = mTime % 2;
        marker = f < 1 ? f * 2 - 1 : 3 - f * 2;      // 三角波 -1..1
      }
      if (phase === 'fold') {
        foldAnim += dt / 1.1;
        if (foldAnim >= 1) {
          if (folds >= MAX_FOLDS) { phase = 'choice'; renderControls(); end(); }
          else if (folds >= MIN_FOLDS) { phase = 'choice'; say('折り返しを続けるか、終えるか'); renderControls(); }
          else { phase = 'heat'; renderControls(); }
        }
      }
      T = Math.max(T - 15 * dt, 600);
    }
    hammer = Math.max(0, hammer - dt * 4);
    msgT -= dt;
    parts.update(dt);

    // ---- 描画
    drawSmithy(g, W, H, heatGlow(T), ANVIL_X);
    // 火床
    g.fillStyle = '#2b1c14';
    g.fillRect(40, H * 0.72 - 40, 240, 70);
    g.fillStyle = '#3a271b';
    g.fillRect(30, H * 0.72 - 50, 260, 14);
    Sword.drawCoals(g, 55, H * 0.72 - 70, 210, 50, phase === 'heat' ? (blowing ? 1 : 0.35) : 0.2, time);

    const inFire = phase === 'heat';
    let bx = inFire ? 85 : ANVIL_X + 30, bw = 150, bh = 34;
    let by = inFire ? H * 0.72 - 74 : BAR_Y;
    if (phase === 'fold') {
      const s = Math.sin(foldAnim * Math.PI);
      bw = 150 * (1 - 0.48 * s);
      bh = 34 * (1 + 0.9 * s);
      by = BAR_Y - (bh - 34);
      bx = ANVIL_X + 30 + (150 - bw) / 2;
    }
    Sword.drawHotBar(g, bx, by, bw, bh, T, { seed: 17 + folds, time, layers: folds, scale: 50 });
    if (inFire) Sword.drawCoals(g, 55, H * 0.72 - 50, 210, 26, blowing ? 1 : 0.35, time + 3, 21); // 手前の炭

    // 鎚
    if (phase === 'strike' || hammer > 0) {
      const hx = ANVIL_X + 70;
      const lift = phase === 'strike' ? (1 - hammer) : 1;
      const hy = BAR_Y - 22 - lift * 70;
      g.save();
      g.translate(hx + 30, hy);
      g.rotate(-0.25 * lift);
      g.fillStyle = '#5a3d22';
      g.fillRect(20, -6, 150, 9);
      const hg = g.createLinearGradient(0, -22, 0, 22);
      hg.addColorStop(0, '#5b5d63'); hg.addColorStop(0.5, '#2a2b2f'); hg.addColorStop(1, '#141518');
      g.fillStyle = hg;
      g.fillRect(-26, -20, 52, 40);
      g.restore();
    }
    parts.draw(g);

    // 温度計（色見本付き）
    const gx = W - 52, gy = 40, gh = 260;
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(gx - 8, gy - 8, 40, gh + 16);
    for (let i = 0; i < gh; i++) {
      const tt = 1550 - (i / gh) * (1550 - 500);
      g.fillStyle = rgbStr(heatRGB(tt));
      g.fillRect(gx, gy + i, 24, 1);
    }
    const yOf = tt => gy + (1550 - tt) / (1550 - 500) * gh;
    g.strokeStyle = '#e8c66c'; g.lineWidth = 2;
    g.strokeRect(gx - 3, yOf(1380), 30, yOf(1260) - yOf(1380));
    g.fillStyle = 'rgba(200,40,30,0.6)';
    g.fillRect(gx - 3, yOf(1550), 4, yOf(1440) - yOf(1550));
    const ty = yOf(clamp(T, 500, 1550));
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(gx - 6, ty); g.lineTo(gx - 16, ty - 6); g.lineTo(gx - 16, ty + 6); g.fill();
    g.fillStyle = '#c9b89a'; g.font = '12px serif'; g.textAlign = 'center';
    g.fillText('沸き', gx + 12, yOf(1380) - 6);

    // 打つタイミング
    if (phase === 'strike') {
      const tx = 360, tw = 380, ty2 = 50;
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(tx - 10, ty2 - 16, tw + 20, 32);
      g.fillStyle = 'rgba(232,198,108,0.25)';
      g.fillRect(tx + tw / 2 - tw * 0.09, ty2 - 10, tw * 0.18, 20);
      g.fillStyle = 'rgba(232,198,108,0.7)';
      g.fillRect(tx + tw / 2 - tw * 0.035, ty2 - 10, tw * 0.07, 20);
      const mx = tx + tw / 2 + marker * tw / 2;
      g.fillStyle = '#fff';
      g.fillRect(mx - 2, ty2 - 14, 4, 28);
      g.fillStyle = '#c9b89a'; g.font = '13px serif'; g.textAlign = 'left';
      g.fillText(`鎚 ${strikes.length + 1} / 3`, tx, ty2 + 34);
    }
    // メッセージ
    if (msgT > 0) {
      g.font = 'bold 26px "Shippori Mincho", serif';
      g.textAlign = 'center';
      g.fillStyle = `rgba(255,236,200,${clamp(msgT * 2, 0, 1)})`;
      g.fillText(msg, W / 2 - 40, 120);
    }
    if (phase === 'fold') {
      g.font = 'bold 30px "Shippori Mincho", serif';
      g.textAlign = 'center';
      g.fillStyle = '#ffe9c4';
      g.fillText(`折り返し ${folds} 回目`, ANVIL_X + 100, 140);
    }
    if (phase === 'heat' && T > 1440) {
      g.font = 'bold 20px serif'; g.fillStyle = '#ff6a50'; g.textAlign = 'center';
      g.fillText('焼けすぎ！ 鋼が燃えている', 170, 60);
    }

    ui.status.innerHTML =
      `<div class="stat"><span>折り返し</span><b>${folds}</b> 回</div>` +
      `<div class="stat"><span>層数</span><b>${(2 ** folds).toLocaleString()}</b></div>` +
      meter('純度', (purity - 0.3) / 0.7) +
      `<div class="stat"><span>炭素量</span><b>${carbon.toFixed(2)}</b> %</div>`;
  });
}

/* ============================================================
 * 三、素延べ・火造り
 * ============================================================ */
function stageShape({ root, scope, state, finish }) {
  const ui = stageLayout(root,
    '鍛えた鋼を打ち延ばし、刀の姿に<strong>火造り</strong>する。盛り上がった箇所をクリック/タップして鎚で打ち、<strong>点線の目標の厚み</strong>に揃えよ。<br>' +
    '鋼が冷えて<strong>暗い赤</strong>になったら<strong>火床に戻して</strong>熱し直すこと。冷えた鋼を打つとヒビが入る。打ちすぎて薄くすると元に戻せない。');
  const [c, g] = makeCanvas(860, 330);
  c.style.touchAction = 'none';
  ui.view.append(c);
  const W = c.W, H = c.H;
  const parts = makeParticles();
  const N = 10, X0 = 70, X1 = 790, SW = (X1 - X0) / N;
  const BASE = 250;
  const target = [], hgt = [];
  for (let i = 0; i < N; i++) {
    target.push(i === N - 1 ? 30 : 52 - i * 1.9);
    hgt.push(target[i] + rand(9, 26));
  }
  let T = 1050, cracks = [], power = 'strong', hover = -1, hammerAt = -1, hammerT = 0;
  let reheating = 0, timeLeft = 75, time = 0, ended = false;
  const crackSegs = new Set();

  const strongBtn = btn('強く打つ', 'toggle on', () => setPower('strong'));
  const lightBtn = btn('軽く打つ', 'toggle', () => setPower('light'));
  const fireBtn = btn('火床に戻す', '', () => reheat());
  const doneBtn = btn('火造りを終える', 'primary', () => end());
  ui.controls.append(strongBtn, lightBtn, fireBtn, doneBtn);
  function setPower(p) { power = p; strongBtn.classList.toggle('on', p === 'strong'); lightBtn.classList.toggle('on', p === 'light'); }
  function reheat() { if (reheating > 0 || ended) return; reheating = 1.1; Sound.whoosh(); }

  scope.on(window, 'keydown', e => {
    if (e.key === '1') setPower('strong');
    else if (e.key === '2') setPower('light');
    else if (e.key === 'r' || e.key === 'R') reheat();
  });
  const segAt = x => { const i = Math.floor((x - X0) / SW); return i >= 0 && i < N ? i : -1; };
  scope.on(c, 'pointermove', e => { hover = segAt(canvasPos(c, e)[0]); });
  scope.on(c, 'pointerleave', () => { hover = -1; });
  scope.on(c, 'pointerdown', e => {
    const i = segAt(canvasPos(c, e)[0]);
    if (i < 0 || reheating > 0 || ended || hammerT > 0) return;
    hover = i;
    hit(i);
  });

  function hit(i) {
    const cold = T < 700;
    let d = power === 'strong' ? rand(5.5, 9) : rand(1.4, 2.8);
    d *= clamp((T - 550) / 400, 0.3, 1.1);
    hgt[i] -= d;
    if (i > 0) hgt[i - 1] -= d * 0.22;
    if (i < N - 1) hgt[i + 1] -= d * 0.22;
    hammerAt = i; hammerT = 0.18;
    Sound.clang(power === 'strong' ? 1 : 0.55, cold);
    parts.spark(X0 + SW * (i + 0.5), BASE - hgt[i], Math.round((power === 'strong' ? 18 : 6) * heatGlow(T) * 2), { T });
    T -= power === 'strong' ? 14 : 6;
    if (cold && Math.random() < 0.38) {
      cracks.push({ i, x: X0 + SW * (i + rand(0.2, 0.8)) });
      crackSegs.add(i);
      Sound.crack();
    }
  }

  function end() {
    if (ended) return;
    ended = true;
    Sound.stopLoops();
    let dev = 0;
    for (let i = 0; i < N; i++) {
      const e = hgt[i] - target[i];
      dev += Math.max(0, Math.abs(e) - 1) * (e < 0 ? 1.6 : 1);
    }
    dev /= N;
    const score = Math.round(clamp(100 - dev * 6.5 - cracks.length * 12, 0, 100));
    state.shapeCracks = cracks.length;
    finish(score,
      (dev < 1.5 ? '肉置きの整った美しい姿。' : dev < 4 ? 'やや凹凸が残るが、刀の姿になった。' : '姿が歪んでいる。研ぎでも直しきれぬかもしれぬ。') +
      (cracks.length ? ` 冷えた鋼を打ち、${cracks.length}箇所に鍛え割れが生じた。` : ''));
  }

  scope.loop((dt) => {
    time += dt;
    if (!ended) {
      timeLeft -= dt;
      if (timeLeft <= 0) { timeLeft = 0; end(); }
    }
    if (reheating > 0) {
      reheating -= dt;
      T = Math.min(1080, T + 600 * dt);
      Sound.fire(0.8);
      if (reheating <= 0) Sound.fire(0);
    } else {
      T = Math.max(450, T - 34 * dt);
    }
    hammerT = Math.max(0, hammerT - dt);
    parts.update(dt);

    drawSmithy(g, W, H, heatGlow(T), -500);
    // 金床（横長）
    const ag = g.createLinearGradient(0, BASE, 0, BASE + 26);
    ag.addColorStop(0, '#5d5f66'); ag.addColorStop(0.15, '#2a2b30'); ag.addColorStop(1, '#121316');
    g.fillStyle = ag;
    g.fillRect(X0 - 30, BASE, X1 - X0 + 60, 26);
    g.fillStyle = '#100c09';
    g.fillRect(X0 - 10, BASE + 26, X1 - X0 + 20, H - BASE - 26);

    if (reheating > 0) {
      Sword.drawCoals(g, X0, BASE - 40, X1 - X0, 50, 1, time);
      g.font = 'bold 24px serif'; g.fillStyle = '#ffe2b0'; g.textAlign = 'center';
      g.fillText('火床で熱し直し中…', W / 2, 80);
    } else {
      // 延べ棒：各区画の高さで上面を作る
      const topFn = u => {
        const x = u * N - 0.5;
        const i = clamp(Math.floor(x), 0, N - 1), j = clamp(i + 1, 0, N - 1);
        const f = clamp(x - Math.floor(x), 0, 1);
        const hh = lerp(hgt[i], hgt[j], smooth(f));
        // 先端（切先）は細る
        const tip = u > 0.93 ? (u - 0.93) / 0.07 : 0;
        return (60 - hh) + tip * tip * hh * 0.7;
      };
      Sword.drawHotBar(g, X0, BASE - 60, X1 - X0, 60, T, { seed: 55, time, topFn, scale: 90, layers: 0 });
      // 目標ライン
      g.setLineDash([6, 5]);
      g.strokeStyle = 'rgba(255,255,255,0.75)';
      g.lineWidth = 1.5;
      g.beginPath();
      for (let i = 0; i < N; i++) {
        const y = BASE - target[i];
        i ? g.lineTo(X0 + SW * i, y) : g.moveTo(X0, y);
        g.lineTo(X0 + SW * (i + 1), y);
      }
      g.stroke();
      g.setLineDash([]);
      // ひび
      for (const ck of cracks) {
        const y0 = BASE - hgt[ck.i];
        g.strokeStyle = 'rgba(10,5,2,0.95)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(ck.x, y0); g.lineTo(ck.x + 4, y0 + 10); g.lineTo(ck.x - 2, y0 + 20); g.lineTo(ck.x + 3, y0 + 30); g.stroke();
      }
      // 区画の判定マーク
      g.font = '15px serif'; g.textAlign = 'center';
      for (let i = 0; i < N; i++) {
        const e = hgt[i] - target[i];
        const x = X0 + SW * (i + 0.5);
        const y = BASE - Math.max(hgt[i], target[i]) - 14;
        if (Math.abs(e) <= 1) { g.fillStyle = '#9fe0a0'; g.fillText('◯', x, y); }
        else if (e > 0) { g.fillStyle = '#ffb38a'; g.fillText('▼', x, y); }
        else { g.fillStyle = '#8ab8ff'; g.fillText('薄', x, y); }
      }
      if (hover >= 0) {
        g.fillStyle = 'rgba(255,255,255,0.07)';
        g.fillRect(X0 + SW * hover, 30, SW, BASE - 30);
      }
      // 鎚
      if (hammerT > 0 && hammerAt >= 0) {
        const x = X0 + SW * (hammerAt + 0.5);
        const y = BASE - hgt[hammerAt] - 40 - hammerT * 120;
        const hg = g.createLinearGradient(0, y, 0, y + 40);
        hg.addColorStop(0, '#5b5d63'); hg.addColorStop(1, '#141518');
        g.fillStyle = hg;
        g.fillRect(x - 24, y, 48, 40);
        g.fillStyle = '#5a3d22';
        g.fillRect(x + 20, y + 15, 120, 9);
      }
    }
    parts.draw(g);

    // 温度の目安
    const tc = heatRGB(T);
    ui.status.innerHTML =
      `<div class="stat"><span>鋼の色</span><i class="swatch" style="background:${rgbStr(tc)};box-shadow:0 0 12px ${rgbStr(tc, heatGlow(T))}"></i><b>${T < 700 ? '冷えている' : T < 850 ? '赤' : '橙'}</b></div>` +
      `<div class="stat"><span>鎚</span><b>${power === 'strong' ? '強' : '弱'}</b></div>` +
      `<div class="stat"><span>ひび</span><b>${cracks.length}</b></div>` +
      `<div class="stat"><span>残り</span><b>${Math.ceil(timeLeft)}</b> 秒</div>`;
  });
}

/* ============================================================
 * 四、土置き
 * ============================================================ */
const HAMON_N = 120;
const HAMON_PRESETS = {
  '直刃': u => 0.2 + 0.006 * Math.sin(u * 40),
  '湾れ': u => 0.24 + 0.08 * Math.sin(u * Math.PI * 4.2 + 0.4),
  '互の目': u => 0.18 + 0.12 * Math.pow(Math.abs(Math.sin(u * Math.PI * 13)), 0.7),
  '丁子': u => 0.2 + 0.16 * Math.pow(Math.abs(Math.sin(u * Math.PI * 15)), 2.5) + 0.06 * Math.abs(Math.sin(u * Math.PI * 4)),
  '皆焼風': u => 0.32 + 0.14 * Math.sin(u * Math.PI * 9) * Math.sin(u * Math.PI * 2.3)
};

function scoreHamon(h, drawn) {
  let inRange = 0, jag = 0;
  for (let i = 0; i < h.length; i++) {
    if (h[i] >= 0.1 && h[i] <= 0.6) inRange++;
    if (i > 0 && i < h.length - 1) jag += Math.abs(h[i + 1] - 2 * h[i] + h[i - 1]);
  }
  inRange /= h.length;
  jag /= h.length - 2;
  const jagPen = clamp((jag - 0.012) * 1400, 0, 40);
  const mean = h.reduce((a, b) => a + b, 0) / h.length;
  const narrowPen = mean < 0.14 ? 15 : 0;
  return clamp(Math.round(inRange * 100 - jagPen - narrowPen), 0, 100);
}

function stageClay({ root, scope, state, finish }) {
  const ui = stageLayout(root,
    '焼入れの前に<strong>焼刃土</strong>を置く。刀身の上をなぞって<strong>刃文の線</strong>を描け（線より刃側は土を薄く、棟側は厚く置く）。<br>' +
    '線が刃先に近すぎると刃が焼かれず、棟側に寄りすぎると折れやすくなる。型から選ぶこともできるが、<strong>自ら描いた刃文は独創性が評価される</strong>。');
  const [c, g] = makeCanvas(900, 260);
  c.style.touchAction = 'none';
  ui.view.append(c);
  const W = c.W, H = c.H;
  const SW = { x: 80, y: 138, length: 790, width: 120, sori: 0, nakago: false, polish: 0.15, folds: state.folds, seed: 7 };
  const G = Sword.geom(SW);
  let h = new Array(HAMON_N).fill(null);
  let preset = null;
  let drawing = false, lastI = -1;
  let clayAnim = 0, ended = false;

  const pos2tv = (x, y) => {
    const t = (x - SW.x) / SW.length;
    const v = 0.5 + (SW.y - y) / G.w(t);
    return [t, v];
  };
  const idxOf = t => Math.round(clamp(t / Sword.TK, 0, 1) * (HAMON_N - 1));

  function setPoint(x, y) {
    const [t, v] = pos2tv(x, y);
    if (t < -0.02 || t > Sword.TK + 0.03) { lastI = -1; return; }
    const i = idxOf(t), vv = clamp(v, 0.02, 0.92);
    if (lastI >= 0 && lastI !== i) {
      const a = Math.min(lastI, i), b = Math.max(lastI, i);
      const va = h[lastI] ?? vv;
      for (let k = a; k <= b; k++) {
        const f = (k - lastI) / (i - lastI);
        h[k] = lerp(va, vv, f);
      }
    } else h[i] = vv;
    lastI = i;
  }
  scope.on(c, 'pointerdown', e => {
    if (ended) return;
    if (preset) { h = new Array(HAMON_N).fill(null); preset = null; }
    drawing = true; lastI = -1;
    c.setPointerCapture(e.pointerId);
    setPoint(...canvasPos(c, e));
  });
  scope.on(c, 'pointermove', e => {
    if (!drawing || ended) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs) setPoint(...canvasPos(c, ev));
  });
  scope.on(c, 'pointerup', () => { drawing = false; });
  scope.on(c, 'pointercancel', () => { drawing = false; });

  const presetRow = el('div', 'preset-row');
  presetRow.append(el('span', 'label', '型：'));
  Object.keys(HAMON_PRESETS).forEach(name => {
    presetRow.append(btn(name, 'small', () => {
      const f = HAMON_PRESETS[name];
      h = Array.from({ length: HAMON_N }, (_, i) => f(i / (HAMON_N - 1)));
      preset = name;
    }));
  });
  const clearBtn = btn('描き直す', '', () => { h = new Array(HAMON_N).fill(null); preset = null; });
  const okBtn = btn('この刃文で土を置く', 'primary', () => decide());
  ui.controls.append(presetRow, clearBtn, okBtn);

  function filled() {
    const out = h.slice();
    const known = out.map((v, i) => v == null ? -1 : i).filter(i => i >= 0);
    if (!known.length) return out.fill(0.22);
    for (let i = 0; i < out.length; i++) {
      if (out[i] != null) continue;
      let a = -1, b = -1;
      for (const k of known) { if (k < i) a = k; else if (k > i) { b = k; break; } }
      if (a < 0) out[i] = out[b];
      else if (b < 0) out[i] = out[a];
      else out[i] = lerp(out[a], out[b], (i - a) / (b - a));
    }
    return out;
  }

  function decide() {
    if (ended) return;
    const cover = h.filter(v => v != null).length / HAMON_N;
    if (!preset && cover < 0.5) { ui.hint.classList.add('flash'); scope.timeout(() => ui.hint.classList.remove('flash'), 600); return; }
    ended = true;
    const hf = filled();
    let score = scoreHamon(hf);
    if (preset) score = Math.min(score, 80);
    else score = Math.round(score * (0.6 + 0.4 * cover));
    state.hamon = hf.map(v => Math.round(v * 1000) / 1000);
    state.hamonName = preset || '自作';
    state.clayScore = score;
    Sound.thud();
    scope.timeout(() => finish(score,
      (preset ? `「${preset}」の型で土を置いた。` : '自ら描いた刃文で土を置いた。') +
      (score >= 85 ? '土置きは申し分ない。' : score >= 60 ? '多少乱れがあるが、良い刃文になりそうだ。' : '土の線が乱れている。焼きが不安定になるだろう。')), 1400);
  }

  scope.loop(dt => {
    if (ended) clayAnim = Math.min(1, clayAnim + dt * 1.2);
    g.clearRect(0, 0, W, H);
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#2a2018'); bg.addColorStop(1, '#1a130e');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // 作業台の木目
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    for (let y = 8; y < H; y += 14) { g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(W * 0.3, y + 4, W * 0.6, y - 4, W, y + 2); g.stroke(); }

    const hf = filled();
    Sword.draw(g, { ...SW, hamon: ended ? hf : null, clay: ended ? clayAnim : 0, bg: '#1a130e' });

    // 危険帯の目安
    if (!ended) {
      g.save();
      g.fillStyle = 'rgba(220,60,40,0.16)';
      g.fill(bandPath(0, 0.1));
      g.fill(bandPath(0.6, 1));
      g.restore();
      // 線
      g.lineWidth = 3;
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(160,140,120,0.95)';
      g.beginPath();
      let started = false;
      for (let i = 0; i < HAMON_N; i++) {
        const v = preset ? h[i] : h[i];
        if (v == null) { started = false; continue; }
        const q = G.P(i / (HAMON_N - 1) * Sword.TK, v);
        if (!started) { g.moveTo(q[0], q[1]); started = true; } else g.lineTo(q[0], q[1]);
      }
      g.stroke();
      // 未描画部分（補間される）
      g.setLineDash([4, 6]);
      g.lineWidth = 1.5;
      g.strokeStyle = 'rgba(200,190,170,0.35)';
      g.beginPath();
      for (let i = 0; i < HAMON_N; i++) {
        const q = G.P(i / (HAMON_N - 1) * Sword.TK, hf[i]);
        i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]);
      }
      g.stroke();
      g.setLineDash([]);
      g.font = '13px serif'; g.fillStyle = 'rgba(255,200,180,0.7)'; g.textAlign = 'left';
      const e0 = G.P(0.06, 0.0), s0 = G.P(0.06, 1);
      g.fillText('刃先', e0[0], e0[1] + 18);
      g.fillText('棟', s0[0], s0[1] - 8);
    }
    function bandPath(v0, v1) {
      const p = new Path2D();
      for (let i = 0; i <= 40; i++) { const q = G.P(Sword.HABAKI + (Sword.TK - Sword.HABAKI) * i / 40, v1); i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1]); }
      for (let i = 40; i >= 0; i--) { const q = G.P(Sword.HABAKI + (Sword.TK - Sword.HABAKI) * i / 40, v0); p.lineTo(q[0], q[1]); }
      p.closePath(); return p;
    }
  });
}

/* ============================================================
 * 五、焼入れ
 * ============================================================ */
function stageQuench({ root, scope, state, finish }) {
  const TARGET = 790;
  const ui = stageLayout(root,
    '鍛冶場を暗くし、土を置いた刀身を火床で熱する。刀身が<strong>「月の出の色」</strong>（明るい赤橙）になった瞬間に<strong>水槽へ入れよ</strong>。<br>' +
    '早すぎれば焼きが入らず刃文が出ない。遅すぎれば<strong>焼割れ</strong>を起こす。温度計はない。<strong>色だけが頼り</strong>。　<kbd>Space</kbd> / ボタン：入水');
  const [c, g] = makeCanvas(900, 360);
  ui.view.append(c);
  const W = c.W, H = c.H;
  const parts = makeParticles();
  const swatch = el('div', 'ref-swatch');
  swatch.innerHTML = `<i style="background:${rgbStr(heatRGB(TARGET))};box-shadow:0 0 18px ${rgbStr(heatRGB(TARGET), 0.8)}"></i><span>月の出の色（目標）</span>`;
  const qBtn = btn('水に入れる！', 'primary big', () => quench());
  ui.controls.append(swatch, qBtn);

  let T = 380, time = 0, phase = 'heat', qT = 0, crack = false, anim = 0, soriNow = 0, finalSori = 0;
  let rateSeed = Math.random() * 10;
  const SW = { x: 120, y: 150, length: 720, width: 92, sori: 0, nakago: true, polish: 0.15, folds: state.folds, seed: 7, hamon: state.hamon, bg: '#050302' };

  scope.on(window, 'keydown', e => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); quench(); } });

  function quench() {
    if (phase !== 'heat') return;
    phase = 'quench';
    qT = T;
    const d = Math.abs(T - TARGET);
    crack = T > 860 && Math.random() < clamp((T - 840) / 90, 0.15, 0.95);
    if (state.shapeCracks && Math.random() < 0.15 * state.shapeCracks) crack = true;
    const q = clamp(1 - Math.max(0, d - 10) / 90, 0, 1);
    finalSori = 10 + 12 * q;
    state.quenchT = Math.round(T);
    state.crack = crack;
    state.hamonStrength = T < 700 ? 0.12 : T < 760 ? lerp(0.35, 1, (T - 700) / 60) : 1;
    state.sori = finalSori;
    Sound.sizzle(2.8);
    qBtn.disabled = true;
    anim = 0;
  }

  scope.loop(dt => {
    time += dt;
    if (phase === 'heat') {
      const rate = 52 + 34 * Math.sin(time * 1.1 + rateSeed) + 18 * Math.sin(time * 3.7 + rateSeed * 2);
      T += Math.max(18, rate) * dt * (T > 700 ? 0.85 : 1.6);
      Sound.fire(0.55);
      if (T >= 1000) quench();
    } else {
      Sound.fire(0);
      anim += dt;
      if (anim < 2.4) {
        if (anim > 0.35 && Math.random() < dt * 30) parts.steam(SW.x + SW.length / 2, 250, 3, 330);
        T = Math.max(25, T - dt * (anim > 0.35 ? 900 : 0));
        soriNow = lerp(0, finalSori, smooth(clamp((anim - 0.5) / 1.6, 0, 1)));
      } else if (phase === 'quench') {
        phase = 'done';
        if (crack) Sound.crack();
        const d = Math.abs(qT - TARGET);
        let score = Math.round(clamp(100 - Math.max(0, d - 8) * 1.15, 0, 100));
        if (crack) score = Math.round(score * 0.4);
        scope.timeout(() => finish(score,
          `入水時の温度は約${Math.round(qT)}℃。` +
          (crack ? '「ピシッ」…無情にも刃に焼割れが走った。' :
           qT < 700 ? '温度が低すぎた。焼きがほとんど入っていない。' :
           qT < 760 ? 'やや低い。刃文は淡く、刃の硬さも足りない。' :
           qT <= 825 ? '見事な焼入れ。刃文が冴え、美しい反りが生まれた。' :
           '高めの温度。沸が荒れ、刃が脆くなったかもしれぬ。')), 900);
      }
    }
    parts.update(dt);

    // 暗い鍛冶場
    g.fillStyle = '#050302';
    g.fillRect(0, 0, W, H);
    const inFire = phase === 'heat';
    const glowC = heatRGB(T);
    // 火床（長い）
    if (inFire) {
      Sword.drawCoals(g, 90, 170, 760, 60, 0.3 + 0.08 * Math.sin(time * 2), time, 33);
    } else {
      // 水槽
      g.fillStyle = '#1b130d';
      g.fillRect(70, 215, 800, 120);
      const wg = g.createLinearGradient(0, 230, 0, 335);
      wg.addColorStop(0, 'rgba(40,60,70,0.9)'); wg.addColorStop(1, 'rgba(8,14,18,0.95)');
      g.fillStyle = wg;
      g.fillRect(82, 230, 776, 100);
      g.fillStyle = '#2a1c12';
      g.fillRect(70, 215, 800, 15);
    }
    const dropY = inFire ? 0 : clamp(anim / 0.35, 0, 1) * 110 * (anim < 1.6 ? 1 : clamp(1 - (anim - 1.6) / 0.6, 0, 1));
    Sword.draw(g, { ...SW, y: SW.y + dropY, sori: soriNow, heat: T, clay: 1, shadow: false });
    if (inFire) Sword.drawCoals(g, 90, 200, 760, 30, 0.3, time + 5, 34);
    if (!inFire && anim < 2.0) {
      // 水面
      g.fillStyle = 'rgba(60,80,90,0.55)';
      g.fillRect(82, 230, 776, 4);
      // 沸騰の泡
      for (let i = 0; i < 30 * clamp(1.6 - anim, 0, 1); i++) {
        g.fillStyle = 'rgba(220,230,235,0.5)';
        g.beginPath(); g.arc(SW.x + Math.random() * SW.length, 234 + Math.random() * 30, 1 + Math.random() * 3, 0, TAU); g.fill();
      }
    }
    parts.draw(g);
    // 部屋をわずかに照らす
    const gl = heatGlow(T);
    g.save();
    g.globalCompositeOperation = 'lighter';
    const rg = g.createRadialGradient(W / 2, 170, 20, W / 2, 170, 520);
    rg.addColorStop(0, rgbStr(glowC, 0.08 * gl));
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, W, H);
    g.restore();
    ui.status.innerHTML = phase === 'heat' ? '<div class="stat"><span>静寂</span><b>息を殺して色を見極めよ…</b></div>' : '<div class="stat"><span>ジュッ——</span></div>';
  });
}

/* ============================================================
 * 六、研ぎ
 * ============================================================ */
function stagePolish({ root, scope, state, finish }) {
  const STONES = [
    { name: '備水砥', yomi: 'びんすいど', desc: '荒砥。刀の形を整える', min: 500, max: 1050, color: '#7a6a58', need: 3000 },
    { name: '改正名倉砥', yomi: 'かいせいなぐらど', desc: '中砥。荒砥の目を消す', min: 360, max: 760, color: '#9c8a74', need: 3200 },
    { name: '内曇砥', yomi: 'うちぐもりど', desc: '仕上砥。地鉄と刃文を引き出す', min: 220, max: 480, color: '#c2b8a4', need: 3400 }
  ];
  const ui = stageLayout(root,
    '研師として刀を研ぐ。刀身の上を<strong>左右にドラッグ</strong>して砥石を往復させよ。<br>' +
    '速度メーターの<strong>緑の範囲</strong>を保つこと。速すぎると<strong>研ぎ傷</strong>がつく。砥石は荒い順に細かくなり、仕上げほどゆっくり丁寧に。');
  const [c, g] = makeCanvas(900, 300);
  c.style.touchAction = 'none';
  ui.view.append(c);
  const W = c.W, H = c.H;
  const SW = { x: 110, y: 185, length: 740, width: 96, sori: Math.min(state.sori || 14, 20) * 0.8, nakago: true, folds: state.folds,
    seed: 7, hamon: state.hamon, hamonStrength: state.hamonStrength ?? 1, crack: state.crack, bg: '#1d1610' };
  let si = 0, prog = 0, scratches = [0, 0, 0], speed = 0, lastX = null, lastTime = 0, down = false;
  let stoneX = W / 2, lastScratch = 0, ended = false, time = 0, flash = 0;

  scope.on(c, 'pointerdown', e => {
    if (ended) return;
    down = true;
    c.setPointerCapture(e.pointerId);
    const [x] = canvasPos(c, e);
    lastX = x; lastTime = performance.now(); stoneX = x;
  });
  const up = () => { down = false; lastX = null; Sound.grind(0); };
  scope.on(c, 'pointerup', up);
  scope.on(c, 'pointercancel', up);
  scope.on(c, 'pointermove', e => {
    if (!down || ended) return;
    const [x] = canvasPos(c, e);
    const now = performance.now();
    const dt = Math.max(1, now - lastTime) / 1000;
    const dx = Math.abs(x - lastX);
    const inst = dx / dt;
    speed = speed * 0.75 + inst * 0.25;
    stoneX = clamp(x, SW.x + 40, SW.x + SW.length - 40);
    const st = STONES[si];
    let gain = dx / st.need;
    if (speed < st.min) gain *= 0.3;
    else if (speed > st.max) {
      gain *= 0.5;
      if (now - lastScratch > 350 && Math.random() < 0.55) {
        scratches[si]++;
        lastScratch = now;
        flash = 0.4;
        Sound.chisel();
      }
    }
    prog = Math.min(1, prog + gain);
    Sound.grind(clamp(speed / 1200, 0.1, 1), 1 + si * 0.35);
    lastX = x; lastTime = now;
    if (prog >= 1) nextStone();
  });

  function nextStone() {
    Sound.grind(0);
    Sound.chime();
    if (si < STONES.length - 1) {
      si++;
      prog = 0;
      down = false; lastX = null;
    } else {
      ended = true;
      const per = scratches.map((s, i) => clamp(100 - s * (i === 2 ? 9 : 6), 0, 100));
      const score = Math.round(per[0] * 0.25 + per[1] * 0.3 + per[2] * 0.45);
      state.polish = score;
      state.scratches = Math.round(scratches[2] + scratches[1] * 0.4 + scratches[0] * 0.1);
      scope.timeout(() => finish(score,
        score >= 90 ? '鏡のような地鉄に、刃文が冴え冴えと浮かび上がった。' :
        score >= 65 ? '地鉄の肌がよく見える。わずかに研ぎ傷が残る。' :
        '研ぎ傷が目立つ。せっかくの地鉄が曇っている。'), 1200);
    }
  }

  scope.loop(dt => {
    time += dt;
    flash = Math.max(0, flash - dt);
    if (!down) speed *= Math.pow(0.02, dt);
    g.clearRect(0, 0, W, H);
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#2b2219'); bg.addColorStop(1, '#16110c');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // 研ぎ桶の水面のにじみ
    g.fillStyle = 'rgba(80,90,100,0.08)';
    g.fillRect(0, 120, W, 140);

    const polish = clamp((si + prog) / STONES.length, 0, 1) * 0.95 + 0.05;
    const visScratches = Math.round(scratches[si] + (si > 0 ? scratches[si - 1] * 0.4 : 0));
    Sword.draw(g, { ...SW, polish: ended ? polish : polish * 0.9, scratches: visScratches });
    // 研ぎ汁（砥石の泥）：刀身の上だけに乗る
    if (!ended) {
      const G = Sword.geom(SW);
      const pth = new Path2D();
      for (let i = 0; i <= 60; i++) { const q = G.P(0.05 + 0.9 * i / 60, 1); i ? pth.lineTo(q[0], q[1]) : pth.moveTo(q[0], q[1]); }
      for (let i = 60; i >= 0; i--) { const q = G.P(0.05 + 0.9 * i / 60, 0); pth.lineTo(q[0], q[1]); }
      pth.closePath();
      g.save();
      g.clip(pth);
      g.filter = 'blur(6px)';
      const rs = rng(si * 31 + 5);
      for (let i = 0; i < 26; i++) {
        const q = G.P(0.06 + rs() * 0.88, rs());
        g.fillStyle = `rgba(${si === 2 ? '205,200,190' : '125,112,96'},${(0.18 + rs() * 0.15) * (1 - prog * 0.8)})`;
        g.beginPath(); g.ellipse(q[0], q[1], 20 + rs() * 50, 6 + rs() * 10, 0, 0, TAU); g.fill();
      }
      g.restore();
    }
    // 砥石
    if (!ended) {
      const st = STONES[si];
      const sx = stoneX, sy = SW.y - 12;
      g.save();
      g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 10; g.shadowOffsetY = 4;
      const sg = g.createLinearGradient(0, sy - 34, 0, sy + 34);
      sg.addColorStop(0, st.color); sg.addColorStop(1, 'rgba(40,30,20,1)');
      g.fillStyle = sg;
      g.globalAlpha = down ? 0.95 : 0.7;
      g.beginPath(); g.roundRect ? g.roundRect(sx - 55, sy - 32, 110, 54, 5) : g.rect(sx - 55, sy - 32, 110, 54); g.fill();
      g.restore();
      g.fillStyle = 'rgba(30,20,10,0.8)'; g.font = '13px serif'; g.textAlign = 'center';
      g.fillText(st.name, sx, sy);
      // 速度メーター
      const mx = 120, mw = 660, my = 28, MAXS = 1400;
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(mx - 8, my - 10, mw + 16, 30);
      g.fillStyle = 'rgba(120,200,120,0.4)';
      g.fillRect(mx + st.min / MAXS * mw, my - 4, (st.max - st.min) / MAXS * mw, 18);
      g.fillStyle = 'rgba(220,80,60,0.35)';
      g.fillRect(mx + st.max / MAXS * mw, my - 4, mw - st.max / MAXS * mw, 18);
      const nx = mx + clamp(speed / MAXS, 0, 1) * mw;
      g.fillStyle = flash > 0 ? '#ff6a50' : '#fff';
      g.fillRect(nx - 2, my - 8, 4, 26);
      g.fillStyle = '#c9b89a'; g.textAlign = 'left'; g.font = '12px serif';
      g.fillText('遅い', mx, my + 32); g.textAlign = 'right'; g.fillText('速すぎ（傷）', mx + mw, my + 32);
      if (flash > 0) {
        g.font = 'bold 22px serif'; g.fillStyle = `rgba(255,120,90,${flash * 2.5})`; g.textAlign = 'center';
        g.fillText('研ぎ傷！', W / 2, 90);
      }
    }
    const st = STONES[Math.min(si, STONES.length - 1)];
    ui.status.innerHTML =
      `<div class="stat"><span>砥石 ${si + 1}/3</span><b>${st.name}</b><small>（${st.yomi}）${st.desc}</small></div>` +
      meter('研ぎ', ended ? 1 : prog) +
      `<div class="stat"><span>研ぎ傷</span><b>${scratches.reduce((a, b) => a + b, 0)}</b></div>`;
  });
}

/* ============================================================
 * 七、銘切り
 * ============================================================ */
function stageMei({ root, scope, state, finish }) {
  const ui = stageLayout(root, '最後に、茎（なかご）へ<strong>鏨（たがね）で銘を切る</strong>。刀工としての名と、この刀に与える号を記せ。');
  const form = el('div', 'mei-form');
  form.innerHTML = `
    <label>刀工名<input id="mei-smith" maxlength="8" placeholder="例：正宗" autocomplete="off"></label>
    <label>刀の号（名前）<input id="mei-name" maxlength="10" placeholder="例：月影" autocomplete="off"></label>
    <p class="note">空欄の場合、刀工名は「無銘」となる。</p>`;
  const nakago = el('div', 'nakago-view');
  const text = el('div', 'nakago-text');
  nakago.append(text);
  ui.view.append(form, nakago);
  const smithI = form.querySelector('#mei-smith');
  const nameI = form.querySelector('#mei-name');
  smithI.value = localStorage.getItem('kaji.smith') || '';
  const go = btn('銘を切る', 'primary', () => carve());
  ui.controls.append(go);
  let ended = false;
  const preview = () => { text.textContent = smithI.value.trim() ? `${smithI.value.trim()}作` : '無銘'; };
  smithI.addEventListener('input', preview);
  preview();

  function carve() {
    if (ended) return;
    ended = true;
    go.disabled = true;
    smithI.disabled = nameI.disabled = true;
    const smith = smithI.value.trim();
    try { localStorage.setItem('kaji.smith', smith); } catch (e) { /* 保存できなくても続行 */ }
    state.smith = smith;
    state.name = nameI.value.trim() || '無名';
    state.date = reiwaDate();
    const omote = smith ? `${smith}作` : '無銘';
    const ura = smith ? state.date : '';
    text.innerHTML = '';
    const o = el('span', 'mei-omote'), u = el('span', 'mei-ura');
    text.append(o, u);
    const chars = [...omote].map(ch => [o, ch]).concat([...ura].map(ch => [u, ch]));
    let k = 0;
    const step = () => {
      if (k >= chars.length) { scope.timeout(() => finish(null, `銘「${omote}」${ura ? '、裏に「' + ura + '」' : ''}を切った。`), 700); return; }
      const [target, ch] = chars[k++];
      const s = el('span', 'chiseled', ch);
      target.append(s);
      Sound.chisel();
      scope.timeout(() => Sound.chisel(), 90);
      scope.timeout(step, 260);
    };
    step();
  }
}

const STAGES = [
  { id: 'select', no: '一', title: '玉鋼選び', yomi: 'たまはがねえらび', run: stageSelect,
    intro: '日本刀の材料は、砂鉄と木炭から「たたら製鉄」で作られる<strong>玉鋼</strong>。刀匠はまず玉鋼を割り、その破面を見て炭素量や不純物の少ない良質な部分を選び分ける。' },
  { id: 'forge', no: '二', title: '積み沸かし・折り返し鍛錬', yomi: 'つみわかし・おりかえしたんれん', run: stageForge,
    intro: '選んだ玉鋼を積み重ねて火床で<strong>沸かし</strong>、一つの塊にする。これを鎚で打ち延ばしては折り返す<strong>鍛錬</strong>を十数回繰り返し、不純物を火花として叩き出し、炭素量を整える。15回折り返せば層は3万を超える。' },
  { id: 'shape', no: '三', title: '素延べ・火造り', yomi: 'すのべ・ひづくり', run: stageShape,
    intro: '鍛えた鋼（皮鉄で心鉄を包んだもの）を細長く打ち延ばす<strong>素延べ</strong>。さらに小槌で棟・鎬・刃を打ち出し、切先を作って刀の姿にする<strong>火造り</strong>。刀の姿はここでほぼ決まる。' },
  { id: 'clay', no: '四', title: '土置き', yomi: 'つちおき', run: stageClay,
    intro: '粘土・炭の粉・砥石の粉を混ぜた<strong>焼刃土</strong>を刀身に塗る。刃側は薄く、棟側は厚く置くことで、焼入れの冷え方に差が生まれ、硬い刃と粘り強い地、そして<strong>刃文</strong>が生まれる。' },
  { id: 'quench', no: '五', title: '焼入れ', yomi: 'やきいれ', run: stageQuench,
    intro: '刀鍛冶の最も緊張する瞬間。火の色を見極めるため鍛冶場を暗くし、刀身を均一に熱して一気に水へ入れる。急冷で刃が硬化し、日本刀特有の<strong>反り</strong>が生まれる。' },
  { id: 'polish', no: '六', title: '研ぎ', yomi: 'とぎ', run: stagePolish,
    intro: '鍛冶押しを終えた刀は<strong>研師</strong>の手に渡る。荒砥から仕上砥まで十数種の砥石を使い分け、刀の姿を整え、地鉄の肌と刃文の美しさを引き出していく。' },
  { id: 'mei', no: '七', title: '銘切り', yomi: 'めいきり', run: stageMei,
    intro: '茎に鑢目をかけ、<strong>鏨</strong>で刀工の名（銘）と年紀を刻む。銘は刀匠がその出来に責任を持つ証である。' }
];
