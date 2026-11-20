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
    L('師匠が叩いた<strong>リズムを、そのまま返せ</strong>。金の音符が線に重なった瞬間に叩く', 'Echo the <strong>master’s rhythm</strong> — strike as each gold note reaches the line') +
    L('<span class="keys">（<kbd>Space</kbd>）</span>', '<span class="keys"> (<kbd>Space</kbd>)</span>'));
  const [c, g] = makeCanvas(860, 420, 'stage-canvas', 1.5);
  c.style.touchAction = 'none';
  ui.view.append(c);
  const W = c.W, H = c.H;
  const parts = makeParticles();
  const CX = 570, AY = H * 0.72 - 50;
  const KAWA_FOLDS = 5, KAWA_LEN = 150, KAWA_AREA = KAWA_LEN * 36;
  const NOB_X = 70, NOB_MAX = 700;
  const BPM = 104, BEAT = 60 / BPM, BAR = BEAT * 4, EIGHTH = BEAT / 2;
  const WIN = { perfect: 0.05, good: 0.1, ok: 0.17 };

  let T = 1320;
  let purity = 0.44, carbon = 0.88 + Math.random() * 0.04;
  let folds = 0, time = 0, msg = '', msgT = 0, shake = 0, combo = 0, maxCombo = 0;
  const acc = { kawa: [], shin: [], tsukuri: [], nobashi: [] };

  // 鋼の状態
  let len = KAWA_LEN, notch = false, seam = 0, foldAnim = -1;     // 皮鉄
  let shinLen = 110, shinTight = 0;                               // 心鉄
  let bendK = 0, coreIn = 0, closeK = 0, coreOff = 0, tseam = 1;   // 造り込み
  let nobLen = 150, tipK = 0;                                     // 打ち延ばし

  /* ---------- 譜面：師匠が1小節叩いて見せ、次の1小節で同じリズムを返す ---------- */
  const chart = [];            // { t, who: 'M'|'P', step, judged, scheduled }
  const events = [];           // { t, kind: 'section'|'reheat'|'insert'|'yaki', id }
  const respBars = new Set();
  let bar = 0;
  const POOLS = {              // 8分音符の位置（0〜7）
    easy: [[0, 2, 4, 6]],
    mid: [[0, 2, 4, 6], [0, 2, 3, 4, 6], [0, 1, 2, 4, 6], [0, 3, 4, 6], [0, 2, 4, 5, 6]],
    hard: [[0, 2, 3, 5, 6], [0, 1, 2, 4, 5, 6], [0, 3, 4, 6, 7], [0, 2, 3, 4, 6, 7], [0, 1, 3, 4, 6]]
  };
  const FOLD_POOL = [[0, 2, 4, 6], [0, 3, 4, 6], [0, 2, 5, 6], [0, 3, 5, 6], [0, 2, 3, 6]];
  const pick = a => a[Math.floor(Math.random() * a.length)];
  function callResponse(slots, steps) {
    slots.forEach((sl, i) => chart.push({ t: bar * BAR + sl * EIGHTH, who: 'M', step: steps[i] }));
    bar++;
    respBars.add(bar);
    slots.forEach((sl, i) => chart.push({ t: bar * BAR + sl * EIGHTH, who: 'P', step: steps[i] }));
    bar++;
  }
  function rest(kind, extra = {}) { events.push({ t: bar * BAR, kind, ...extra }); bar++; }
  const spread = (s, k, slots, from, to, extra = {}) =>
    slots.map((_, i) => ({ s, k, p: from + (to - from) * i / Math.max(1, slots.length - 1), n: slots.length, ...extra }));

  rest('section', { id: 'kawa' });
  for (let f = 0; f < KAWA_FOLDS; f++) {
    const sp = pick(POOLS[f < 1 ? 'easy' : f < 3 ? 'mid' : 'hard']);
    callResponse(sp, spread('kawa', 'spread', sp, 0.12, 0.92));
    const fp = f < 1 ? FOLD_POOL[0] : pick(FOLD_POOL);
    callResponse(fp, [{ s: 'kawa', k: 'notch' }, { s: 'kawa', k: 'fold' }, { s: 'kawa', k: 'weld', p: 0.3 }, { s: 'kawa', k: 'weld', p: 0.7, last: true }]);
    if (f === 1 || f === 3) rest('reheat');
  }
  rest('section', { id: 'shin' });
  { const p = pick(POOLS.mid); callResponse(p, spread('shin', 'pack', p, 0.15, 0.85)); }
  rest('section', { id: 'tsukuri' });
  callResponse([0, 4], [{ s: 'tsukuri', k: 'bend', p: -1 }, { s: 'tsukuri', k: 'bend', p: 1 }]);
  rest('insert');
  callResponse(pick([[0, 2, 4, 6], [0, 3, 4, 6], [0, 2, 3, 6]]),
    [{ s: 'tsukuri', k: 'close', p: -1 }, { s: 'tsukuri', k: 'close', p: 1 }, { s: 'tsukuri', k: 'weld', p: 0 }, { s: 'tsukuri', k: 'weld', p: 0 }]);
  rest('section', { id: 'nobashi' });
  {
    const d1 = pick(POOLS.mid), d2 = pick(POOLS.hard), nd = d1.length + d2.length;
    callResponse(d1, spread('nobashi', 'draw', d1, 0.06, 0.45, { n: nd }));
    callResponse(d2, spread('nobashi', 'draw', d2, 0.5, 0.92, { n: nd }));
  }
  callResponse([0, 4], [{ s: 'nobashi', k: 'tip' }, { s: 'nobashi', k: 'tip' }]);
  rest('yaki');
  const pNotes = chart.filter(n => n.who === 'P');

  // 進行
  let mode = 'play';           // play | yaki | done
  let curSec = 0, bannerT = 0, reheatUntil = -1, insertAt = -1;
  let t0 = 0, started = false;
  let masterFx = 0, masterX = CX, masterY = AY, hammerFx = null;
  let lastJudge = null;        // レーン上の判定表示 { text, t, q }
  let yk = null;
  const songT = () => (started ? Sound.now() - t0 : -1);

  const say = (s, d = 1.0) => { msg = s; msgT = d; };
  const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const secIndex = id => SECTIONS.findIndex(s => s.id === id);

  // 画面のどこを叩いてもよい（上部のボタン類を押したときは除く）
  scope.on(window, 'pointerdown', e => {
    if (e.target.closest && e.target.closest('button, a, input, label')) return;
    strike();
  });
  scope.on(window, 'keydown', e => {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      if (!e.repeat) strike();
    }
  });

  function begin() {
    Sound.init();
    t0 = Sound.now() + 0.8;
    started = true;
    if (Sound.ctx) Music.groove(t0 + (Sound.ctx.outputLatency || 0), BEAT);
  }
  begin();
  if (/[?&]debug\b/.test(location.search)) window.__katana = { pNotes, songT, BEAT };

  function enterSection(id) {
    curSec = secIndex(id);
    section && section(curSec);
    bannerT = id === 'yaki' ? 1.3 : BAR;
    T = 1320;
  }

  /* いま叩くべき（次の）音符 */
  function nextNote() { return pNotes.find(n => !n.judged); }
  function curStep() { const n = nextNote(); return n ? n.step : { s: SECTIONS[curSec].id, k: '' }; }

  /* 鋼の上面の高さ（狙いの輪を出す位置） */
  function topY(st) {
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
      return CX - len / 2 + len * (st.p ?? 0.5);
    }
    if (st.s === 'shin') return CX - shinLen / 2 + shinLen * st.p;
    if (st.s === 'tsukuri') {
      if (st.k === 'bend') return CX + st.p * 95 * (1 - bendK * 0.6);
      if (st.k === 'close') return CX + st.p * 48;
      return CX + coreOff;
    }
    if (st.k === 'tip') return NOB_X + nobLen - 18;
    return NOB_X + nobLen * (st.p ?? 0.5);
  }

  function strike() {
    if (mode !== 'play' || !started) return;
    Sound.init();
    const now = songT();
    let best = null, bd = 1e9;
    for (const n of pNotes) {
      if (n.judged) continue;
      const d = Math.abs(now - n.t);
      if (d < bd) { bd = d; best = n; }
      if (n.t > now + 0.5) break;
    }
    if (best && bd <= WIN.ok) {
      judge(best, bd <= WIN.perfect ? 1 : bd <= WIN.good ? 0.65 : 0.3);
    } else {
      // 空振り
      const st = curStep();
      const x = targetX(st);
      hammerFx = { x, y: topY(st), t: 0 };
      shake = 2;
      Sound.clang(0.3, true);
      combo = 0;
      lastJudge = { text: L('空振り', 'Whiff'), t: time, q: 0 };
    }
  }

  function judge(n, q) {
    n.judged = true;
    const st = n.step;
    const x = targetX(st), y = topY(st);
    acc[st.s].push(q);
    const hf = clamp((T - 850) / 450, 0.5, 1);
    if (q > 0) {
      hammerFx = { x, y, t: 0 };
      shake = 3 + q * 7;
      T -= 9;
      Sound.clang(0.45 + q * 0.55, false);
      if (navigator.vibrate) { try { navigator.vibrate(q >= 0.65 ? 18 : 8); } catch (e) { /* 無視 */ } }
      parts.spark(x, y, Math.round(8 + q * 30 * Math.max(0.3, heatGlow(T)) * (1.6 - purity)), { T: T + 80 });
    }
    if (q >= 0.65) { combo++; maxCombo = Math.max(maxCombo, combo); } else combo = 0;
    lastJudge = { text: q === 1 ? L('会心', 'Perfect') : q >= 0.65 ? L('良し', 'Good') : q > 0 ? L('ずれ', 'Off') : L('見逃し', 'Miss'), t: time, q };
    apply(st, q, hf);
  }

  function apply(st, q, hf) {
    const qq = 0.35 + 0.65 * q;
    if (st.s === 'kawa') {
      if (st.k === 'spread') {
        len += (0.8 * KAWA_LEN / st.n) * qq * hf;
        purity += (1 - purity) * (0.28 / st.n) * q * hf;
      } else if (st.k === 'notch') {
        notch = true; Sound.chisel(); scope.timeout(() => Sound.chisel(), 90);
      } else if (st.k === 'fold') {
        foldAnim = 0; Sound.thud();
      } else if (st.k === 'weld') {
        seam = Math.max(0, seam - 0.55 * q);
        purity += (1 - purity) * 0.03 * q;
        if (st.last) {
          if (seam > 0.3) { purity -= 0.02 * seam; say(L('鍛着が甘い…', 'Weak weld…'), 1); }
          else say(L(`${folds}回目、鍛着！`, `Fold ${folds} welded!`), 1);
          seam = 0;
        }
      }
      purity = clamp(purity, 0.3, 0.995);
    } else if (st.s === 'shin') {
      shinLen = Math.min(KAWA_LEN, shinLen + (40 / st.n) * qq);
      shinTight += q / st.n;
    } else if (st.s === 'tsukuri') {
      if (st.k === 'bend') bendK = Math.min(1, bendK + 0.5);
      else if (st.k === 'close') closeK = Math.min(1, closeK + 0.5);
      else if (st.k === 'weld') tseam = Math.max(0, tseam - 0.5 * q - 0.1);
    } else if (st.s === 'nobashi') {
      if (st.k === 'draw') nobLen = Math.min(NOB_MAX, nobLen + (NOB_MAX - 150) / st.n);
      else tipK = Math.min(1, tipK + 0.5);
    }
  }

  function startYaki() {
    const accAll = avg([...acc.kawa, ...acc.shin, ...acc.tsukuri, ...acc.nobashi]);
    const qq = clamp(0.5 + 0.5 * accAll + rand(-0.08, 0.08), 0, 1);
    const crack = Math.random() < (1 - accAll) * 0.15;
    const quenchT = Math.round(790 + (1 - qq) * (Math.random() < 0.5 ? -1 : 1) * 90);
    const hamonName = accAll >= 0.85 ? '丁子' : accAll >= 0.7 ? '互の目' : accAll >= 0.55 ? '湾れ' : '直刃';
    const f = HAMON_PRESETS[hamonName];
    yk = { t: -1.3, accAll, qq, crack, quenchT, hamonName, hamon: Array.from({ length: HAMON_N }, (_, i) => f(i / (HAMON_N - 1))), sori: 10 + 12 * qq, sizzled: false };
    Music.grooveOff();
    Music.setMood('tense');
    enterSection('yaki');
    T = 1100;
    mode = 'yaki';
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
  }

  function label(text, x, y) {
    g.font = `bold ${Math.round(fs(c, 16, 1.8) / cam.z)}px "Shippori Mincho", serif`;
    g.textAlign = 'center'; g.fillStyle = 'rgba(255,230,200,0.85)';
    g.fillText(text, x, y);
  }

  /* 造り込み：断面図。皮鉄の板が叩かれてU字になり、心鉄を包む */
  function drawTsukuri() {
    const kc = heatRGB(T), sc = heatRGB(T - 150), gl = heatGlow(T);
    const BASE = 60, TH = 24, WL = 80;
    const ang = (Math.PI / 2) * smooth(bendK) + closeK * 0.05;
    /* 皮鉄の板：(px, py) を軸に角度 a で置く。長さ方向に折り返しの層の縞が走る */
    const slab = (px, py, x0, x1, a) => {
      g.save();
      g.translate(px, py); g.rotate(a);
      g.save();
      g.shadowColor = rgbStr(kc, 0.7 * gl); g.shadowBlur = 16;
      g.fillStyle = rgbStr(kc);
      g.fillRect(x0, -TH, x1 - x0, TH);
      g.restore();
      g.strokeStyle = rgbStr(heatRGB(T - 260), 0.55); g.lineWidth = 0.8;
      for (let i = 1; i < 6; i++) {
        const y = -TH * i / 6;
        g.beginPath(); g.moveTo(x0 + 1, y + Math.sin(i * 2.3) * 0.6); g.lineTo(x1 - 1, y - Math.sin(i * 1.7) * 0.6); g.stroke();
      }
      g.strokeStyle = rgbStr(heatRGB(T - 320), 0.9); g.lineWidth = 1.2;
      g.strokeRect(x0, -TH, x1 - x0, TH);
      g.restore();
    };
    slab(CX - BASE, AY, 0, BASE * 2, 0);
    slab(CX - BASE, AY, -WL, 0, ang);
    slab(CX + BASE, AY, 0, WL, -ang);
    // 心鉄：縞のない、やや暗く柔らかな塊
    if (coreIn > 0) {
      const cy = lerp(AY - TH - 76 - 150, AY - TH - 76, smooth(coreIn));
      const x = CX - 32 + coreOff;
      g.save();
      g.shadowColor = rgbStr(sc, 0.6 * gl); g.shadowBlur = 14;
      g.fillStyle = rgbStr(sc);
      g.beginPath(); g.roundRect ? g.roundRect(x, cy, 64, 76, 6) : g.rect(x, cy, 64, 76); g.fill();
      g.restore();
      const cg = g.createRadialGradient(x + 32, cy + 38, 4, x + 32, cy + 38, 44);
      cg.addColorStop(0, rgbStr(heatRGB(T - 90), 0.6)); cg.addColorStop(1, rgbStr(sc, 0));
      g.fillStyle = cg; g.fillRect(x, cy, 64, 76);
      g.strokeStyle = coreIn >= 1 && tseam > 0.05 ? `rgba(30,10,4,${0.4 + 0.5 * tseam})` : rgbStr(heatRGB(T - 320), 0.9);
      g.lineWidth = 1.5;
      g.beginPath(); g.roundRect ? g.roundRect(x, cy, 64, 76, 6) : g.rect(x, cy, 64, 76); g.stroke();
    }
  }

  /* 合図の絵（文字の代わり） */
  function drawIcon(kind, x, y, s, color = '#ffd77a') {
    g.save();
    g.translate(x, y); g.scale(s, s);
    g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 2.4; g.lineCap = 'round'; g.lineJoin = 'round';
    const arrowHead = (x1, y1, ang) => {
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x1 - 7 * Math.cos(ang - 0.5), y1 - 7 * Math.sin(ang - 0.5));
      g.lineTo(x1 - 7 * Math.cos(ang + 0.5), y1 - 7 * Math.sin(ang + 0.5));
      g.closePath(); g.fill();
    };
    if (kind === 'notch') {                 // 鏨
      g.beginPath(); g.moveTo(-4, -16); g.lineTo(4, -16); g.lineTo(2, 6); g.lineTo(0, 11); g.lineTo(-2, 6); g.closePath(); g.fill();
      g.fillRect(-6, -22, 12, 7);
    } else if (kind === 'fold') {           // 端を持ち上げて折り返す矢印
      g.beginPath(); g.arc(-2, 4, 12, 0, -Math.PI, true); g.stroke();
      arrowHead(-14, 6, Math.PI / 2);
    } else if (kind === 'bend') {           // 起き上がる
      g.beginPath(); g.moveTo(0, 10); g.lineTo(0, -10); g.stroke();
      arrowHead(0, -13, -Math.PI / 2);
    } else if (kind === 'close') {          // 内側へ締める
      g.beginPath(); g.moveTo(-14, 0); g.lineTo(-3, 0); g.moveTo(14, 0); g.lineTo(3, 0); g.stroke();
      arrowHead(-1, 0, 0); arrowHead(1, 0, Math.PI);
    } else if (kind === 'tip') {            // 切先
      g.beginPath(); g.moveTo(-14, -5); g.lineTo(6, -5); g.quadraticCurveTo(14, -5, 14, 6); g.lineTo(-14, 6); g.closePath(); g.fill();
    }
    g.restore();
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
    if (t < 0) { Sword.draw(g, { x: 130, y: 200, length: 640, width: 52, sori: 0, nakago: true, habaki: false, polish: 0.2, folds: 8, seed: 7, heat: T, shadow: false, bg: '#050302' }); return; }
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
    if (t < 0) { /* 題目の表示中 */ } else if (t < 0.9) label(L('土置き', 'Applying clay'), 430, 120);
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

  }

  function drawScene(dt) {
    const sec = SECTIONS[curSec].id;
    if (sec === 'nobashi' || sec === 'yaki') drawSmithy(g, W, H, heatGlow(T), -600);
    else drawSmithy(g, W, H, heatGlow(T), CX - 105);
    if (songT() < reheatUntil) drawReheat();
    if (sec === 'kawa') drawKawa();
    else if (sec === 'shin') drawShin();
    else if (sec === 'tsukuri') drawTsukuri();
    else if (sec === 'nobashi') drawNobashi();
    else if (sec === 'yaki') { drawYaki(dt); return; }

    // 次に叩く場所：輪が閉じたら叩く
    const n = nextNote();
    if (mode === 'play' && n && n.step.s === sec) {
      const k = (n.t - songT()) / BEAT;
      if (k < 1.2 && k > -0.2) {
        const kk = clamp(k, 0, 1);
        const st = n.step, x = targetX(st), ty = topY(st);
        const u = 1.5 / cam.z;
        g.strokeStyle = `rgba(255,214,120,${0.35 + 0.65 * (1 - kk)})`;
        g.lineWidth = 3 * u;
        g.beginPath(); g.arc(x, ty, (16 + kk * 60) * u, 0, TAU); g.stroke();
        g.strokeStyle = 'rgba(255,214,120,0.9)'; g.lineWidth = 1.5 * u;
        g.beginPath(); g.arc(x, ty, 16 * u, 0, TAU); g.stroke();
        if (['notch', 'fold', 'bend', 'close', 'tip'].includes(st.k)) drawIcon(st.k, x, ty - (42 + kk * 20) * u, u * 1.1);
      }
    }
    if (masterFx > 0) {
      g.save();
      g.translate(masterX + 26, masterY - 18 - masterFx * 26);
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
  }

  /* カメラ：作業中の鉄に寄る */
  const cam = { x: CX, y: AY - 45, z: 2.1 };
  function camTarget() {
    const sec = SECTIONS[curSec].id;
    if (sec === 'yaki') return { x: W / 2, y: H * 0.6, z: 1 };
    if (sec === 'tsukuri') return { x: CX, y: AY - 70, z: 1.75 };
    if (sec === 'nobashi') {
      const st = curStep();
      const fx = st.s === 'nobashi' ? targetX(st) : NOB_X + nobLen / 2;
      return { x: fx, y: AY - 32, z: 1.9 };
    }
    return { x: CX, y: AY - 45, z: 2.1 };
  }
  function updateCam(dt) {
    const t = camTarget();
    const k = 1 - Math.pow(0.03, dt);
    cam.z = lerp(cam.z, t.z, k);
    cam.x = lerp(cam.x, clamp(t.x, W / (2 * cam.z), W - W / (2 * cam.z)), k);
    // 上の譜面レーンに隠れないよう、鉄は少し下寄りに置く
    cam.y = lerp(cam.y, clamp(t.y - 18 / cam.z, H * 0.6 / cam.z, H - H * 0.4 / cam.z), k);
  }

  /* 譜面レーン（画面上部）：師匠の音符は小さな点、あなたの音符は金の丸 */
  function drawLane() {
    const uk = uiK(c, 1.8);
    const LH = 54 * uk, y0 = 6, cy = y0 + LH / 2;
    const JX = 64 * uk;
    const SPEED = 250 * uk;
    const now = songT();
    const xOf = t => JX + (t - now) * SPEED;
    g.save();
    g.fillStyle = 'rgba(8,5,3,0.72)';
    g.fillRect(0, y0, W, LH);
    // 小節：返す小節をうっすら金色に
    const b0 = Math.floor((now - JX / SPEED) / BAR), b1 = Math.ceil((now + W / SPEED) / BAR);
    for (let b = b0; b <= b1; b++) {
      const x = xOf(b * BAR), x2 = xOf((b + 1) * BAR);
      if (respBars.has(b)) { g.fillStyle = 'rgba(210,174,99,0.10)'; g.fillRect(x, y0, x2 - x, LH); }
      g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 + LH); g.stroke();
      for (let q = 1; q < 4; q++) {
        const xb = xOf(b * BAR + q * BEAT);
        g.strokeStyle = 'rgba(255,255,255,0.05)';
        g.beginPath(); g.moveTo(xb, y0 + LH * 0.3); g.lineTo(xb, y0 + LH * 0.7); g.stroke();
      }
    }
    // 判定の位置
    g.strokeStyle = 'rgba(255,214,120,0.9)'; g.lineWidth = 2.5;
    g.beginPath(); g.arc(JX, cy, 17 * uk, 0, TAU); g.stroke();
    // 音符
    for (const n of chart) {
      const x = xOf(n.t);
      if (x < -30 || x > W + 30) continue;
      if (n.who === 'M') {
        const past = n.t < now;
        g.fillStyle = past ? 'rgba(150,135,110,0.35)' : 'rgba(190,170,135,0.9)';
        g.beginPath(); g.arc(x, cy, 6 * uk, 0, TAU); g.fill();
      } else if (!n.judged) {
        const r = 14 * uk;
        const gr = g.createRadialGradient(x - r * 0.3, cy - r * 0.3, 1, x, cy, r);
        gr.addColorStop(0, '#fff2c8'); gr.addColorStop(0.5, '#f0c060'); gr.addColorStop(1, '#a8701c');
        g.fillStyle = gr;
        g.beginPath(); g.arc(x, cy, r, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(60,30,5,0.8)'; g.lineWidth = 1.2; g.stroke();
        if (['notch', 'fold', 'bend', 'close', 'tip'].includes(n.step.k)) drawIcon(n.step.k, x, cy + 2 * uk, uk * 0.5, '#3a2006');
      } else if (n.missed && n.t > now - 1) {
        g.fillStyle = 'rgba(120,110,100,0.4)';
        g.beginPath(); g.arc(x, cy, 10 * uk, 0, TAU); g.fill();
      }
    }
    // 判定の文字
    if (lastJudge && time - lastJudge.t < 0.5) {
      const k = (time - lastJudge.t) / 0.5;
      g.font = `bold ${Math.round(15 * uk)}px "Shippori Mincho", serif`;
      g.textAlign = 'center';
      g.fillStyle = lastJudge.q >= 1 ? `rgba(255,224,140,${1 - k})` : lastJudge.q >= 0.65 ? `rgba(240,230,210,${1 - k})` : `rgba(200,150,130,${1 - k})`;
      g.fillText(lastJudge.text, JX, y0 + LH + 18 * uk - k * 6 * uk);
      if (lastJudge.q >= 0.65) {
        g.strokeStyle = `rgba(255,214,120,${1 - k})`; g.lineWidth = 3;
        g.beginPath(); g.arc(JX, cy, 17 * uk + k * 14 * uk, 0, TAU); g.stroke();
      }
    }
    g.restore();
    return y0 + LH;
  }

  function drawBanner() {
    const s = SECTIONS[curSec];
    const dur = s.id === 'yaki' ? 1.3 : BAR;
    const k = clamp(bannerT / dur, 0, 1);
    const a = k > 0.8 ? (1 - k) / 0.2 : k < 0.2 ? k / 0.2 : 1;
    g.save();
    g.fillStyle = `rgba(0,0,0,${0.55 * a})`;
    g.fillRect(0, H / 2 - 50, W, 120);
    g.textAlign = 'center';
    g.fillStyle = `rgba(210,174,99,${a})`;
    g.font = `${fs(c, 18, 1.6)}px "Shippori Mincho", serif`;
    g.fillText(L(`其の${s.no}`, `PART ${curSec + 1}`), W / 2, H / 2 - 12);
    g.fillStyle = `rgba(255,240,220,${a})`;
    g.font = `bold ${fs(c, 40, 1.5)}px "Shippori Mincho", serif`;
    g.fillText(s.title, W / 2, H / 2 + 38);
    g.restore();
  }

  // ---------- ループ
  scope.loop(dt => {
    time += dt;
    msgT -= dt;
    bannerT -= dt;
    shake = Math.max(0, shake - dt * 30);
    masterFx = Math.max(0, masterFx - dt * 6);
    if (hammerFx) hammerFx.t += dt;
    parts.update(dt);
    const now = songT();

    if (mode === 'play') {
      // 区切り・沸かし直し・心鉄入れ
      for (const ev of events) {
        if (ev.done || now < ev.t) continue;
        ev.done = true;
        if (ev.kind === 'section') enterSection(ev.id);
        else if (ev.kind === 'reheat') { reheatUntil = ev.t + BAR; Sound.whoosh(); scope.timeout(() => Sound.whoosh(), BEAT * 1000); }
        else if (ev.kind === 'insert') { insertAt = ev.t; coreOff = (Math.random() < 0.5 ? -1 : 1) * (1 - avg(acc.tsukuri)) * 16; }
        else if (ev.kind === 'yaki') startYaki();
      }
      if (now < reheatUntil) { T = Math.min(1320, T + 420 * dt); Sound.fire(0.7); } else Sound.fire(0.12);
      if (insertAt >= 0 && coreIn < 1) {
        coreIn = clamp((now - insertAt) / (BEAT * 1.5), 0, 1);
        if (coreIn >= 1) Sound.thud();
      }
      // 師匠の小槌：少し先の音符を正確な時刻で鳴らし、絵は時刻が来たら動かす
      for (const n of chart) {
        if (n.who !== 'M') continue;
        if (!n.scheduled && n.t - now < 0.25) {
          n.scheduled = true;
          if (n.t > now - 0.05) Sound.tickAt(t0 + n.t + (Sound.ctx ? Sound.ctx.outputLatency || 0 : 0));
        }
        if (!n.shown && now >= n.t) {
          n.shown = true;
          masterFx = 1; masterX = targetX(n.step); masterY = topY(n.step);
        }
        if (n.t > now + 0.3) break;
      }
      // 見逃し
      for (const n of pNotes) {
        if (n.judged) continue;
        if (now > n.t + WIN.ok) { n.missed = true; judge(n, 0); }
        else break;
      }
      // 折り返し
      if (foldAnim >= 0) {
        foldAnim += dt / 0.25;
        if (foldAnim >= 1) {
          foldAnim = -1; len /= 2; notch = false; seam = 1;
          folds++; carbon -= 0.04;
          say(L(`${folds}回目の折り返し`, `Fold ${folds}`), 0.9);
        }
      }
    } else if (mode === 'yaki') {
      yk.t += dt;
      if (yk.t > 4.6) end();
    }

    updateCam(dt);
    g.fillStyle = '#0c0807'; g.fillRect(0, 0, W, H);
    g.save();
    if (shake > 0) g.translate(rand(-shake, shake) * 0.5, rand(-shake, shake) * 0.5);
    g.translate(W / 2, H * 0.6); g.scale(cam.z, cam.z); g.translate(-cam.x, -cam.y);
    if (mode === 'yaki' && yk.t < 0) drawScene(0); else drawScene(dt);
    parts.draw(g);
    g.restore();
    // 画面に固定する表示
    g.save();
    let laneBottom = 0;
    if (mode === 'play') laneBottom = drawLane();
    if (combo >= 2 && mode === 'play') {
      g.font = `bold ${fs(c, 22, 1.8)}px "Shippori Mincho", serif`; g.fillStyle = '#ffd77a'; g.textAlign = 'left';
      g.fillText(`${combo} ${L('連', 'combo')}`, 18, H - 16);
    }
    if (now < reheatUntil && mode === 'play') {
      g.font = `bold ${fs(c, 20, 1.7)}px "Shippori Mincho", serif`; g.textAlign = 'center'; g.fillStyle = '#ffe2b0';
      g.fillText(L('沸かし直し', 'Reheating'), W / 2, laneBottom + fs(c, 26, 1.7));
    }
    if (bannerT > 0) drawBanner();
    if (msgT > 0 && mode === 'play') {
      g.font = `bold ${fs(c, 22, 1.6)}px "Shippori Mincho", serif`; g.textAlign = 'center';
      g.fillStyle = `rgba(255,236,200,${clamp(msgT * 2, 0, 1)})`;
      g.fillText(msg, W / 2, laneBottom + fs(c, 52, 1.6));
    }
    g.restore();

    const sec = SECTIONS[curSec];
    ui.status.innerHTML =
      `<div class="stat"><span>${sec.no}</span><b>${sec.title}</b></div>` +
      (sec.id === 'kawa' ? `<div class="stat"><span>${L('折り返し', 'Folds')}</span><b>${folds}/${KAWA_FOLDS}</b></div>` : '') +
      `<div class="stat"><span>${L('連打', 'Combo')}</span><b>${combo}</b></div>`;
  });
}


const STAGES = [
  { id: 'katana', no: '一', title: L('作刀', 'Forge a Katana'), yomi: L('さくとう', 'Sakutō'), run: stageKatana,
    intro: L('師匠（横座）が小槌で<strong>リズムを叩いて見せる</strong>。次の小節で、<strong>同じリズムを大鎚で返せ</strong>。<br>上の譜面で、金の音符が左の輪に重なった瞬間に叩く。鍛錬・造り込み・打ち延ばしを経て、最後は焼入れで「ジュワッ」。',
      'The master taps a <strong>rhythm</strong> with his small hammer. In the next bar, <strong>echo it with your big hammer</strong>.<br>Strike as each gold note reaches the circle on the left. Forge, laminate, draw out — then quench with a hiss.') }
];
