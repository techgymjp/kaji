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


const HAMON_N = 120;
const HAMON_PRESETS = {
  '直刃': u => 0.2 + 0.006 * Math.sin(u * 40),
  '湾れ': u => 0.24 + 0.08 * Math.sin(u * Math.PI * 4.2 + 0.4),
  '互の目': u => 0.18 + 0.12 * Math.pow(Math.abs(Math.sin(u * Math.PI * 13)), 0.7),
  '丁子': u => 0.2 + 0.16 * Math.pow(Math.abs(Math.sin(u * Math.PI * 15)), 2.5) + 0.06 * Math.abs(Math.sin(u * Math.PI * 4)),
  '皆焼風': u => 0.32 + 0.14 * Math.sin(u * Math.PI * 9) * Math.sin(u * Math.PI * 2.3)
};


/* 刀の名前の候補（実在の名刀の号は避ける） */
const SWORD_NAMES = ['月影', '村雨', '朧月', '白露', '霞', '春雷', '時雨', '夕凪', '東雲', '青嵐', '初霜', '緋桜'];

/* 一続きの作刀の区切り（進行表示と遊び方に使う） */
const SECTIONS = [
  { id: 'kawa', no: '一', title: L('皮鉄の鍛錬', 'Skin Steel'), yomi: L('かわがね', 'Kawagane'),
    how: L('叩いて伸ばし、切れ目を入れて折り返す。5回繰り返す。', 'Hammer it out, notch it, fold it. Five times.') },
  { id: 'shin', no: '二', title: L('心鉄造り', 'Core Steel'), yomi: L('しんがね', 'Shingane'),
    how: L('柔らかい心鉄を叩いて締める。', 'Hammer the soft core steel tight.') },
  { id: 'tsukuri', no: '三', title: L('造り込み', 'Lamination'), yomi: L('つくりこみ', 'Tsukurikomi'),
    how: L('皮鉄を叩いてU字に曲げ、心鉄を包んで鍛着する。', 'Bend the skin steel into a U and weld it around the core.') },
  { id: 'nobashi', no: '四', title: L('打ち延ばし', 'Drawing Out'), yomi: L('うちのばし', 'Uchinobashi'),
    how: L('刀の長さまで打ち延ばし、切先を打ち出す。', 'Draw it out to a blade and form the tip.') },
  { id: 'yaki', no: '五', title: L('焼入れ', 'Quench'), yomi: L('やきいれ', 'Yaki-ire'),
    how: L('自動。ジュワッと水に入れ、反りが生まれる。', 'Automatic. Into the water — hiss — and the curve appears.') }
];

/* ============================================================
 * 作刀：基本は叩くだけ。
 *  師匠の小槌「トン」に続けて、半拍後に大鎚で「カン」。
 *  皮鉄の鍛錬（折り返し5回）→ 心鉄造り → 造り込み → 打ち延ばし → 焼入れ（自動）
 *  冷えたら自動で火床に戻して沸かし直す。
 * ============================================================ */
function stageKatana({ root, scope, state, finish, section }) {
  const ui = stageLayout(root,
    L('師匠の<strong>「トン」</strong>に続けて<strong>「カン」</strong>と打て。どこを叩いてもよい', 'After the master’s <strong>“tonk”</strong>, strike <strong>“KAN!”</strong> — tap anywhere') +
    L('<span class="keys">（<kbd>Space</kbd>）</span>', '<span class="keys"> (<kbd>Space</kbd>)</span>'));
  const [c, g] = makeCanvas(860, 420);
  c.style.touchAction = 'none';
  ui.view.append(c);
  const W = c.W, H = c.H;
  const parts = makeParticles();
  const CX = 570, AY = H * 0.72 - 50;
  const KAWA_FOLDS = 5, KAWA_LEN = 150, KAWA_AREA = KAWA_LEN * 36;
  const NOB_X = 70, NOB_MAX = 700;

  let T = 1300;
  let purity = 0.44, carbon = 0.88 + Math.random() * 0.04;
  let folds = 0, time = 0, msg = '', msgT = 0, shake = 0, combo = 0, maxCombo = 0;
  const acc = { kawa: [], shin: [], tsukuri: [], nobashi: [] };

  // 鋼の状態
  let len = KAWA_LEN, notch = false, seam = 0, foldAnim = -1;     // 皮鉄
  let shinLen = 110, shinTight = 0;                               // 心鉄
  let bendK = 0, coreIn = 0, closeK = 0, coreOff = 0, tseam = 1;   // 造り込み
  let nobLen = 150, tipK = 0;                                     // 打ち延ばし

  // 手順
  const steps = [];
  for (let f = 0; f < KAWA_FOLDS; f++) {
    steps.push({ s: 'kawa', k: 'spread', p: 0.2 }, { s: 'kawa', k: 'spread', p: 0.45 }, { s: 'kawa', k: 'spread', p: 0.7 }, { s: 'kawa', k: 'spread', p: 0.9 },
      { s: 'kawa', k: 'notch' }, { s: 'kawa', k: 'fold' }, { s: 'kawa', k: 'weld', p: 0.3 }, { s: 'kawa', k: 'weld', p: 0.7 });
  }
  [0.2, 0.5, 0.8, 0.35, 0.65].forEach(p => steps.push({ s: 'shin', k: 'pack', p }));
  steps.push({ s: 'tsukuri', k: 'bend', p: -1 }, { s: 'tsukuri', k: 'bend', p: 1 }, { s: 'tsukuri', k: 'insert', auto: true },
    { s: 'tsukuri', k: 'close', p: -1 }, { s: 'tsukuri', k: 'close', p: 1 }, { s: 'tsukuri', k: 'weld', p: 0 }, { s: 'tsukuri', k: 'weld', p: 0 });
  for (let i = 0; i < 8; i++) steps.push({ s: 'nobashi', k: 'draw', p: 0.1 + i * 0.11 });
  steps.push({ s: 'nobashi', k: 'tip' }, { s: 'nobashi', k: 'tip' });
  const MUST = { notch: 1, fold: 1, bend: 1, close: 1, tip: 1 };   // 打ち逃したらやり直す手順
  let si = 0, curSec = -1;

  // 進行モード
  let mode = 'banner';          // banner | beat | reheat | anim | yaki | done
  let modeT = 0;
  let beat = 0.7, nextBeat = 0, target = null, targetAt = 0, struck = false;
  let masterFx = 0, hammerFx = null;
  // 焼入れ
  let yk = null;

  const say = (s, d = 1.0) => { msg = s; msgT = d; };
  const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const secIndex = id => SECTIONS.findIndex(s => s.id === id);

  const hitBtn = btn(L('カン！', 'KAN!'), 'primary big hit', () => strike());
  ui.controls.append(hitBtn);
  scope.on(c, 'pointerdown', e => { e.preventDefault(); strike(); });
  scope.on(window, 'keydown', e => {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      if (!e.repeat) strike();
    }
  });

  function enterSection(id) {
    curSec = secIndex(id);
    section && section(curSec);
    mode = 'banner'; modeT = 1.3;
    target = null;
    if (id === 'yaki') Music.setMood('tense');
  }
  enterSection('kawa');

  /* 現在の鋼の上面の高さ（狙いの輪を出す位置） */
  function topY(x) {
    const st = steps[si] || {};
    if (st.s === 'kawa') return AY - KAWA_AREA / len;
    if (st.s === 'shin') return AY - 4400 / shinLen;
    if (st.s === 'tsukuri') return st.k === 'weld' || st.k === 'close' ? AY - 24 - 80 : AY - 24;
    const h = lerp(56, 22, clamp((nobLen - 150) / (NOB_MAX - 150), 0, 1));
    return AY - h;
  }
  function targetX(st) {
    if (st.s === 'kawa') {
      if (st.k === 'notch') return CX;
      if (st.k === 'fold') return CX + len / 2 - 14;
      return CX - len / 2 + len * st.p;
    }
    if (st.s === 'shin') return CX - shinLen / 2 + shinLen * st.p;
    if (st.s === 'tsukuri') {
      if (st.k === 'bend') return CX + st.p * 95 * (1 - bendK * 0.6);
      if (st.k === 'close') return CX + st.p * 48;
      return CX + coreOff;
    }
    if (st.k === 'tip') return NOB_X + nobLen - 18;
    return NOB_X + nobLen * st.p;
  }

  function strike() {
    if (mode !== 'beat' || foldAnim >= 0) return;
    Sound.init();
    const st = steps[si];
    let q;
    if (target && !struck) {
      const d = Math.abs(time - targetAt);
      q = d < 0.07 ? 1 : d < 0.15 ? 0.65 : 0.3;
    } else q = 0.15;
    const x = target ? target.x : targetX(st);
    hammerFx = { x, y: topY(x), t: 0 };
    shake = 3 + q * 7;
    T -= 11;
    Sound.clang(0.45 + q * 0.55, T < 1000);
    if (navigator.vibrate) { try { navigator.vibrate(q >= 0.65 ? 18 : 8); } catch (e) { /* 無視 */ } }
    if (q >= 0.65) { combo++; maxCombo = Math.max(maxCombo, combo); } else combo = 0;
    parts.spark(x, topY(x), Math.round(8 + q * 30 * Math.max(0.3, heatGlow(T)) * (1.6 - purity)), { T: T + 80 });
    if (!target || struck) { say(L('拍子が早い', 'Too early'), 0.5); return; }
    struck = true;
    acc[st.s].push(q);
    const hf = clamp((T - 850) / 450, 0.2, 1);
    apply(st, q, hf);
    const label = q === 1 ? L('会心！', 'Perfect!') : q >= 0.65 ? L('良し', 'Good') : L('ずれた', 'Off beat');
    if (!msgT || msgT < 0.6) say(combo >= 3 && q >= 0.65 ? `${label}　${combo}${L('連', ' combo')}` : label, 0.55);
    advance();
  }

  function apply(st, q, hf) {
    if (st.s === 'kawa') {
      if (st.k === 'spread') {
        len += 34 * (0.35 + 0.65 * q) * hf;
        purity += (1 - purity) * 0.07 * q * hf;
        const nextIsNotch = steps[si + 1] && steps[si + 1].k === 'notch';
        if (nextIsNotch && len < KAWA_LEN * 1.75) steps.splice(si + 1, 0, { s: 'kawa', k: 'spread', p: 0.3 + Math.random() * 0.5 });
      } else if (st.k === 'notch') {
        notch = true; Sound.chisel(); scope.timeout(() => Sound.chisel(), 90);
      } else if (st.k === 'fold') {
        foldAnim = 0; Sound.thud();
      } else if (st.k === 'weld') {
        seam = Math.max(0, seam - 0.55 * q * clamp((T - 1050) / 200, 0.25, 1));
        purity += (1 - purity) * 0.03 * q;
        const last = !steps[si + 1] || steps[si + 1].k !== 'weld';
        if (last) {
          if (seam > 0.3) { purity -= 0.02 * seam; say(L('鍛着が甘い…', 'Weak weld…'), 1); }
          else say(L(`${folds}回目、鍛着！`, `Fold ${folds} welded!`), 1);
          seam = 0;
        }
      }
      purity = clamp(purity, 0.3, 0.995);
    } else if (st.s === 'shin') {
      shinLen = Math.min(KAWA_LEN, shinLen + 9 * (0.4 + 0.6 * q));
      shinTight += 0.2 * q;
    } else if (st.s === 'tsukuri') {
      if (st.k === 'bend') bendK = Math.min(1, bendK + 0.5);
      else if (st.k === 'close') closeK = Math.min(1, closeK + 0.5);
      else if (st.k === 'weld') tseam = Math.max(0, tseam - 0.5 * q - 0.1);
    } else if (st.s === 'nobashi') {
      if (st.k === 'draw') nobLen = Math.min(NOB_MAX, nobLen + (NOB_MAX - 150) / 8);
      else tipK = Math.min(1, tipK + 0.5);
    }
  }

  function advance() {
    si++;
    const st = steps[si];
    if (!st) { scope.timeout(startYaki, 500); mode = 'anim'; target = null; return; }
    if (st.s !== SECTIONS[curSec].id) scope.timeout(() => enterSection(st.s), 350);
  }

  function startYaki() {
    const accAll = avg([...acc.kawa, ...acc.shin, ...acc.tsukuri, ...acc.nobashi]);
    const qq = clamp(0.5 + 0.5 * accAll + rand(-0.08, 0.08), 0, 1);
    const crack = Math.random() < (1 - accAll) * 0.15;
    const quenchT = Math.round(790 + (1 - qq) * (Math.random() < 0.5 ? -1 : 1) * 90);
    const hamonName = accAll >= 0.85 ? '丁子' : accAll >= 0.7 ? '互の目' : accAll >= 0.55 ? '湾れ' : '直刃';
    const f = HAMON_PRESETS[hamonName];
    yk = { t: 0, accAll, qq, crack, quenchT, hamonName, hamon: Array.from({ length: HAMON_N }, (_, i) => f(i / (HAMON_N - 1))), sori: 10 + 12 * qq, sizzled: false };
    enterSection('yaki');
  }

  function end() {
    if (mode === 'done') return;
    mode = 'done';
    Sound.stopLoops();
    const carbonScore = clamp(1 - Math.abs(carbon - 0.68) / 0.3, 0, 1);
    state.scores = {
      kawa: Math.round(clamp((purity - 0.45) / 0.5 * 80 + carbonScore * 20, 0, 100)),
      shin: Math.round(avg(acc.shin) * 100),
      tsukuri: Math.round(avg(acc.tsukuri) * 100 * (1 - Math.abs(coreOff) / 40)),
      nobashi: Math.round(avg(acc.nobashi) * 100),
      quench: Math.round(yk.qq * 100 * (yk.crack ? 0.4 : 1))
    };
    Object.assign(state, {
      folds, purity, carbon, maxCombo,
      grain: yk.accAll >= 0.6 ? 'itame' : 'mokume',
      jiFolds: Math.round(8 + purity * 7),
      methodName: '甲伏せ',
      hamon: yk.hamon, hamonName: yk.hamonName,
      hamonStrength: yk.qq >= 0.6 ? 1 : lerp(0.3, 1, yk.qq / 0.6),
      polish: Math.round(70 + 30 * yk.accAll), scratches: 0,
      sori: yk.sori, crack: yk.crack, quenchT: yk.quenchT
    });
    state.grainName = state.grain === 'itame' ? '板目肌' : '杢目肌';
    finish(null, '');
  }

  // ---------- 描画
  function drawKawa() {
    const h = KAWA_AREA / len, bx = CX - len / 2, by = AY - h;
    const opt = { seed: 17 + folds, time, layers: Math.min(folds * 2, 10), scale: Math.round((1 - purity) * 160) };
    if (foldAnim >= 0) {
      const half = len / 2;
      Sword.drawHotBar(g, bx, by, half, h, T, opt);
      g.save(); g.translate(CX, by); g.rotate(-Math.PI * smooth(foldAnim));
      Sword.drawHotBar(g, 0, 0, half, h, T - 30, opt);
      g.restore();
      return;
    }
    Sword.drawHotBar(g, bx, by, len, h, T, opt);
    if (notch) {
      g.fillStyle = 'rgba(20,8,4,0.9)';
      g.beginPath(); g.moveTo(CX - 7, by); g.lineTo(CX + 7, by); g.lineTo(CX, by + h * 0.5); g.closePath(); g.fill();
    }
    if (seam > 0) {
      g.strokeStyle = `rgba(30,10,4,${0.8 * seam})`; g.lineWidth = 2;
      g.beginPath(); g.moveTo(bx + 3, by + h / 2); g.lineTo(bx + len - 3, by + h / 2); g.stroke();
    }
  }

  function drawShin() {
    const h = 4400 / shinLen;
    Sword.drawHotBar(g, CX - shinLen / 2, AY - h, shinLen, h, T - 40, { seed: 77, time, scale: Math.round(90 * (1 - Math.min(1, shinTight))) });
    // 鍛え終えた皮鉄が脇に控える
    Sword.drawHotBar(g, 60, AY + 34, 150, 22, Math.max(650, T - 380), { seed: 18, time, scale: 30, layers: 6 });
    label(L('心鉄', 'Core'), CX, AY - h - 40);
    label(L('皮鉄', 'Skin'), 135, AY + 26);
  }

  function label(text, x, y) {
    g.font = `bold ${fs(c, 16, 1.8)}px "Shippori Mincho", serif`;
    g.textAlign = 'center'; g.fillStyle = 'rgba(255,230,200,0.85)';
    g.fillText(text, x, y);
  }

  /* 造り込み：断面図。皮鉄の板が叩かれてU字になり、心鉄を包む */
  function drawTsukuri() {
    const kc = heatRGB(T), sc = heatRGB(T - 120), gl = heatGlow(T);
    const piece = (fn, col) => {
      g.save();
      g.shadowColor = rgbStr(col, 0.7 * gl); g.shadowBlur = 16;
      g.fillStyle = rgbStr(col);
      g.beginPath(); fn(); g.fill();
      g.restore();
      g.strokeStyle = rgbStr(heatRGB(T - 320), 0.9); g.lineWidth = 1.2;
      g.beginPath(); fn(); g.stroke();
    };
    const BASE = 60, TH = 24, WL = 80;
    const ang = (Math.PI / 2) * smooth(bendK) + closeK * 0.05;
    // 底
    piece(() => g.rect(CX - BASE, AY - TH, BASE * 2, TH), kc);
    // 左右の壁（底の端を軸に起き上がる）
    [[-1, CX - BASE], [1, CX + BASE]].forEach(([side, px]) => {
      piece(() => {
        const pts = side < 0 ? [[-WL, 0], [0, 0], [0, -TH], [-WL, -TH]] : [[0, 0], [WL, 0], [WL, -TH], [0, -TH]];
        const a = side < 0 ? ang : -ang;
        pts.forEach(([x, y], i) => {
          const X = px + x * Math.cos(a) - y * Math.sin(a), Y = AY + x * Math.sin(a) + y * Math.cos(a);
          i ? g.lineTo(X, Y) : g.moveTo(X, Y);
        });
        g.closePath();
      }, kc);
    });
    // 心鉄
    if (coreIn > 0) {
      const cy = lerp(AY - TH - 76 - 150, AY - TH - 76, smooth(coreIn));
      piece(() => g.rect(CX - 32 + coreOff, cy, 64, 76), sc);
      if (coreIn >= 1 && tseam > 0.05) {
        g.strokeStyle = `rgba(30,10,4,${0.8 * tseam})`; g.lineWidth = 2;
        g.strokeRect(CX - 32 + coreOff, cy, 64, 76);
      }
      label(L('心鉄', 'Core'), CX + coreOff, cy + 44);
    }
    label(L('皮鉄', 'Skin'), CX - 140 + bendK * 40, AY + 30);
    g.fillStyle = '#c9b89a'; g.font = `${fs(c, 15)}px serif`; g.textAlign = 'left';
    g.fillText(L('断面', 'Cross-section'), 24, 30);
  }

  function drawNobashi() {
    // 長い金床
    const ag = g.createLinearGradient(0, AY, 0, AY + 26);
    ag.addColorStop(0, '#55575e'); ag.addColorStop(0.2, '#26272c'); ag.addColorStop(1, '#111215');
    g.fillStyle = ag; g.fillRect(40, AY, W - 80, 26);
    g.fillStyle = '#100c09'; g.fillRect(60, AY + 26, W - 120, H - AY - 26);
    const h = lerp(56, 22, clamp((nobLen - 150) / (NOB_MAX - 150), 0, 1));
    const topFn = u => (u > 0.9 ? Math.pow((u - 0.9) / 0.1, 1.6) * h * 0.85 * tipK : 0);
    Sword.drawHotBar(g, NOB_X, AY - h, nobLen, h, T, { seed: 55, time, topFn, scale: 70, layers: 3 });
  }

  function drawYaki(dt) {
    const t = yk.t;
    const dark = clamp((t - 0.6) / 0.8, 0, 1) * 0.85;
    g.fillStyle = `rgba(0,0,0,${dark})`; g.fillRect(0, 0, W, H);
    // 水槽
    g.fillStyle = '#1b130d'; g.fillRect(60, 300, 740, 110);
    const wg = g.createLinearGradient(0, 312, 0, 410);
    wg.addColorStop(0, 'rgba(40,60,70,0.95)'); wg.addColorStop(1, 'rgba(8,14,18,0.98)');
    g.fillStyle = wg; g.fillRect(70, 312, 720, 96);
    // 刀身：土を置き（〜0.9）→ 赤める（〜2.4）→ 入水
    const clay = clamp(t / 0.6, 0, 1);
    let heat, y = 200, sori = 0;
    if (t < 0.9) heat = lerp(T, 520, clamp(t / 0.5, 0, 1));
    else if (t < 2.4) heat = lerp(520, yk.quenchT, smooth((t - 0.9) / 1.5));
    else {
      const k = t - 2.4;
      heat = Math.max(30, yk.quenchT - k * 900);
      y = 200 + clamp(k / 0.3, 0, 1) * 120 * (k < 1.5 ? 1 : clamp(1 - (k - 1.5) / 0.5, 0, 1));
      sori = lerp(0, yk.sori * 0.9, smooth(clamp((k - 0.2) / 1.4, 0, 1)));
      if (!yk.sizzled) {
        yk.sizzled = true;
        Sound.sizzle(2.8);
        if (navigator.vibrate) { try { navigator.vibrate([40, 30, 80]); } catch (e) { /* 無視 */ } }
      }
      if (k > 0.25 && k < 2 && Math.random() < dt * 40) parts.steam(430, 310, 3, 330);
    }
    Sword.draw(g, { x: 130, y, length: 640, width: 52, sori, nakago: true, habaki: false, polish: 0.2, folds: 8, seed: 7, hamon: yk.hamon, heat, clay, shadow: false, bg: '#050302' });
    if (t < 0.9) label(L('土置き', 'Applying clay'), 430, 120);
    else if (t < 2.4) label(L('月の出の色まで赤める…', 'Heating to the “rising-moon” glow…'), 430, 120);
    else if (t < 3.6) {
      const k = t - 2.4;
      g.save();
      g.font = `900 ${fs(c, 64, 1.5)}px "Shippori Mincho", serif`;
      g.textAlign = 'center';
      g.fillStyle = `rgba(255,240,215,${clamp(1.2 - k, 0, 1)})`;
      g.translate(430, 150); g.scale(1 + k * 0.15, 1 + k * 0.15);
      g.fillText(L('ジュワッ！', 'HSSSS!'), 0, 0);
      g.restore();
    }
  }

  function drawReheat() {
    // 鋼の下に火床の炎
    Sword.drawCoals(g, 120, AY + 6, 620, 40, 0.9, time, 41);
    label(L('沸かし直し…', 'Reheating…'), W / 2, 70);
  }

  function drawScene(dt) {
    const st = steps[Math.min(si, steps.length - 1)];
    const sec = SECTIONS[curSec].id;
    if (sec === 'nobashi' || sec === 'yaki') drawSmithy(g, W, H, heatGlow(T), -600);
    else drawSmithy(g, W, H, heatGlow(T), CX - 105);
    if (mode === 'reheat') drawReheat();
    if (sec === 'kawa') drawKawa();
    else if (sec === 'shin') drawShin();
    else if (sec === 'tsukuri') drawTsukuri();
    else if (sec === 'nobashi') drawNobashi();
    else if (sec === 'yaki') { drawYaki(dt); return; }

    // 師匠の合図
    if (mode === 'beat' && target && !struck) {
      const k = clamp((targetAt - time) / (beat / 2), 0, 1);
      const ty = topY(target.x);
      g.strokeStyle = `rgba(255,214,120,${0.35 + 0.65 * (1 - k)})`;
      g.lineWidth = 3;
      g.beginPath(); g.arc(target.x, ty, 16 + k * 60, 0, TAU); g.stroke();
      g.strokeStyle = 'rgba(255,214,120,0.9)'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(target.x, ty, 16, 0, TAU); g.stroke();
      const lab = { notch: L('鏨', 'cut'), fold: L('折', 'fold'), bend: L('曲', 'bend'), close: L('締', 'press'), tip: L('切先', 'tip') }[st.k];
      if (lab) {
        g.font = `bold ${fs(c, 20, 1.7)}px "Shippori Mincho", serif`; g.textAlign = 'center'; g.fillStyle = '#ffd77a';
        g.fillText(lab, target.x, ty - 34 - k * 20);
      }
    }
    if (masterFx > 0 && target) {
      const ty = topY(target.x);
      g.save();
      g.translate(target.x + 26, ty - 18 - masterFx * 26);
      g.rotate(-0.6);
      g.fillStyle = '#4a3220'; g.fillRect(8, -3, 70, 6);
      g.fillStyle = '#5c5e64'; g.fillRect(-10, -9, 20, 18);
      g.restore();
    }
    if (hammerFx && hammerFx.t < 0.25) {
      const k = hammerFx.t / 0.25;
      const hy = hammerFx.y - 46 - k * 70;
      const hg = g.createLinearGradient(0, hy, 0, hy + 44);
      hg.addColorStop(0, '#5b5d63'); hg.addColorStop(1, '#141518');
      g.fillStyle = hg; g.fillRect(hammerFx.x - 28, hy, 56, 44);
      g.fillStyle = '#5a3d22'; g.fillRect(hammerFx.x + 24, hy + 18, 130, 9);
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = rgbStr(heatRGB(T + 200), (1 - k) * 0.5);
      g.beginPath(); g.arc(hammerFx.x, hammerFx.y, 26 + k * 30, 0, TAU); g.fill();
      g.restore();
    }
    if (combo >= 2) {
      g.font = `bold ${fs(c, 24, 1.8)}px "Shippori Mincho", serif`; g.fillStyle = '#ffd77a'; g.textAlign = 'left';
      g.fillText(`${combo} ${L('連', 'combo')}`, 24, 30 + fs(c, 24, 1.8));
    }
  }

  function drawBanner() {
    const s = SECTIONS[curSec];
    const k = clamp(modeT / 1.3, 0, 1);
    const a = k > 0.8 ? (1 - k) / 0.2 : k < 0.2 ? k / 0.2 : 1;
    g.save();
    g.fillStyle = `rgba(0,0,0,${0.55 * a})`;
    g.fillRect(0, H / 2 - 70, W, 140);
    g.textAlign = 'center';
    g.fillStyle = `rgba(210,174,99,${a})`;
    g.font = `${fs(c, 18, 1.6)}px "Shippori Mincho", serif`;
    g.fillText(L(`其の${s.no}`, `PART ${curSec + 1}`), W / 2, H / 2 - 28);
    g.fillStyle = `rgba(255,240,220,${a})`;
    g.font = `bold ${fs(c, 44, 1.5)}px "Shippori Mincho", serif`;
    g.fillText(s.title, W / 2, H / 2 + 26);
    g.restore();
  }

  // ---------- ループ
  scope.loop(dt => {
    time += dt;
    msgT -= dt;
    shake = Math.max(0, shake - dt * 30);
    masterFx = Math.max(0, masterFx - dt * 6);
    if (hammerFx) hammerFx.t += dt;
    parts.update(dt);

    if (mode === 'banner') {
      modeT -= dt;
      if (modeT <= 0) {
        if (SECTIONS[curSec].id === 'yaki') mode = 'yaki';
        else { mode = 'beat'; nextBeat = time + 0.3; }
      }
    } else if (mode === 'reheat') {
      modeT -= dt;
      T = Math.min(1320, T + 380 * dt);
      Sound.fire(0.8);
      if (Math.random() < dt * 3) Sound.whoosh();
      if (modeT <= 0) { mode = 'beat'; nextBeat = time + 0.35; Sound.fire(0.15); }
    } else if (mode === 'anim') {
      // 心鉄を入れる（自動）
      const st = steps[si];
      if (st && st.k === 'insert') {
        if (coreIn === 0) coreOff = (Math.random() < 0.5 ? -1 : 1) * (1 - avg(acc.tsukuri)) * 16;
        coreIn = Math.min(1, coreIn + dt / 0.6);
        if (coreIn >= 1) { Sound.thud(); mode = 'beat'; nextBeat = time + 0.3; si++; }
      }
    } else if (mode === 'beat') {
      Sound.fire(0.15);
      T -= 8 * dt;
      if (foldAnim >= 0) {
        foldAnim += dt / 0.45;
        if (foldAnim >= 1) {
          foldAnim = -1; len /= 2; notch = false; seam = 1;
          folds++; carbon -= 0.04;
          say(L(`${folds}回目の折り返し`, `Fold ${folds}`), 0.9);
        }
      } else if (time >= nextBeat) {
        // 前の合図を打ち逃した
        if (target && !struck) {
          combo = 0;
          const st = steps[si];
          if (!MUST[st.k]) { acc[st.s].push(0); advance(); }
          say(L('打ち逃した', 'Missed'), 0.5);
        }
        target = null;
        const st = steps[si];
        nextBeat = time + beat;
        if (mode !== 'beat' || !st) { /* 区切りの切り替え中 */ }
        else if (st.auto) { mode = 'anim'; }
        else if (T < 920) {
          mode = 'reheat'; modeT = 1.4;
          say(L('冷えた', 'Cooled'), 0.8);
        } else if (st.s === SECTIONS[curSec].id) {
          beat = 60 / (86 + curSec * 8 + folds * 2);
          target = { k: st.k, x: targetX(st) };
          targetAt = time + beat / 2;
          struck = false;
          masterFx = 1;
          Sound.tick();
        }
      }
    } else if (mode === 'yaki') {
      yk.t += dt;
      if (yk.t > 4.6) end();
    }

    g.save();
    if (shake > 0) g.translate(rand(-shake, shake) * 0.4, rand(-shake, shake) * 0.4);
    drawScene(dt);
    parts.draw(g);
    if (mode === 'banner') drawBanner();
    if (msgT > 0 && mode !== 'yaki') {
      g.font = `bold ${fs(c, 26, 1.6)}px "Shippori Mincho", serif`; g.textAlign = 'center';
      g.fillStyle = `rgba(255,236,200,${clamp(msgT * 2, 0, 1)})`;
      g.fillText(msg, W / 2, 110);
    }
    g.restore();

    const sec = SECTIONS[curSec];
    ui.status.innerHTML =
      `<div class="stat"><span>${sec.no}</span><b>${sec.title}</b></div>` +
      (sec.id === 'kawa' ? `<div class="stat"><span>${L('折り返し', 'Folds')}</span><b>${folds}/${KAWA_FOLDS}</b></div>` : '') +
      `<div class="meter heat"><span>${L('鋼の熱', 'Heat')}</span><i><b style="width:${clamp((T - 860) / 460, 0, 1) * 100}%;background:${rgbStr(heatRGB(T))}"></b></i></div>` +
      `<div class="stat"><span>${L('連打', 'Combo')}</span><b>${combo}</b></div>`;
    hitBtn.disabled = mode !== 'beat';
  });
}

const STAGES = [
  { id: 'katana', no: '一', title: L('作刀', 'Forge a Katana'), yomi: L('さくとう', 'Sakutō'), run: stageKatana,
    intro: L('師匠の小槌が<strong>「トン」</strong>と鳴ったら、続けて大鎚で<strong>「カン」</strong>と打つ。<br>叩くだけで、鍛錬・造り込み・打ち延ばしを経て、最後は焼入れで「ジュワッ」。',
      'When the master’s small hammer goes <strong>“tonk”</strong>, answer with your big hammer — <strong>“KAN!”</strong><br>Just keep striking: forge, laminate and draw out the blade, then quench it with a hiss.') }
];
