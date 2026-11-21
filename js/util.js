'use strict';
/* 共通ユーティリティ */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const smooth = t => t * t * (3 - 2 * t);

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

function btn(label, cls, onClick) {
  const b = el('button', 'btn ' + (cls || ''), label);
  b.type = 'button';
  if (onClick) b.addEventListener('click', e => { Sound.click(); onClick(e); });
  return b;
}

/* 高DPI対応キャンバス。論理座標 w×h で描画できる */
function makeCanvas(w, h, cls, maxDpr = 2) {
  const c = document.createElement('canvas');
  const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  c.style.aspectRatio = `${w} / ${h}`;
  c.className = cls || 'stage-canvas';
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  c.W = w; c.H = h;
  return [c, g];
}

/* キャンバスの表示幅に応じた拡大率（スマホで縮んだ文字を読める大きさに戻す） */
function uiK(c, max = 2.2) {
  const w = c.getBoundingClientRect().width || c.W;
  return clamp(c.W / w * 0.85, 1, max);
}
const fs = (c, px, max) => Math.round(px * uiK(c, max));

/* 点数の表示：小数点第3位まで（例：95.432） */
const r3 = v => Math.round(v * 1000) / 1000;
const pts = v => (v == null || isNaN(v) ? '-' : Number(v).toFixed(3));

function canvasPos(c, e) {
  const r = c.getBoundingClientRect();
  return [(e.clientX - r.left) * c.W / r.width, (e.clientY - r.top) * c.H / r.height];
}

/* ステージ内のイベント・ループを一括で片付けるためのスコープ */
function makeScope() {
  const offs = [];
  let alive = true;
  return {
    on(target, ev, fn, opt) {
      target.addEventListener(ev, fn, opt);
      offs.push(() => target.removeEventListener(ev, fn, opt));
    },
    loop(fn) {
      let last = performance.now(), id;
      const f = now => {
        if (!alive) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        fn(dt, now / 1000);
        id = requestAnimationFrame(f);
      };
      id = requestAnimationFrame(f);
      offs.push(() => cancelAnimationFrame(id));
    },
    timeout(fn, ms) {
      const id = setTimeout(() => { if (alive) fn(); }, ms);
      offs.push(() => clearTimeout(id));
    },
    dispose() { alive = false; offs.splice(0).forEach(f => f()); },
    get alive() { return alive; }
  };
}

/*
 * 黒体放射に基づく鋼の発光色（℃ → 表示色）。
 * 実際の鍛冶場の薄暗い照明下で見える色味に合わせて調整している。
 *  ~500℃ 消える寸前の暗赤 / 700℃ 暗い桜色 / 800℃ 月の出の色（橙赤）
 *  1000℃ 橙 / 1200℃ 黄橙 / 1300℃~ 沸き（黄白）
 */
const HEAT_STOPS = [
  [20, [58, 56, 54]],
  [450, [64, 54, 50]],
  [520, [86, 30, 18]],
  [600, [122, 24, 10]],
  [680, [158, 30, 8]],
  [750, [196, 46, 10]],
  [820, [226, 74, 14]],
  [900, [244, 104, 20]],
  [1000, [255, 138, 34]],
  [1100, [255, 170, 60]],
  [1200, [255, 200, 98]],
  [1300, [255, 226, 150]],
  [1400, [255, 244, 204]],
  [1550, [255, 255, 248]]
];
function heatRGB(T) {
  if (T <= HEAT_STOPS[0][0]) return HEAT_STOPS[0][1].slice();
  for (let i = 1; i < HEAT_STOPS.length; i++) {
    const [t1, c1] = HEAT_STOPS[i];
    if (T <= t1) {
      const [t0, c0] = HEAT_STOPS[i - 1];
      const f = (T - t0) / (t1 - t0);
      return [lerp(c0[0], c1[0], f), lerp(c0[1], c1[1], f), lerp(c0[2], c1[2], f)];
    }
  }
  return HEAT_STOPS[HEAT_STOPS.length - 1][1].slice();
}
const rgbStr = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mixRGB = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
/* 発光の強さ（0〜1）。500℃前後から光り始める */
const heatGlow = T => clamp((T - 480) / 900, 0, 1);

const KANJI_DIGIT = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
function kanjiNum(n) {
  if (n < 10) return KANJI_DIGIT[n];
  const t = Math.floor(n / 10), o = n % 10;
  return (t > 1 ? KANJI_DIGIT[t] : '') + '十' + (o ? KANJI_DIGIT[o] : '');
}
function reiwaDate(d = new Date()) {
  const y = d.getFullYear() - 2018;
  return `令和${y === 1 ? '元' : kanjiNum(y)}年${kanjiNum(d.getMonth() + 1)}月吉日`;
}

/* パーティクル（火花・水蒸気） */
function makeParticles() {
  const ps = [];
  return {
    list: ps,
    spark(x, y, n, opt = {}) {
      for (let i = 0; i < n; i++) {
        const a = opt.angle != null ? opt.angle + rand(-opt.spread, opt.spread) : rand(-Math.PI, 0);
        const sp = rand(opt.min || 120, opt.max || 520);
        ps.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: rand(0.35, opt.life || 1.0), age: 0, type: 'spark',
          T: opt.T || rand(1100, 1500), size: rand(0.8, 2.0)
        });
      }
    },
    /* 酸化皮膜の破片（黒いかけら）がはがれて飛ぶ */
    flake(x, y, n) {
      for (let i = 0; i < n; i++) {
        const a = rand(-Math.PI * 0.95, -Math.PI * 0.05), sp = rand(80, 320);
        ps.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.5, 1.1), age: 0, type: 'flake',
          size: rand(1.5, 4.5), rot: rand(0, TAU), vr: rand(-14, 14) });
      }
    },
    steam(x, y, n, spread = 120) {
      for (let i = 0; i < n; i++) {
        ps.push({
          x: x + rand(-spread, spread), y: y + rand(-6, 6), vx: rand(-15, 15), vy: rand(-90, -30),
          life: rand(1.2, 2.6), age: 0, type: 'steam', size: rand(10, 26)
        });
      }
    },
    update(dt) {
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.age += dt;
        if (p.age >= p.life) { ps.splice(i, 1); continue; }
        if (p.type === 'spark') {
          p.vy += 620 * dt; p.vx *= 0.985;
          p.T -= 700 * dt;
        } else if (p.type === 'flake') {
          p.vy += 700 * dt; p.vx *= 0.98; p.rot += p.vr * dt;
        } else {
          p.vy *= 0.985; p.vx += rand(-20, 20) * dt; p.size += 18 * dt;
        }
        p.px = p.x; p.py = p.y;
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
    },
    draw(g) {
      g.save();
      for (const p of ps) {
        const k = 1 - p.age / p.life;
        if (p.type === 'flake') {
          g.globalCompositeOperation = 'source-over';
          g.save();
          g.translate(p.x, p.y); g.rotate(p.rot);
          g.fillStyle = `rgba(28,14,8,${0.9 * k})`;
          g.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8);
          g.restore();
          continue;
        }
        if (p.type === 'spark') {
          g.globalCompositeOperation = 'lighter';
          g.strokeStyle = rgbStr(heatRGB(p.T), k);
          g.lineWidth = p.size;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(p.px ?? p.x, p.py ?? p.y);
          g.lineTo(p.x - p.vx * 0.012, p.y - p.vy * 0.012);
          g.stroke();
        } else {
          g.globalCompositeOperation = 'source-over';
          const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
          gr.addColorStop(0, `rgba(220,225,230,${0.22 * k})`);
          gr.addColorStop(1, 'rgba(220,225,230,0)');
          g.fillStyle = gr;
          g.beginPath(); g.arc(p.x, p.y, p.size, 0, TAU); g.fill();
        }
      }
      g.restore();
    }
  };
}
