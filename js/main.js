'use strict';
/* 画面遷移・鑑定・蔵（保存） */
const screen = document.getElementById('screen');
const hud = document.getElementById('hud');
const stepsEl = document.getElementById('steps');
const KURA_KEY = 'kaji.kura.v1';

let state = null;
let scope = null;

function clearScreen() {
  if (scope) { scope.dispose(); scope = null; }
  Sound.stopLoops();
  screen.innerHTML = '';
  window.scrollTo(0, 0);
}

function loadKura() {
  try { return JSON.parse(localStorage.getItem(KURA_KEY)) || []; } catch (e) { return []; }
}
function saveKura(list) {
  try { localStorage.setItem(KURA_KEY, JSON.stringify(list)); return true; } catch (e) { return false; }
}

function renderHud(active) {
  hud.hidden = active < 0;
  stepsEl.innerHTML = '';
  STAGES.forEach((s, i) => {
    const li = el('li', i < active ? 'done' : i === active ? 'now' : '', `<span>${s.no}</span><em>${s.title}</em>`);
    stepsEl.append(li);
  });
}

/* ---------------- タイトル ---------------- */
function showTitle() {
  clearScreen();
  renderHud(-1);
  scope = makeScope();
  const wrap = el('section', 'title-screen');
  const [c, g] = makeCanvas(900, 230, 'title-canvas');
  wrap.innerHTML = `
    <p class="kicker">日本刀づくり</p>
    <h1 class="logo"><span>刀</span><span>鍛</span><span>冶</span></h1>
    <p class="lead">玉鋼を鍛え、組み、焼き、研ぐ。<br>刀匠の七つの工程をたどり、世界に一振りの日本刀を打て。</p>`;
  wrap.append(c);
  const menu = el('div', 'menu');
  menu.append(
    btn('鍛刀を始める', 'primary big', () => newGame()),
    btn(`蔵を見る（${loadKura().length}）`, '', () => showKura()),
    btn('工程について', '', () => showHowto())
  );
  wrap.append(menu);
  screen.append(wrap);
  // 刀身に光が流れる演出
  const hamon = Array.from({ length: HAMON_N }, (_, i) => HAMON_PRESETS['互の目'](i / (HAMON_N - 1)));
  let t = 0;
  scope.loop(dt => {
    t += dt;
    g.clearRect(0, 0, 900, 230);
    Sword.draw(g, { x: 190, y: 120, length: 660, width: 62, sori: 18, hamon, polish: 0.95, folds: 14, seed: 3, bg: '#0d0a08' });
    // 流れる光
    const x = ((t * 0.35) % 1.6 - 0.3) * 900;
    g.save();
    g.globalCompositeOperation = 'lighter';
    const gr = g.createLinearGradient(x - 80, 0, x + 80, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.22)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    const G = Sword.geom({ x: 190, y: 120, length: 660, width: 62, sori: 18 });
    const p = new Path2D();
    for (let i = 0; i <= 100; i++) { const q = G.P(Sword.HABAKI + i / 100 * (1 - Sword.HABAKI), 1); i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1]); }
    for (let i = 100; i >= 0; i--) { const q = G.P(Sword.HABAKI + i / 100 * (1 - Sword.HABAKI), 0); p.lineTo(q[0], q[1]); }
    g.fill(p);
    g.restore();
  });
}

/* ---------------- 遊び方 ---------------- */
function showHowto() {
  clearScreen();
  const wrap = el('section', 'page');
  wrap.append(el('h2', '', '日本刀ができるまで'));
  const list = el('ol', 'howto');
  STAGES.forEach(s => list.append(el('li', '', `<h3><span class="no">${s.no}</span>${s.title}<small>${s.yomi}</small></h3><p>${s.intro}</p>`)));
  wrap.append(list);
  wrap.append(el('p', 'note', '各工程の出来が「切れ味」「強靭さ」「美しさ」に影響し、最後に鑑定が行われます。パソコンではキーボード（Space / Enter）、スマートフォンではタップ・ドラッグで操作できます。'));
  wrap.append(btn('戻る', '', () => showTitle()));
  screen.append(wrap);
}

/* ---------------- ゲーム進行 ---------------- */
function newGame() {
  Sound.init();
  state = { scores: {}, comments: {}, seed: Math.floor(Math.random() * 1e9) };
  runStage(0);
}

function runStage(i) {
  clearScreen();
  renderHud(i);
  const s = STAGES[i];
  const card = el('section', 'intro');
  card.innerHTML = `
    <p class="stage-no">第${s.no}の工程</p>
    <h2>${s.title}</h2>
    <p class="yomi">${s.yomi}</p>
    <p class="body">${s.intro}</p>`;
  const go = btn('始める', 'primary big', () => start());
  card.append(go);
  screen.append(card);
  go.focus();

  function start() {
    clearScreen();
    renderHud(i);
    const root = el('section', 'stage');
    root.append(el('h2', 'stage-title', `<span>${s.no}</span>${s.title}`));
    screen.append(root);
    scope = makeScope();
    let called = false;
    s.run({
      root, scope, state,
      finish(score, comment) {
        if (called) return;
        called = true;
        if (score != null) state.scores[s.id] = score;
        state.comments[s.id] = comment;
        scope.dispose(); scope = null;
        Sound.stopLoops();
        showStageResult(i, score, comment);
      }
    });
  }
}

function grade(score) {
  if (score >= 90) return ['秀', 'g-s'];
  if (score >= 75) return ['優', 'g-a'];
  if (score >= 55) return ['良', 'g-b'];
  if (score >= 35) return ['可', 'g-c'];
  return ['拙', 'g-d'];
}

function showStageResult(i, score, comment) {
  const s = STAGES[i];
  const overlay = el('div', 'overlay');
  const box = el('div', 'result-card');
  const [gr, cls] = score == null ? ['', ''] : grade(score);
  box.innerHTML = `
    <p class="stage-no">第${s.no}の工程　${s.title}</p>
    ${score == null ? '<p class="big-mark">了</p>' : `<p class="big-mark ${cls}">${gr}</p><p class="score">${score}<small> / 100</small></p>`}
    <p class="comment">${comment || ''}</p>`;
  const last = i === STAGES.length - 1;
  const next = btn(last ? '鑑定へ' : '次の工程へ', 'primary', () => {
    overlay.remove();
    if (last) showAppraisal(); else runStage(i + 1);
  });
  box.append(next);
  overlay.append(box);
  screen.append(overlay);
  if (score != null && score >= 75) Sound.chime();
  setTimeout(() => next.focus(), 50);
}

/* ---------------- 鑑定 ---------------- */
const RANKS = [
  [92, '最上大業物', 'さいじょうおおわざもの', '天下に二つとない名刀。後世まで国の宝として伝えられよう。'],
  [82, '大業物', 'おおわざもの', '名工の手になる一振り。武士が家宝として伝える名刀である。'],
  [70, '良業物', 'よきわざもの', '切れ味・姿ともに優れた良刀。'],
  [58, '業物', 'わざもの', '実用に足る、確かな出来の刀。'],
  [40, '数打物', 'かずうちもの', '並の出来。まだまだ修業が必要だ。'],
  [0, '鈍刀', 'なまくら', 'これでは大根も切れぬ…。師匠に叱られる出来だ。']
];

function computeResult(st) {
  const sc = st.scores;
  const f = sc.forge ?? 50, k = sc.tsukuri ?? 50, s = sc.shape ?? 50, h = sc.clay ?? 50, q = sc.quench ?? 50, p = sc.polish ?? 50;
  let sharp = 0.35 * f + 0.1 * k + 0.35 * q + 0.2 * p;
  let tough = (0.35 * f + 0.35 * k + 0.2 * s + 0.1 * q) * (st.methodTough ?? 1);
  let beauty = 0.3 * h + 0.35 * p + 0.15 * s + 0.2 * q;
  if (st.crack) { tough *= 0.35; sharp *= 0.7; beauty *= 0.75; }
  const total = Math.round((sharp + tough + beauty) / 3);
  let rank = RANKS.find(r => total >= r[0]);
  if (st.crack && rank[0] > 40) rank = RANKS[4];
  return { sharp: Math.round(sharp), tough: Math.round(tough), beauty: Math.round(beauty), total, rank };
}

function appraiserWords(st, r) {
  const sc = st.scores;
  const names = { forge: '鍛錬', tsukuri: '造り込み', shape: '姿', clay: '土置き', quench: '焼入れ', polish: '研ぎ' };
  const ent = Object.entries(sc).filter(([k]) => names[k]);
  ent.sort((a, b) => b[1] - a[1]);
  const best = ent[0], worst = ent[ent.length - 1];
  const parts = [];
  if (st.crack) parts.push('惜しむらくは刃に焼割れがある。これでは実戦には使えぬ。');
  parts.push(`${names[best[0]]}が特に見事である。`);
  if (worst[1] < 70) parts.push(`${names[worst[0]]}にはまだ工夫の余地があろう。`);
  const hn = st.hamonName === '自作' ? '独自の刃文' : `${st.hamonName}の刃文`;
  if (st.method === 'maru') parts.push('丸鍛えゆえ、粘りに欠けるのは致し方なし。');
  parts.push(`地鉄は${st.folds}回の折り返しで${st.folds >= 12 ? 'よく詰み' : 'やや肌立ち'}、${hn}が${(st.hamonStrength ?? 1) > 0.7 ? '冴えている' : '淡く沈んでいる'}。`);
  return parts.join('');
}

function swordOptions(rec, x, y, length, width) {
  return {
    x, y, length, width,
    sori: (rec.sori ?? 16) * length / 760,
    hamon: rec.hamon,
    hamonStrength: rec.hamonStrength ?? 1,
    polish: clamp((rec.polish ?? 60) / 100, 0.15, 1),
    folds: rec.folds ?? 12,
    crack: rec.crack,
    scratches: rec.scratches || 0,
    seed: rec.seed || 1
  };
}

function showAppraisal() {
  clearScreen();
  renderHud(STAGES.length);
  const r = computeResult(state);
  const rec = {
    id: Date.now(),
    name: state.name, smith: state.smith, date: state.date,
    rank: r.rank[1], rankYomi: r.rank[2], total: r.total,
    sharp: r.sharp, tough: r.tough, beauty: r.beauty,
    hamon: state.hamon, hamonName: state.hamonName, hamonStrength: state.hamonStrength,
    folds: state.folds, method: state.methodName, crack: !!state.crack, polish: state.polish, scratches: state.scratches,
    sori: state.sori, seed: state.seed, quenchT: state.quenchT, carbon: state.carbon,
    scores: state.scores
  };
  const list = loadKura();
  list.unshift(rec);
  const saved = saveKura(list.slice(0, 60));

  const wrap = el('section', 'appraisal');
  wrap.innerHTML = `<p class="kicker">鑑定書</p><h2 class="sword-name">号「${rec.name}」</h2>
    <p class="mei">銘　${rec.smith ? rec.smith + '作' : '無銘'}　${rec.smith ? '／ ' + rec.date : ''}</p>`;
  const [c, g] = makeCanvas(1000, 250, 'sword-canvas');
  wrap.append(c);
  const swordOpt = swordOptions(rec, 250, 140, 700, 64);
  let shine = 0;
  scope = makeScope();
  scope.loop(dt => {
    shine += dt;
    g.clearRect(0, 0, 1000, 250);
    Sword.draw(g, { ...swordOpt, bg: '#120e0b' });
  });

  const body = el('div', 'appraisal-body');
  const seal = el('div', 'rank-seal', `<span class="rank">${r.rank[1]}</span><span class="yomi">${r.rank[2]}</span><span class="total">総合 ${r.total}</span>`);
  const stats = el('div', 'stats');
  const bar = (label, v) => `<div class="statbar"><span>${label}</span><i><b style="width:${v}%"></b></i><em>${v}</em></div>`;
  stats.innerHTML = bar('切れ味', r.sharp) + bar('強靭さ', r.tough) + bar('美しさ', r.beauty);
  const detail = el('dl', 'detail');
  const sc = state.scores;
  detail.innerHTML = `
    <dt>鍛錬</dt><dd>${sc.forge}（${state.folds}回・${(2 ** state.folds).toLocaleString()}層）</dd>
    <dt>造り込み</dt><dd>${sc.tsukuri}（${state.methodName}）</dd><dt>火造り</dt><dd>${sc.shape}</dd><dt>土置き</dt><dd>${sc.clay}（${state.hamonName}）</dd>
    <dt>焼入れ</dt><dd>${sc.quench}（約${state.quenchT}℃）</dd><dt>研ぎ</dt><dd>${sc.polish}</dd>`;
  stats.append(detail);
  body.append(seal, stats);
  wrap.append(body);
  wrap.append(el('p', 'verdict', `<strong>鑑定士いわく：</strong>${r.rank[3]}${appraiserWords(state, r)}`));
  if (!saved) wrap.append(el('p', 'note', '※ ブラウザの設定により、蔵への保存ができませんでした。'));
  else wrap.append(el('p', 'note', 'この刀は蔵に納められた。'));
  const menu = el('div', 'menu');
  menu.append(btn('もう一振り打つ', 'primary', () => newGame()), btn('蔵を見る', '', () => showKura()), btn('タイトルへ', '', () => showTitle()));
  wrap.append(menu);
  screen.append(wrap);
  Sound.gong();
}

/* ---------------- 蔵 ---------------- */
function showKura() {
  clearScreen();
  renderHud(-1);
  const wrap = el('section', 'page');
  wrap.append(el('h2', '', '蔵'));
  const list = loadKura();
  if (!list.length) wrap.append(el('p', 'note', 'まだ一振りも納められていない。'));
  const grid = el('div', 'kura');
  list.forEach((rec, idx) => {
    const item = el('article', 'kura-item');
    const [c, g] = makeCanvas(640, 120, 'kura-canvas');
    Sword.draw(g, { ...swordOptions(rec, 160, 66, 450, 36), bg: '#17120e' });
    item.append(c);
    item.append(el('div', 'kura-info', `
      <h3>「${rec.name}」<small>${rec.smith ? rec.smith + '作' : '無銘'}</small></h3>
      <p><span class="rank-tag">${rec.rank}</span> 総合 ${rec.total}　切れ味 ${rec.sharp}・強靭さ ${rec.tough}・美しさ ${rec.beauty}</p>
      <p class="small">${rec.date || ''}　${rec.method ? rec.method + '・' : ''}${rec.hamonName || ''}の刃文・${rec.folds}回鍛錬${rec.crack ? '・<span class="bad">焼割れ</span>' : ''}</p>`));
    const del = btn('手放す', 'small ghost', () => {
      if (!confirm(`「${rec.name}」を蔵から手放しますか？`)) return;
      const l = loadKura(); l.splice(idx, 1); saveKura(l); showKura();
    });
    item.append(del);
    grid.append(item);
  });
  wrap.append(grid);
  wrap.append(btn('戻る', '', () => showTitle()));
  screen.append(wrap);
}

/* ---------------- 起動 ---------------- */
document.getElementById('sound').addEventListener('click', e => {
  Sound.init();
  const on = Sound.toggle();
  e.currentTarget.textContent = on ? '音：入' : '音：切';
});
document.getElementById('home').addEventListener('click', () => {
  if (state && !confirm('作刀を中断してタイトルに戻りますか？')) return;
  state = null;
  showTitle();
});
window.addEventListener('pointerdown', () => Sound.init(), { once: true });

/* 背景の火の粉 */
(function embers() {
  const c = document.getElementById('embers');
  const g = c.getContext('2d');
  let w, h;
  const ps = [];
  const resize = () => { w = c.width = innerWidth; h = c.height = innerHeight; };
  resize();
  addEventListener('resize', resize);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  let last = performance.now();
  function f(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (ps.length < 40 && Math.random() < 0.3) ps.push({ x: Math.random() * w, y: h + 10, vy: rand(20, 60), vx: rand(-10, 10), life: rand(4, 9), age: 0, s: rand(0.8, 2.2) });
    g.clearRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter';
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.age += dt; p.y -= p.vy * dt; p.x += (p.vx + Math.sin(now / 700 + i) * 12) * dt;
      if (p.age > p.life) { ps.splice(i, 1); continue; }
      const k = Math.sin(p.age / p.life * Math.PI);
      g.fillStyle = rgbStr(heatRGB(1000 + 200 * k), 0.5 * k);
      g.beginPath(); g.arc(p.x, p.y, p.s, 0, TAU); g.fill();
    }
    requestAnimationFrame(f);
  }
  requestAnimationFrame(f);
})();

showTitle();
