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
  SECTIONS.forEach((s, i) => {
    const li = el('li', i < active ? 'done' : i === active ? 'now' : '', `<span>${s.no}</span><em>${s.title}</em>`);
    stepsEl.append(li);
  });
}

/* ---------------- タイトル ---------------- */
function showTitle() {
  clearScreen();
  Music.setMood('calm');
  renderHud(-1);
  scope = makeScope();
  const wrap = el('section', 'title-screen');
  const [c, g] = makeCanvas(900, 230, 'title-canvas');
  wrap.innerHTML = `
    <p class="kicker">${L('日本刀づくり', 'THE ART OF THE JAPANESE SWORD')}</p>
    <h1 class="logo"><span>刀</span><span>鍛</span><span>冶</span></h1>
    ${EN ? '<p class="logo-en">KATANA KAJI</p>' : ''}
    <p class="lead">${L('叩いて、叩いて、叩いて——ジュワッ。<br>師匠の小槌に合わせて大鎚を振るい、世界に一振りの日本刀を打て。', 'Strike, strike, strike — hiss.<br>Swing the big hammer to your master’s rhythm and forge a one-of-a-kind katana.')}</p>`;
  wrap.append(c);
  const menu = el('div', 'menu');
  menu.append(
    btn(L('鍛刀を始める', 'Start Forging'), 'primary big', () => newGame()),
    btn(L(`蔵を見る（${loadKura().length}）`, `Collection (${loadKura().length})`), '', () => showKura()),
    btn(L('遊び方', 'How to Play'), '', () => showHowto())
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
  Music.setMood('calm');
  const wrap = el('section', 'page howto-page');
  wrap.append(el('h2', '', L('遊び方', 'How to Play')));
  wrap.append(el('p', 'howto-lead', L('操作は<strong>叩くだけ</strong>。師匠の小槌が「トン」と鳴ったら、半拍後に「カン」と打つ。画面のどこを叩いてもよい。',
    'The only control is <strong>striking</strong>. When the master’s small hammer goes “tonk”, strike “KAN!” half a beat later — tap anywhere.')));
  const list = el('ol', 'howto');
  SECTIONS.forEach(s => list.append(el('li', '', `<h3><span class="no">${s.no}</span>${s.title}</h3><p>${s.how}</p>`)));
  wrap.append(list);
  wrap.append(btn(L('戻る', 'Back'), 'big', () => showTitle()));
  screen.append(wrap);
}

/* ---------------- ゲーム進行 ---------------- */
function newGame() {
  Sound.init();
  let smith = '';
  try { smith = localStorage.getItem('kaji.smith') || ''; } catch (e) { /* 無視 */ }
  state = {
    scores: {}, comments: {}, seed: Math.floor(Math.random() * 1e9),
    name: SWORD_NAMES[Math.floor(Math.random() * SWORD_NAMES.length)], smith, date: reiwaDate()
  };
  runStage(0);
}

const STAGE_MOOD = { katana: 'forge' };
function runStage(i) {
  clearScreen();
  Music.setMood(STAGE_MOOD[STAGES[i].id] || 'calm');
  renderHud(0);
  const s = STAGES[i];
  const card = el('section', 'intro');
  card.innerHTML = `
    <p class="stage-no">${L('作刀', 'FORGING')}</p>
    <h2>${s.title}</h2>
    <p class="yomi">${s.yomi}</p>
    <p class="body">${s.intro}</p>`;
  const go = btn(L('始める', 'Begin'), 'primary big', () => start());
  card.append(go);
  screen.append(card);
  go.focus();

  function start() {
    clearScreen();
    renderHud(0);
    const root = el('section', 'stage');
    screen.append(root);
    scope = makeScope();
    let called = false;
    s.run({
      root, scope, state,
      section: k => renderHud(k),
      finish(score, comment) {
        if (called) return;
        called = true;
        if (score != null) state.scores[s.id] = score;
        state.comments[s.id] = comment;
        scope.dispose(); scope = null;
        Sound.stopLoops();
        if (i === STAGES.length - 1 && score == null) showAppraisal();
        else showStageResult(i, score, comment);
      }
    });
  }
}

function grade(score) {
  if (score >= 90) return [L('秀', 'S'), 'g-s'];
  if (score >= 75) return [L('優', 'A'), 'g-a'];
  if (score >= 55) return [L('良', 'B'), 'g-b'];
  if (score >= 35) return [L('可', 'C'), 'g-c'];
  return [L('拙', 'D'), 'g-d'];
}

function showStageResult(i, score, comment) {
  const s = STAGES[i];
  const overlay = el('div', 'overlay');
  const box = el('div', 'result-card');
  const [gr, cls] = score == null ? ['', ''] : grade(score);
  box.innerHTML = `
    <p class="stage-no">${L(`第${s.no}の工程　${s.title}`, `STEP ${i + 1} · ${s.title}`)}</p>
    ${score == null ? `<p class="big-mark">${L('了', '✓')}</p>` : `<p class="big-mark ${cls}">${gr}</p><p class="score">${score}<small> / 100</small></p>`}
    <p class="comment">${comment || ''}</p>`;
  const last = i === STAGES.length - 1;
  const next = btn(last ? L('鑑定へ', 'Appraisal') : L('次の工程へ', 'Next Step'), 'primary', () => {
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
  [92, '最上大業物', L('さいじょうおおわざもの', 'Supreme masterpiece'), L('天下に二つとない名刀。後世まで国の宝として伝えられよう。', 'A blade without equal under heaven, destined to be a national treasure. ')],
  [82, '大業物', L('おおわざもの', 'Masterwork'), L('名工の手になる一振り。武士が家宝として伝える名刀である。', 'The work of a master — a sword a samurai family would pass down for generations. ')],
  [70, '良業物', L('よきわざもの', 'Excellent'), L('切れ味・姿ともに優れた良刀。', 'A fine sword, excellent in both cutting and form. ')],
  [58, '業物', L('わざもの', 'Good'), L('実用に足る、確かな出来の刀。', 'A solid, battle-worthy blade. ')],
  [40, '数打物', L('かずうちもの', 'Mass-produced'), L('並の出来。まだまだ修業が必要だ。', 'Ordinary work. Much training remains. ')],
  [0, '鈍刀', L('なまくら', 'Dull blade'), L('これでは大根も切れぬ…。師匠に叱られる出来だ。', 'This could not even cut a radish… Your master will not be pleased. ')]
];

function computeResult(st) {
  const sc = st.scores;
  const kw = sc.kawa ?? 50, sh = sc.shin ?? 50, k = sc.tsukuri ?? 50, n = sc.nobashi ?? 50, q = sc.quench ?? 50;
  let sharp = 0.4 * kw + 0.15 * k + 0.45 * q;
  let tough = 0.25 * kw + 0.35 * sh + 0.3 * k + 0.1 * n;
  let beauty = 0.3 * kw + 0.35 * n + 0.35 * q;
  if (st.crack) { tough *= 0.35; sharp *= 0.7; beauty *= 0.75; }
  const total = Math.round((sharp + tough + beauty) / 3);
  let rank = RANKS.find(r => total >= r[0]);
  if (st.crack && rank[0] > 40) rank = RANKS[4];
  return { sharp: Math.round(sharp), tough: Math.round(tough), beauty: Math.round(beauty), total, rank };
}

function appraiserWords(st, r) {
  const sc = st.scores;
  const names = EN ? { kawa: 'skin-steel forging', shin: 'core steel', tsukuri: 'lamination', nobashi: 'drawing out', quench: 'quench' } : { kawa: '皮鉄の鍛錬', shin: '心鉄', tsukuri: '造り込み', nobashi: '打ち延ばし', quench: '焼入れ' };
  const ent = Object.entries(sc).filter(([k]) => names[k]);
  ent.sort((a, b) => b[1] - a[1]);
  const best = ent[0], worst = ent[ent.length - 1];
  const parts = [];
  if (EN) {
    if (st.crack) parts.push('Sadly, a quench crack runs through the edge — it could never be used in battle. ');
    parts.push(`The ${names[best[0]]} is especially fine. `);
    if (worst[1] < 70) parts.push(`The ${names[worst[0]]} leaves room for improvement. `);
    if (st.method === 'maru') parts.push('Being maru-gitae, it naturally lacks resilience. ');
    const hn = st.hamonName === '自作' ? 'your own hamon' : `the ${term(st.hamonName)} hamon`;
    parts.push(`The ${term(st.grainName || '板目肌')} is ${(st.purity ?? 0.8) >= 0.85 ? 'tight and refined' : 'somewhat coarse'}, and ${hn} is ${(st.hamonStrength ?? 1) > 0.7 ? 'bright and vivid' : 'faint'}.`);
    return parts.join('');
  }
  if (st.crack) parts.push('惜しむらくは刃に焼割れがある。これでは実戦には使えぬ。');
  parts.push(`${names[best[0]]}が特に見事である。`);
  if (worst[1] < 70) parts.push(`${names[worst[0]]}にはまだ工夫の余地があろう。`);
  const hn = st.hamonName === '自作' ? '独自の刃文' : `${st.hamonName}の刃文`;
  if (st.method === 'maru') parts.push('丸鍛えゆえ、粘りに欠けるのは致し方なし。');
  parts.push(`地鉄は${(st.purity ?? 0.8) >= 0.85 ? 'よく詰んだ' : 'やや肌立った'}${st.grainName || '板目肌'}、${hn}が${(st.hamonStrength ?? 1) > 0.7 ? '冴えている' : '淡く沈んでいる'}。`);
  return parts.join('');
}

function swordOptions(rec, x, y, length, width) {
  return {
    x, y, length, width,
    sori: (rec.sori ?? 16) * length / 760,
    hamon: rec.hamon,
    hamonStrength: rec.hamonStrength ?? 1,
    polish: clamp((rec.polish ?? 60) / 100, 0.15, 1),
    folds: rec.jiFolds ?? rec.folds ?? 12,
    grain: rec.grain,
    crack: rec.crack,
    scratches: rec.scratches || 0,
    seed: rec.seed || 1
  };
}

function showAppraisal() {
  clearScreen();
  Music.setMood('finale');
  renderHud(SECTIONS.length);
  const r = computeResult(state);
  const rec = {
    id: Date.now(),
    name: state.name, smith: state.smith, date: state.date,
    rank: r.rank[1], rankYomi: r.rank[2], total: r.total,
    sharp: r.sharp, tough: r.tough, beauty: r.beauty,
    hamon: state.hamon, hamonName: state.hamonName, hamonStrength: state.hamonStrength,
    folds: state.folds, jiFolds: state.jiFolds, grain: state.grain, grainName: state.grainName, method: state.methodName, crack: !!state.crack, polish: state.polish, scratches: state.scratches,
    sori: state.sori, seed: state.seed, quenchT: state.quenchT, carbon: state.carbon,
    scores: state.scores
  };
  const list = loadKura();
  list.unshift(rec);
  const saved = saveKura(list.slice(0, 60));

  const wrap = el('section', 'appraisal');
  const head = el('div', 'appraisal-head');
  const renderHead = () => {
    head.innerHTML = EN
      ? `<p class="kicker">CERTIFICATE OF APPRAISAL</p><h2 class="sword-name">“${term(rec.name)}”</h2>
      <p class="mei">Signed: ${rec.smith ? 'made by ' + rec.smith : 'unsigned (mumei)'}</p>`
      : `<p class="kicker">鑑定書</p><h2 class="sword-name">号「${rec.name}」</h2>
      <p class="mei">銘　${rec.smith ? rec.smith + '作' : '無銘'}　${rec.smith ? '／ ' + rec.date : ''}</p>`;
  };
  renderHead();
  wrap.append(head);
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
  const seal = el('div', 'rank-seal', `<span class="rank">${term(r.rank[1])}</span><span class="yomi">${r.rank[2]}</span><span class="total">${L('総合', 'Total')} ${r.total}</span>`);
  const stats = el('div', 'stats');
  const bar = (label, v) => `<div class="statbar"><span>${label}</span><i><b style="width:${v}%"></b></i><em>${v}</em></div>`;
  stats.innerHTML = bar(L('切れ味', 'Sharpness'), r.sharp) + bar(L('強靭さ', 'Toughness'), r.tough) + bar(L('美しさ', 'Beauty'), r.beauty);
  const detail = el('dl', 'detail');
  const [PO, PC] = EN ? [' (', ')'] : ['（', '）'];
  const sc = state.scores;
  detail.innerHTML = `
    <dt>${L('皮鉄', 'Skin')}</dt><dd>${sc.kawa}${PO}${L(`折り返し${state.folds}回`, `${state.folds} folds`)}${PC}</dd>
    <dt>${L('心鉄', 'Core')}</dt><dd>${sc.shin}</dd>
    <dt>${L('造り込み', 'Lamination')}</dt><dd>${sc.tsukuri}</dd>
    <dt>${L('打ち延ばし', 'Drawing')}</dt><dd>${sc.nobashi}</dd>
    <dt>${L('焼入れ', 'Quench')}</dt><dd>${sc.quench}${PO}${L('約', '~')}${state.quenchT}℃${PC}</dd>
    <dt>${L('刃文', 'Hamon')}</dt><dd>${term(state.hamonName)}</dd>`;
  stats.append(detail);
  body.append(seal, stats);
  wrap.append(body);
  wrap.append(el('p', 'verdict', `<strong>${L('鑑定士いわく：', 'The appraiser says: ')}</strong>${r.rank[3]}${appraiserWords(state, r)}`));
  if (!saved) wrap.append(el('p', 'note', L('※ ブラウザの設定により、蔵への保存ができませんでした。', '* Your browser settings prevented saving to the collection.')));
  else wrap.append(el('p', 'note', L('この刀は蔵に納められた。', 'This sword has been added to your collection.')));
  // 銘と号（任意）
  const naming = el('div', 'naming');
  naming.innerHTML = `
    <label>${L('号（刀の名）', 'Sword name')}<input id="nm-name" maxlength="${EN ? 18 : 10}" value=""></label>
    <label>${L('刀工名（銘）', 'Your name')}<input id="nm-smith" maxlength="${EN ? 14 : 8}" placeholder="${L('空欄は無銘', 'blank = unsigned')}" value=""></label>`;
  const nmName = naming.querySelector('#nm-name'), nmSmith = naming.querySelector('#nm-smith');
  nmName.value = term(rec.name); nmSmith.value = rec.smith || '';
  let shareBox = Share.buttons(rec, swordOpt);
  const applyName = () => {
    const v = nmName.value.trim();
    if (v && v !== term(rec.name)) rec.name = v;
    rec.smith = nmSmith.value.trim();
    try { localStorage.setItem('kaji.smith', rec.smith); } catch (e) { /* 無視 */ }
    const l = loadKura(); const ix = l.findIndex(x => x.id === rec.id);
    if (ix >= 0) { l[ix].name = rec.name; l[ix].smith = rec.smith; saveKura(l); }
    renderHead();
    const nb = Share.buttons(rec, swordOpt); shareBox.replaceWith(nb); shareBox = nb;
  };
  nmName.addEventListener('change', applyName);
  nmSmith.addEventListener('change', applyName);
  wrap.append(naming);
  wrap.append(shareBox);
  const menu = el('div', 'menu');
  menu.append(btn(L('もう一振り打つ', 'Forge Another'), 'primary', () => newGame()), btn(L('蔵を見る', 'Collection'), '', () => showKura()), btn(L('タイトルへ', 'Title'), '', () => showTitle()));
  wrap.append(menu);
  screen.append(wrap);
  Sound.gong();
}

/* ---------------- 蔵 ---------------- */
function showKura() {
  clearScreen();
  Music.setMood('calm');
  renderHud(-1);
  const wrap = el('section', 'page');
  wrap.append(el('h2', '', L('蔵', 'Collection')));
  const list = loadKura();
  if (!list.length) wrap.append(el('p', 'note', L('まだ一振りも納められていない。', 'No swords yet.')));
  const grid = el('div', 'kura');
  list.forEach((rec, idx) => {
    const item = el('article', 'kura-item');
    const [c, g] = makeCanvas(640, 120, 'kura-canvas');
    Sword.draw(g, { ...swordOptions(rec, 160, 66, 450, 36), bg: '#17120e' });
    item.append(c);
    item.append(el('div', 'kura-info', `
      <h3>${L(`「${rec.name}」`, `“${term(rec.name)}”`)}<small>${rec.smith ? L(rec.smith + '作', 'by ' + rec.smith) : L('無銘', 'unsigned')}</small></h3>
      <p><span class="rank-tag">${term(rec.rank)}</span> ${L('総合', 'Total')} ${rec.total}　${L(`切れ味 ${rec.sharp}・強靭さ ${rec.tough}・美しさ ${rec.beauty}`, `Sharp ${rec.sharp} · Tough ${rec.tough} · Beauty ${rec.beauty}`)}</p>
      <p class="small">${EN
        ? `${rec.method ? term(rec.method) + ' · ' : ''}${term(rec.hamonName) || ''} hamon · ${rec.folds} folds${rec.crack ? ' · <span class="bad">quench crack</span>' : ''}`
        : `${rec.date || ''}　${rec.method ? rec.method + '・' : ''}${rec.hamonName || ''}の刃文・${rec.folds}回鍛錬${rec.crack ? '・<span class="bad">焼割れ</span>' : ''}`}</p>`));
    const del = btn(L('手放す', 'Remove'), 'small ghost', () => {
      if (!confirm(L(`「${rec.name}」を蔵から手放しますか？`, `Remove “${term(rec.name)}” from your collection?`))) return;
      const l = loadKura(); l.splice(idx, 1); saveKura(l); showKura();
    });
    item.append(del);
    grid.append(item);
  });
  wrap.append(grid);
  wrap.append(btn(L('戻る', 'Back'), '', () => showTitle()));
  screen.append(wrap);
}

/* ---------------- 起動 ---------------- */
document.getElementById('sound').addEventListener('click', e => {
  Sound.init();
  const on = Sound.toggle();
  e.currentTarget.textContent = on ? L('音：入', 'SFX: On') : L('音：切', 'SFX: Off');
});
document.getElementById('home').addEventListener('click', () => {
  if (state && !confirm(L('作刀を中断してタイトルに戻りますか？', 'Abandon this sword and return to the title?'))) return;
  state = null;
  showTitle();
});
document.getElementById('sound').textContent = L('音：入', 'SFX: On');
document.getElementById('home').textContent = L('刀鍛冶', 'Katana Kaji');
const langBtn = document.getElementById('lang');
langBtn.textContent = EN ? '日本語' : 'English';
langBtn.addEventListener('click', () => {
  if (state && !confirm(L('言語を切り替えると作刀は中断されます。よろしいですか？', 'Switching language will abandon the current sword. Continue?'))) return;
  setLang(EN ? 'ja' : 'en');
});
const bgmBtn = document.getElementById('bgm');
bgmBtn.textContent = Music.enabled ? L('BGM：入', 'BGM: On') : L('BGM：切', 'BGM: Off');
bgmBtn.addEventListener('click', () => {
  Sound.init();
  bgmBtn.textContent = Music.toggle() ? L('BGM：入', 'BGM: On') : L('BGM：切', 'BGM: Off');
});
/* ブラウザの自動再生制限のため、最初の操作で音を開始する */
const firstGesture = () => {
  Sound.init();
  if (Music.enabled) Music.start();
  window.removeEventListener('pointerdown', firstGesture);
  window.removeEventListener('keydown', firstGesture);
};
window.addEventListener('pointerdown', firstGesture);
window.addEventListener('keydown', firstGesture);

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
