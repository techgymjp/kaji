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
 * 一、積み沸かし・折り返し鍛錬
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
  let purity = 0.44;
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
 * 二、造り込み（皮鉄と心鉄の組み合わせ・沸かし付け）
 * ============================================================ */
const TSUKURI_METHODS = {
  kobuse: {
    name: '甲伏せ', yomi: 'こうぶせ',
    desc: 'U字に曲げた硬い<strong>皮鉄</strong>で、柔らかい<strong>心鉄</strong>を包む。最も広く用いられた造り込み。',
    pieces: ['shin'], tol: 30, mult: 1, tough: 1
  },
  sanmai: {
    name: '本三枚', yomi: 'ほんさんまい',
    desc: '左右の<strong>皮鉄</strong>で挟み、刃に<strong>刃鉄</strong>、中に<strong>心鉄</strong>を据える。組むのは難しいが、強く粘る刀になる。',
    pieces: ['ha', 'shin'], tol: 22, mult: 1.08, tough: 1.05
  },
  maru: {
    name: '丸鍛え', yomi: 'まるぎたえ',
    desc: '心鉄を入れず、一種類の鋼だけで鍛える古い造り。手間は少ないが、硬く折れやすい刀になる。',
    pieces: [], tol: 0, mult: 0.7, tough: 0.75
  }
};

function stageTsukuri({ root, scope, state, finish }) {
  const ui = stageLayout(root,
    '折り返し鍛錬した硬い<strong>皮鉄（かわがね）</strong>と、炭素の少ない柔らかい<strong>心鉄（しんがね）</strong>を組み合わせる。硬い皮で切れ味を、柔らかい芯で折れにくさを生む、日本刀ならではの工夫。<br>' +
    'まず<strong>造り込みの方法</strong>を選べ。');
  const [c, g] = makeCanvas(860, 400);
  const W = c.W, H = c.H;
  const parts = makeParticles();
  const CX = 430, BOTTOM = 330, TOP = 150;
  let method = null, M = null;
  let phase = 'choose';      // choose | place | drop | heat | strike | weld | done
  let pieceIdx = 0, swing = 0, swingT = 0, dropAnim = 0;
  const placed = [];         // { kind, dx }
  let T = 700, blowing = false, blowTimer = 0, heatQ = 0, strikes = [], marker = 0, mTime = 0, hammer = 0;
  let weldAnim = 0, time = 0, msg = '', msgT = 0;
  const say = (s, d = 1.2) => { msg = s; msgT = d; };

  // ---- 方法の選択
  const chooser = el('div', 'method-grid');
  Object.entries(TSUKURI_METHODS).forEach(([key, m]) => {
    const b = el('button', 'method');
    b.type = 'button';
    const [mc, mg] = makeCanvas(180, 120, 'method-canvas');
    drawSection(mg, 90, 108, 0.5, key, 1100, true);
    b.append(mc);
    b.append(el('div', 'method-info', `<h3>${m.name}<small>${m.yomi}</small></h3><p>${m.desc}</p>`));
    b.addEventListener('click', () => { Sound.click(); choose(key); });
    chooser.append(b);
  });
  ui.view.append(chooser);

  function choose(key) {
    method = key; M = TSUKURI_METHODS[key];
    chooser.remove();
    ui.view.append(c);
    if (M.pieces.length) {
      phase = 'place';
      ui.hint.innerHTML = `<strong>${M.name}</strong>：左右に揺れる${pieceLabel(M.pieces[0])}を、<strong>ちょうど中央に来た瞬間</strong>に落として組め。ずれると鋼が偏り、刃に心鉄が出てしまう。<br><kbd>Space</kbd> / クリック / ボタン：落とす`;
    } else {
      phase = 'heat';
      ui.hint.innerHTML = `<strong>${M.name}</strong>：組む鋼はない。そのまま沸かして鍛え締めよ。`;
      setHeatHint();
    }
    renderControls();
  }
  function pieceLabel(k) { return k === 'shin' ? '<strong>心鉄</strong>' : '<strong>刃鉄</strong>'; }
  function setHeatHint() {
    ui.hint.innerHTML = `<strong>沸かし付け</strong>：組んだ鋼をふいごで沸かし（黄白色・約1300℃）、鎚で打って一体に鍛着させる。温度が低いと鋼同士が付かず、<strong>鍛え割れ</strong>の元になる。<br>` +
      '<kbd>Space</kbd>長押し：ふいご ／ <kbd>Enter</kbd>：取り出す ／ <kbd>Space</kbd>：打つ';
  }

  // ---- 操作
  const dropBtn = btn('落とす', 'primary big', () => drop());
  const blowBtn = btn('ふいごを吹く（長押し）', 'primary hold');
  const takeBtn = btn('取り出して打つ', '', () => takeOut());
  const hitBtn = btn('打つ', 'primary big', () => strike());
  const startBlow = e => { e && e.preventDefault(); if (phase === 'heat') { blowing = true; Sound.init(); } };
  const stopBlow = () => { blowing = false; };
  scope.on(blowBtn, 'pointerdown', startBlow);
  scope.on(blowBtn, 'pointerup', stopBlow);
  scope.on(blowBtn, 'pointerleave', stopBlow);
  scope.on(blowBtn, 'pointercancel', stopBlow);
  scope.on(c, 'pointerdown', () => { if (phase === 'place') drop(); else if (phase === 'strike') strike(); });
  scope.on(window, 'keydown', e => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (e.repeat) return;
      if (phase === 'place') drop();
      else if (phase === 'heat') startBlow();
      else if (phase === 'strike') strike();
    } else if (e.code === 'Enter' && phase === 'heat') { e.preventDefault(); takeOut(); }
  });
  scope.on(window, 'keyup', e => { if (e.code === 'Space') stopBlow(); });

  function renderControls() {
    ui.controls.innerHTML = '';
    if (phase === 'place') ui.controls.append(dropBtn);
    else if (phase === 'heat') ui.controls.append(blowBtn, takeBtn);
    else if (phase === 'strike') ui.controls.append(hitBtn);
  }

  function drop() {
    if (phase !== 'place') return;
    placed.push({ kind: M.pieces[pieceIdx], dx: swing });
    phase = 'drop';
    dropAnim = 0;
    renderControls();
  }

  function takeOut() {
    if (phase !== 'heat') return;
    if (T < 900) { say('まだ沸いていない！'); return; }
    blowing = false;
    heatQ = clamp(1 - Math.abs(T - 1310) / 170, 0, 1);
    say(heatQ > 0.75 ? '良い沸き！' : T > 1430 ? '沸かしすぎ…' : '沸きが足りない', 1.2);
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
    Sound.clang(0.6 + q * 0.4, T < 950);
    parts.spark(570, 228, Math.round(10 + q * 40 * heatGlow(T) * 1.5), { T: T + 60 });
    say(q === 1 ? '会心！' : q > 0.5 ? '良し' : '外した…', 0.6);
    T -= 50;
    if (strikes.length >= 4) scope.timeout(() => { phase = 'weld'; weldAnim = 0; renderControls(); }, 350);
  }

  function end() {
    if (phase === 'done') return;
    phase = 'done';
    Sound.stopLoops();
    const place = placed.length ? placed.reduce((a, p) => a + clamp(1 - Math.max(0, Math.abs(p.dx) - 3) / M.tol, 0, 1), 0) / placed.length : 1;
    const sAvg = strikes.reduce((a, b) => a + b, 0) / strikes.length;
    const weld = heatQ * 0.4 + sAvg * 0.6;
    const raw = M.pieces.length ? 0.5 * place + 0.5 * weld : weld;
    const score = Math.round(clamp(raw * 100 * M.mult, 0, 100));
    state.method = method;
    state.methodName = M.name;
    state.methodTough = M.tough;
    state.coreOffset = placed.length ? placed[placed.length - 1].dx : 0;
    const off = placed.map(p => Math.abs(p.dx));
    const worst = off.length ? Math.max(...off) : 0;
    finish(score,
      `${M.name}で造り込んだ。` +
      (method === 'maru' ? '心鉄がないため、刃は硬いが折れやすい。' :
        worst <= 6 ? '心鉄が中央にぴたりと収まった。' :
        worst <= M.tol ? '心鉄がやや偏ったが、許容の内。' : '心鉄が大きく偏った。研ぎ減ると心鉄が刃に出るかもしれぬ。') +
      (weld > 0.75 ? '沸かし付けも見事で、鋼はしっかりと一体になった。' : weld > 0.45 ? '沸かし付けはまずまず。' : '鍛着が甘く、鍛え割れの恐れがある。'));
  }

  /* 断面図。key: 方法、T: 温度、ghost: 選択画面用のすべて配置済み表示 */
  function drawSection(gg, cx, bottom, scale, key, temp, ghost, offs = {}, hidden = {}) {
    const s = scale;
    const kawa = heatRGB(temp), shin = heatRGB(temp - 140), ha = heatRGB(temp + 40);
    const gl = heatGlow(temp);
    const shape = (pts, col, label) => {
      gg.beginPath();
      pts.forEach((p, i) => i ? gg.lineTo(cx + p[0] * s, bottom - p[1] * s) : gg.moveTo(cx + p[0] * s, bottom - p[1] * s));
      gg.closePath();
      gg.save();
      gg.shadowColor = rgbStr(col, 0.8 * gl);
      gg.shadowBlur = 18 * s * gl;
      gg.fillStyle = rgbStr(col);
      gg.fill();
      gg.restore();
      gg.strokeStyle = rgbStr(heatRGB(temp - 320), 0.9);
      gg.lineWidth = 1.2;
      gg.stroke();
      if (label && s > 0.8) {
        const cxl = pts.reduce((a, p) => a + p[0], 0) / pts.length, cyl = pts.reduce((a, p) => a + p[1], 0) / pts.length;
        gg.fillStyle = 'rgba(40,15,5,0.75)';
        gg.font = `bold ${15 * s}px "Shippori Mincho", serif`;
        gg.textAlign = 'center';
        gg.fillText(label, cx + cxl * s, bottom - cyl * s + 5);
      }
    };
    if (key === 'kobuse') {
      shape([[-80, 160], [-36, 160], [-36, 40], [36, 40], [36, 160], [80, 160], [80, 34], [52, 6], [0, 0], [-52, 6], [-80, 34]], kawa, '皮鉄');
      if (ghost || !hidden.shin) {
        const d = offs.shin || 0;
        shape([[-34 + d, 158], [34 + d, 158], [34 + d, 42], [-34 + d, 42]], shin, '心鉄');
      }
    } else if (key === 'sanmai') {
      shape([[-80, 160], [-36, 160], [-36, 10], [-60, 6], [-80, 30]], kawa, '');
      shape([[36, 160], [80, 160], [80, 30], [60, 6], [36, 10]], kawa, '');
      if (s > 0.8) {
        gg.fillStyle = 'rgba(40,15,5,0.75)'; gg.font = `bold ${15 * s}px "Shippori Mincho", serif`; gg.textAlign = 'center';
        gg.fillText('皮', cx - 58 * s, bottom - 90 * s); gg.fillText('鉄', cx - 58 * s, bottom - 70 * s);
        gg.fillText('皮', cx + 58 * s, bottom - 90 * s); gg.fillText('鉄', cx + 58 * s, bottom - 70 * s);
      }
      if (ghost || !hidden.ha) {
        const d = offs.ha || 0;
        shape([[-34 + d, 50], [34 + d, 50], [34 + d, 10], [0 + d, 0], [-34 + d, 10]], ha, '刃鉄');
      }
      if (ghost || !hidden.shin) {
        const d = offs.shin || 0;
        shape([[-34 + d, 158], [34 + d, 158], [34 + d, 52], [-34 + d, 52]], shin, '心鉄');
      }
    } else {
      shape([[-80, 160], [80, 160], [80, 34], [52, 6], [0, 0], [-52, 6], [-80, 34]], kawa, '鋼');
    }
  }

  /* 鍛着後の断面：一体になった鋼。心鉄・刃鉄のずれが偏りとして残る */
  function drawWelded(gg, temp, k) {
    const sy = lerp(1, 0.82, smooth(clamp(k * 1.5, 0, 1)));   // 打ち締めて低くなる
    const sx = lerp(1, 1.06, smooth(clamp(k * 1.5, 0, 1)));
    const P = (x, y) => [CX + x * sx, BOTTOM - y * sy];
    const poly = (pts, col, alpha = 1) => {
      gg.beginPath();
      pts.forEach((p, i) => { const q = P(p[0], p[1]); i ? gg.lineTo(q[0], q[1]) : gg.moveTo(q[0], q[1]); });
      gg.closePath();
      gg.fillStyle = rgbStr(col, alpha);
      gg.fill();
    };
    const outer = [[-80, 160], [80, 160], [80, 34], [52, 6], [0, 0], [-52, 6], [-80, 34]];
    const kawa = heatRGB(temp), shin = heatRGB(temp - 150), ha = heatRGB(temp + 50);
    gg.save();
    gg.shadowColor = rgbStr(kawa, 0.8 * heatGlow(temp)); gg.shadowBlur = 24;
    poly(outer, kawa);
    gg.restore();
    const off = kind => { const p = placed.find(q => q.kind === kind); return p ? clamp(p.dx * 0.45, -40, 40) : 0; };
    const seam = 1 - smooth(clamp(k * 1.3, 0, 1));                 // 境目が消えていく
    if (method === 'kobuse' || method === 'sanmai') {
      const d = off('shin');
      const yb = method === 'sanmai' ? 54 : 44;
      poly([[-30 + d, 150], [30 + d, 150], [30 + d, yb], [-30 + d, yb]], shin, 0.95);
      if (Math.abs(d) > 24) {                                      // 心鉄が表に出てしまう
        gg.fillStyle = '#ffb38a'; gg.font = '14px serif'; gg.textAlign = 'center';
        const q = P(d > 0 ? 80 : -80, 175);
        gg.fillText('心鉄が皮から出ている', q[0], q[1]);
      }
    }
    if (method === 'sanmai') {
      const d = off('ha');
      poly([[-30 + d, 50], [30 + d, 50], [30 + d, 10], [0 + d, 1], [-30 + d, 10]], ha, 0.95);
    }
    if (seam > 0.02 && method !== 'maru') {
      gg.strokeStyle = rgbStr(heatRGB(temp - 350), 0.7 * seam);
      gg.lineWidth = 1.5;
      gg.beginPath();
      [[-36, 160, -36, method === 'sanmai' ? 8 : 40], [36, 160, 36, method === 'sanmai' ? 8 : 40]].forEach(([x1, y1, x2, y2]) => {
        const a = P(x1, y1), b = P(x2, y2); gg.moveTo(a[0], a[1]); gg.lineTo(b[0], b[1]);
      });
      gg.stroke();
    }
    gg.strokeStyle = rgbStr(heatRGB(temp - 320), 0.9);
    gg.lineWidth = 1.2;
    gg.beginPath();
    outer.forEach((p, i) => { const q = P(p[0], p[1]); i ? gg.lineTo(q[0], q[1]) : gg.moveTo(q[0], q[1]); });
    gg.closePath(); gg.stroke();
    if (k > 0.5) {
      gg.fillStyle = `rgba(40,15,5,${0.7 * (k - 0.5) * 2})`;
      gg.font = 'bold 15px "Shippori Mincho", serif'; gg.textAlign = 'center';
      if (method !== 'maru') {
        const q1 = P(off('shin'), 105), q2 = P(off('shin') > 0 ? -60 : 60, 120);
        gg.fillText('心鉄', q1[0], q1[1]); gg.fillText('皮鉄', q2[0], q2[1]);
        if (method === 'sanmai') { const q3 = P(off('ha'), 22); gg.fillText('刃鉄', q3[0], q3[1]); }
      }
    }
  }

  renderControls();
  scope.loop(dt => {
    time += dt;
    msgT -= dt;
    hammer = Math.max(0, hammer - dt * 4);
    parts.update(dt);
    if (phase === 'choose') return;

    // ---- 更新
    if (phase === 'place') {
      swingT += dt * (0.55 + pieceIdx * 0.2);
      const f = swingT % 2;
      swing = (f < 1 ? f * 2 - 1 : 3 - f * 2) * 150;
      T = 1150 + Math.sin(time * 2) * 15;
    } else if (phase === 'drop') {
      dropAnim += dt / 0.35;
      if (dropAnim >= 1) {
        Sound.thud();
        Sound.clang(0.4, true);
        const dx = Math.abs(placed[placed.length - 1].dx);
        say(dx <= 6 ? 'ぴたり！' : dx <= M.tol ? '少しずれた' : '大きくずれた…', 1);
        pieceIdx++;
        if (pieceIdx < M.pieces.length) { phase = 'place'; renderControls(); }
        else {
          phase = 'placed';
          scope.timeout(() => { phase = 'heat'; T = 900; setHeatHint(); renderControls(); }, 900);
        }
      }
    } else if (phase === 'heat') {
      if (blowing) {
        T += (190 + Math.max(0, 1300 - T) * 0.12) * dt;
        blowTimer -= dt;
        if (blowTimer <= 0) { Sound.whoosh(); blowTimer = 0.5; }
      } else T += (T < 950 ? 25 : -35) * dt;
      T = Math.min(T, 1560);
      Sound.fire(blowing ? 0.9 : 0.4);
      if (T > 1250 && Math.random() < dt * 10) parts.spark(170 + rand(-50, 50), 205, 1, { T: 1400, angle: -Math.PI / 2, spread: 0.5, min: 100, max: 300 });
    } else if (phase === 'strike') {
      Sound.fire(0.2);
      T -= 20 * dt;
      mTime += dt * 0.75;
      const f = mTime % 2;
      marker = f < 1 ? f * 2 - 1 : 3 - f * 2;
    } else if (phase === 'weld') {
      weldAnim += dt / 2.2;
      T = Math.max(700, T - 100 * dt);
      if (weldAnim >= 1) end();
    }

    // ---- 描画
    const sectionView = phase === 'place' || phase === 'drop' || phase === 'placed' || phase === 'weld';
    if (sectionView) {
      // 断面を見下ろす作業台
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#120c09'); bg.addColorStop(1, '#1c130e');
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      const ag = g.createLinearGradient(0, BOTTOM, 0, BOTTOM + 30);
      ag.addColorStop(0, '#55575e'); ag.addColorStop(0.2, '#26272c'); ag.addColorStop(1, '#111215');
      g.fillStyle = ag; g.fillRect(200, BOTTOM, 460, 30);
      g.fillStyle = '#c9b89a'; g.font = '13px serif'; g.textAlign = 'left';
      g.fillText('断面図', 24, 30);
      const offs = {}, hidden = {};
      M.pieces.forEach(k => { hidden[k] = true; });
      placed.forEach((p, i) => {
        if (phase === 'drop' && i === placed.length - 1) return;
        hidden[p.kind] = false; offs[p.kind] = p.dx;
      });
      if (phase === 'weld') drawWelded(g, T, weldAnim);
      else drawSection(g, CX, BOTTOM, 1, method, 1150, false, offs, hidden);
      // 揺れている / 落下中のピース
      const drawPiece = (kind, dx, yTop) => {
        const col = kind === 'shin' ? heatRGB(1010) : heatRGB(1190);
        const h = kind === 'shin' ? 106 : 46;
        g.save();
        g.shadowColor = rgbStr(col, 0.7); g.shadowBlur = 16;
        g.fillStyle = rgbStr(col);
        g.fillRect(CX - 34 + dx, yTop, 68, h);
        g.restore();
        g.strokeStyle = 'rgba(60,20,5,0.9)'; g.strokeRect(CX - 34 + dx, yTop, 68, h);
        g.fillStyle = 'rgba(40,15,5,0.75)'; g.font = 'bold 15px "Shippori Mincho", serif'; g.textAlign = 'center';
        g.fillText(kind === 'shin' ? '心鉄' : '刃鉄', CX + dx, yTop + h / 2 + 5);
        // 箸（鋏）
        g.strokeStyle = '#2b2b2f'; g.lineWidth = 5;
        g.beginPath(); g.moveTo(CX + dx - 20, yTop + 4); g.lineTo(CX + dx - 60, yTop - 60); g.moveTo(CX + dx + 20, yTop + 4); g.lineTo(CX + dx + 60, yTop - 60); g.stroke();
      };
      if (phase === 'place') {
        const k = M.pieces[pieceIdx];
        drawPiece(k, swing, 40);
        // 中央の目印
        g.setLineDash([5, 6]); g.strokeStyle = 'rgba(232,198,108,0.6)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(CX, 20); g.lineTo(CX, BOTTOM); g.stroke(); g.setLineDash([]);
      } else if (phase === 'drop') {
        const p = placed[placed.length - 1];
        const restTop = BOTTOM - (p.kind === 'shin' ? 158 : 50);
        drawPiece(p.kind, p.dx, lerp(40, restTop, smooth(clamp(dropAnim, 0, 1))));
      }
      if (phase === 'weld') {
        g.font = 'bold 28px "Shippori Mincho", serif'; g.textAlign = 'center'; g.fillStyle = '#ffe9c4';
        g.fillText('鍛着！', CX, 90);
      }
    } else {
      // 沸かし付け：鍛冶場
      drawSmithy(g, W, H, heatGlow(T), 470);
      g.fillStyle = '#2b1c14'; g.fillRect(40, H * 0.72 - 40, 240, 70);
      g.fillStyle = '#3a271b'; g.fillRect(30, H * 0.72 - 50, 260, 14);
      const inFire = phase === 'heat';
      Sword.drawCoals(g, 55, H * 0.72 - 70, 210, 50, inFire ? (blowing ? 1 : 0.35) : 0.2, time);
      const bx = inFire ? 85 : 500, by = inFire ? H * 0.72 - 78 : H * 0.72 - 50 - 40;
      Sword.drawHotBar(g, bx, by, 150, 40, T, { seed: 91, time, layers: 3, scale: 50 });
      if (inFire) Sword.drawCoals(g, 55, H * 0.72 - 50, 210, 26, blowing ? 1 : 0.35, time + 3, 21);
      if (phase === 'strike' || hammer > 0) {
        const lift = phase === 'strike' ? (1 - hammer) : 1;
        const hy = by - 22 - lift * 70;
        g.save(); g.translate(570, hy); g.rotate(-0.25 * lift);
        g.fillStyle = '#5a3d22'; g.fillRect(20, -6, 150, 9);
        const hg = g.createLinearGradient(0, -22, 0, 22);
        hg.addColorStop(0, '#5b5d63'); hg.addColorStop(0.5, '#2a2b2f'); hg.addColorStop(1, '#141518');
        g.fillStyle = hg; g.fillRect(-26, -20, 52, 40);
        g.restore();
      }
      // 温度計
      const gx = W - 52, gy = 40, gh = 260;
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(gx - 8, gy - 8, 40, gh + 16);
      for (let i = 0; i < gh; i++) { g.fillStyle = rgbStr(heatRGB(1550 - (i / gh) * 1050)); g.fillRect(gx, gy + i, 24, 1); }
      const yOf = tt => gy + (1550 - tt) / 1050 * gh;
      g.strokeStyle = '#e8c66c'; g.lineWidth = 2; g.strokeRect(gx - 3, yOf(1380), 30, yOf(1240) - yOf(1380));
      const ty = yOf(clamp(T, 500, 1550));
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(gx - 6, ty); g.lineTo(gx - 16, ty - 6); g.lineTo(gx - 16, ty + 6); g.fill();
      if (phase === 'strike') {
        const tx = 360, tw = 380, ty2 = 50;
        g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(tx - 10, ty2 - 16, tw + 20, 32);
        g.fillStyle = 'rgba(232,198,108,0.25)'; g.fillRect(tx + tw / 2 - tw * 0.09, ty2 - 10, tw * 0.18, 20);
        g.fillStyle = 'rgba(232,198,108,0.7)'; g.fillRect(tx + tw / 2 - tw * 0.035, ty2 - 10, tw * 0.07, 20);
        g.fillStyle = '#fff'; g.fillRect(tx + tw / 2 + marker * tw / 2 - 2, ty2 - 14, 4, 28);
        g.fillStyle = '#c9b89a'; g.font = '13px serif'; g.textAlign = 'left';
        g.fillText(`鎚 ${strikes.length + 1} / 4`, tx, ty2 + 34);
      }
    }
    parts.draw(g);
    if (msgT > 0) {
      g.font = 'bold 26px "Shippori Mincho", serif'; g.textAlign = 'center';
      g.fillStyle = `rgba(255,236,200,${clamp(msgT * 2, 0, 1)})`;
      g.fillText(msg, W / 2 - 40, 130);
    }
    ui.status.innerHTML =
      `<div class="stat"><span>造り込み</span><b>${M.name}</b></div>` +
      (M.pieces.length ? `<div class="stat"><span>組み</span><b>${Math.min(placed.length, M.pieces.length)} / ${M.pieces.length}</b></div>` : '') +
      `<div class="stat"><span>工程</span><b>${phase === 'place' || phase === 'drop' || phase === 'placed' ? '組み合わせ' : '沸かし付け'}</b></div>`;
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
  { id: 'forge', no: '一', title: '積み沸かし・折り返し鍛錬', yomi: 'つみわかし・おりかえしたんれん', run: stageForge,
    intro: '日本刀の材料は、砂鉄と木炭から「たたら製鉄」で作られる<strong>玉鋼</strong>。この玉鋼を小さく割って積み重ね、火床で<strong>沸かし</strong>、一つの塊にする。これを鎚で打ち延ばしては折り返す<strong>鍛錬</strong>を十数回繰り返し、不純物を火花として叩き出し、炭素量を整える。こうして刀の外側を覆う硬い<strong>皮鉄</strong>ができる。15回折り返せば層は3万を超える。' },
  { id: 'tsukuri', no: '二', title: '造り込み', yomi: 'つくりこみ', run: stageTsukuri,
    intro: '鍛えた硬い<strong>皮鉄</strong>と、炭素の少ない柔らかい<strong>心鉄</strong>を組み合わせる。甲伏せ・本三枚などの方法があり、皮鉄で心鉄を包んで<strong>沸かし付け</strong>、一本の鋼にする。「折れず、曲がらず、よく切れる」日本刀の秘密はこの組み合わせにある。' },
  { id: 'shape', no: '三', title: '素延べ・火造り', yomi: 'すのべ・ひづくり', run: stageShape,
    intro: '造り込んだ鋼を細長く打ち延ばす<strong>素延べ</strong>。さらに小槌で棟・鎬・刃を打ち出し、切先を作って刀の姿にする<strong>火造り</strong>。刀の姿はここでほぼ決まる。' },
  { id: 'clay', no: '四', title: '土置き', yomi: 'つちおき', run: stageClay,
    intro: '粘土・炭の粉・砥石の粉を混ぜた<strong>焼刃土</strong>を刀身に塗る。刃側は薄く、棟側は厚く置くことで、焼入れの冷え方に差が生まれ、硬い刃と粘り強い地、そして<strong>刃文</strong>が生まれる。' },
  { id: 'quench', no: '五', title: '焼入れ', yomi: 'やきいれ', run: stageQuench,
    intro: '刀鍛冶の最も緊張する瞬間。火の色を見極めるため鍛冶場を暗くし、刀身を均一に熱して一気に水へ入れる。急冷で刃が硬化し、日本刀特有の<strong>反り</strong>が生まれる。' },
  { id: 'polish', no: '六', title: '研ぎ', yomi: 'とぎ', run: stagePolish,
    intro: '鍛冶押しを終えた刀は<strong>研師</strong>の手に渡る。荒砥から仕上砥まで十数種の砥石を使い分け、刀の姿を整え、地鉄の肌と刃文の美しさを引き出していく。' },
  { id: 'mei', no: '七', title: '銘切り', yomi: 'めいきり', run: stageMei,
    intro: '茎に鑢目をかけ、<strong>鏨</strong>で刀工の名（銘）と年紀を刻む。銘は刀匠がその出来に責任を持つ証である。' }
];
