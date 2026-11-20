'use strict';
/*
 * 日本刀の描画。
 * 刀身を (t, v) 座標で表す: t = 0(区/はばき) → 1(切先)、v = 0(刃先) → 1(棟)。
 * 断面の稜（鎬）や地鉄・刃文・沸・匂・足を層ごとに描いて実物の質感に近づける。
 */
const Sword = (() => {
  const TK = 0.885;       // 横手（切先の始まり）
  const SHINOGI = 0.70;   // 鎬筋の位置
  const HABAKI = 0.04;

  function geom(o) {
    const L = o.length, W = o.width, x0 = o.x, y0 = o.y, sori = o.sori || 0;
    // 反り：腰反り気味（中心よりやや元寄りが高い）
    const dev = t => sori * 4 * t * (1 - t) * (1 + 0.25 * (0.5 - t));
    const C = t => [x0 + t * L, y0 - dev(t)];
    const N = t => {
      const e = 0.002;
      const dy = -(dev(t + e) - dev(t - e)) / (2 * e);
      const len = Math.hypot(L, dy);
      return [dy / len, -L / len];
    };
    const w = t => W * (1 - 0.33 * clamp(t, 0, 1));
    const vEdge = t => {
      if (t <= TK) return 0;
      const s = Math.min(1, (t - TK) / (1 - TK));
      return 1 - Math.sqrt(Math.max(0, 1 - s * s));   // ふくら
    };
    const spineDrop = t => {
      if (t <= TK) return 0;
      const s = (t - TK) / (1 - TK);
      return s * s * 0.18;                             // 棟側もわずかに下がる
    };
    const P = (t, v) => {
      const ve = vEdge(t), sd = spineDrop(t);
      const top = 1 - sd;
      const lower = ve * top;
      const vv = lower + v * (top - lower);
      const c = C(t), n = N(t), ww = w(t);
      const off = (vv - 0.5) * ww;
      return [c[0] + n[0] * off, c[1] + n[1] * off];
    };
    return { C, N, w, P, L, W, x0, y0 };
  }

  function hAt(h, t) {
    if (!h || !h.length) return 0.22;
    const N = h.length;
    const u = clamp(t / TK, 0, 1) * (N - 1);
    const i = Math.floor(u), f = u - i;
    const a = h[Math.min(i, N - 1)], b = h[Math.min(i + 1, N - 1)];
    let v = a * (1 - f) + b * f;
    if (t > TK) {                                      // 帽子：小丸に返る
      const s = (t - TK) / (1 - TK);
      v = lerp(v, 0.42, s);
    }
    return v;
  }

  function band(G, t0, t1, vLo, vHi, steps = 140) {
    const p = new Path2D();
    for (let i = 0; i <= steps; i++) {
      const t = t0 + (t1 - t0) * i / steps;
      const q = G.P(t, typeof vHi === 'function' ? vHi(t) : vHi);
      i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1]);
    }
    for (let i = steps; i >= 0; i--) {
      const t = t0 + (t1 - t0) * i / steps;
      const q = G.P(t, typeof vLo === 'function' ? vLo(t) : vLo);
      p.lineTo(q[0], q[1]);
    }
    p.closePath();
    return p;
  }

  function line(G, t0, t1, vf, steps = 120) {
    const p = new Path2D();
    for (let i = 0; i <= steps; i++) {
      const t = t0 + (t1 - t0) * i / steps;
      const q = G.P(t, typeof vf === 'function' ? vf(t) : vf);
      i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1]);
    }
    return p;
  }

  /*
   * 断面の明るさ（研ぎ上がった刀を斜め上から見たときの見え方）
   * v: 0 刃先 → 1 棟。戻り値は 0..1 の明度係数。
   */
  function crossLight(v) {
    if (v < 0.03) return 0.55;                         // 刃先の極細い帯
    if (v < SHINOGI) {
      // 平地：刃側ほど明るく、鎬に向かって緩やかに沈む（肉置き）
      const k = (v - 0.03) / (SHINOGI - 0.03);
      return 0.92 - 0.38 * k + 0.12 * Math.exp(-Math.pow((k - 0.15) / 0.12, 2));
    }
    if (v < SHINOGI + 0.025) return 1.15;              // 鎬筋の照り
    const k = (v - SHINOGI) / (1 - SHINOGI);
    return 0.42 - 0.12 * k + (v > 0.97 ? 0.35 : 0);    // 鎬地は磨き（艶消し寄りで暗い）
  }

  function drawNakago(ctx, G, o) {
    const tn = -0.24;
    const vLo = t => { const s = (t - tn) / -tn; return 0.06 + 0.28 * (1 - s); };
    const vHi = t => { const s = (t - tn) / -tn; return 0.97 - 0.1 * (1 - s); };
    const p = band(G, tn, 0, vLo, vHi, 40);
    const a = G.P(tn, 0.5), b = G.P(0, 0.5);
    const gr = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
    gr.addColorStop(0, '#1c1410');
    gr.addColorStop(0.5, '#2d201a');
    gr.addColorStop(1, '#3b2c22');
    ctx.fillStyle = gr;
    ctx.fill(p);
    ctx.save();
    ctx.clip(p);
    // 鑢目（筋違い）
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 0.8;
    for (let t = tn; t < -0.015; t += 0.006) {
      const q1 = G.P(t, 0.05), q2 = G.P(t + 0.012, 1);
      ctx.beginPath(); ctx.moveTo(q1[0], q1[1]); ctx.lineTo(q2[0], q2[1]); ctx.stroke();
    }
    // 錆の斑
    const r = rng((o.seed || 1) + 77);
    for (let i = 0; i < 40; i++) {
      const t = tn + r() * -tn, v = 0.1 + r() * 0.8;
      const q = G.P(t, v);
      ctx.fillStyle = `rgba(${90 + r() * 40},${50 + r() * 20},${30},${0.15 + r() * 0.2})`;
      ctx.beginPath(); ctx.arc(q[0], q[1], 1 + r() * G.W * 0.06, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // 目釘孔
    const m = G.P(-0.085, 0.58);
    ctx.fillStyle = o.bg || '#0b0806';
    ctx.beginPath(); ctx.arc(m[0], m[1], G.W * 0.075, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke(p);
  }

  function drawHabaki(ctx, G) {
    const p = band(G, 0, HABAKI, -0.1, 1.07, 12);
    const a = G.P(0, 1.07), b = G.P(0, -0.1);
    const gr = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
    gr.addColorStop(0, '#6e4f1c');
    gr.addColorStop(0.18, '#f4dc92');
    gr.addColorStop(0.35, '#b8892f');
    gr.addColorStop(0.62, '#e8c66c');
    gr.addColorStop(0.85, '#8c6420');
    gr.addColorStop(1, '#4f3812');
    ctx.fillStyle = gr;
    ctx.fill(p);
    // 猫掻き風の斜線
    ctx.save(); ctx.clip(p);
    ctx.strokeStyle = 'rgba(80,50,10,0.35)'; ctx.lineWidth = 0.7;
    for (let t = 0; t < HABAKI; t += 0.004) {
      const q1 = G.P(t, -0.1), q2 = G.P(t + 0.01, 1.07);
      ctx.beginPath(); ctx.moveTo(q1[0], q1[1]); ctx.lineTo(q2[0], q2[1]); ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(40,25,5,0.8)'; ctx.lineWidth = 1; ctx.stroke(p);
  }

  /*
   * o = {
   *   x, y, length, width, sori,
   *   hamon: [v...], hamonStrength: 0..1, polish: 0..1, folds: n,
   *   crack: bool, scratches: n, seed,
   *   heat: ℃ (加熱中の発光表示), clay: 0..1 (土置きの量), nakago: bool, habaki: bool
   * }
   */
  function draw(ctx, o) {
    const G = geom(o);
    const p = clamp(o.polish ?? 0.6, 0, 1);
    const r = rng(o.seed || 1);
    const S = o.hamonStrength ?? 1;
    ctx.save();
    if (o.nakago !== false) drawNakago(ctx, G, o);

    const blade = band(G, 0, 1, 0, 1, 220);
    const heated = o.heat != null && o.heat > 480;

    // 背景への映り込み影
    if (!heated && o.shadow !== false) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 18; ctx.shadowOffsetY = 8;
      ctx.fillStyle = '#222';
      ctx.fill(blade);
      ctx.restore();
    }

    ctx.save();
    ctx.clip(blade);

    // ---- 地鉄のベース（断面の稜線に沿った帯で塗る）
    const dull = [58, 60, 62], bright = [176, 184, 194], dark = [28, 30, 34];
    const BANDS = 26;
    for (let i = 0; i < BANDS; i++) {
      const v0 = i / BANDS, v1 = (i + 1) / BANDS + 0.002;
      const L = crossLight((v0 + v1) / 2);
      const base = mixRGB(dull, bright, p);
      const c = L >= 1 ? mixRGB(base, [235, 240, 248], (L - 1) * 2 * p) : mixRGB(dark, base, L);
      ctx.fillStyle = rgbStr(c);
      ctx.fill(band(G, 0, 1, v0, v1, 90));
    }

    // ---- 映り込み（長手方向の明暗。研ぎが良いほど鏡面に近い）
    {
      const a = G.P(0, 0.5), b = G.P(1, 0.5);
      const gr = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
      const rr = rng((o.seed || 1) + 5);
      for (let i = 0; i <= 8; i++) {
        const s = i / 8;
        const lv = rr();
        gr.addColorStop(s, lv > 0.5 ? `rgba(255,255,255,${0.10 * p * lv})` : `rgba(0,0,0,${0.22 * p * (1 - lv)})`);
      }
      ctx.fillStyle = gr;
      ctx.fill(blade);
    }

    // ---- 地肌。折り返し回数が多いほど細かく詰む。
    //   柾目：同じ向きに折り返す → 長く真っ直ぐな肌目
    //   板目：縦横交互に折り返す → 木の板のような流れる肌目
    //   杢目：不規則に折り返す → 年輪のような渦を巻く肌目
    {
      const folds = o.folds ?? 12;
      const grain = o.grain || 'itame';
      const n = 30 + folds * 9;
      const fine = clamp(folds / 15, 0.2, 1);
      ctx.lineWidth = 0.55;
      const stroke = light => { ctx.strokeStyle = light ? `rgba(230,236,245,${0.05 + 0.09 * p})` : `rgba(5,8,14,${0.10 + 0.12 * p})`; };
      for (let k = 0; k < n; k++) {
        const v0 = 0.08 + r() * 0.9;
        const light = r() > 0.5;
        stroke(light);
        if (grain === 'masame') {
          const t0 = r() * 0.9, len = 0.15 + r() * 0.5 * (1.2 - fine);
          const amp = 0.002 + r() * 0.004;
          ctx.stroke(line(G, t0, Math.min(1, t0 + len), t => v0 + amp * Math.sin(t * 12 + k), 40));
        } else if (grain === 'mokume' && r() < 0.45) {
          const t0 = r() * 0.92, rad = (0.008 + r() * 0.02) * (1.3 - fine * 0.5);
          const c = G.P(t0, v0);
          const wr = G.w(t0);
          for (let ring = 1; ring <= 3; ring++) {
            ctx.beginPath();
            ctx.ellipse(c[0], c[1], rad * ring * G.L * 0.5, rad * ring * wr * 0.9, 0, 0, TAU);
            ctx.stroke();
          }
        } else {
          const t0 = r() * 0.95, len = 0.04 + r() * 0.22 * (1.2 - fine);
          const amp = (0.004 + r() * 0.016) * (1.4 - fine);
          const fq = 30 + r() * 80, ph = r() * TAU;
          ctx.stroke(line(G, t0, Math.min(1, t0 + len), t => v0 + amp * Math.sin(t * fq + ph), 30));
        }
      }
    }

    // ---- 映り（地に立つ淡い霞）
    if (!heated && S > 0.3 && o.hamon) {
      ctx.save();
      ctx.filter = 'blur(3px)';
      ctx.fillStyle = `rgba(200,210,225,${0.06 * p * S})`;
      ctx.fill(band(G, 0.05, TK, t => hAt(o.hamon, t) + 0.12, t => hAt(o.hamon, t) + 0.22, 60));
      ctx.restore();
    }

    // ---- 刃文（匂口・沸・足）
    if (o.hamon && S > 0) {
      const h = o.hamon;
      const hp = band(G, 0, 1, -0.02, t => hAt(h, t), 220);
      // 刃（焼き入れで白く冴える部分）
      ctx.save();
      ctx.fillStyle = `rgba(214,220,228,${(0.35 + 0.5 * p) * S})`;
      ctx.fill(hp);
      ctx.restore();
      // 匂口：境界のぼかし
      ctx.save();
      ctx.filter = `blur(${1.2 + 1.8 * p}px)`;
      ctx.strokeStyle = `rgba(250,252,255,${(0.35 + 0.55 * p) * S})`;
      ctx.lineWidth = Math.max(2, G.W * 0.05);
      ctx.stroke(line(G, HABAKI, 1, t => hAt(h, t), 220));
      ctx.restore();
      // 刃中の働き（淡い濃淡）
      ctx.save();
      ctx.filter = 'blur(2px)';
      for (let i = 0; i < 18; i++) {
        const t = r() * TK, v = r() * hAt(h, t) * 0.8;
        const q = G.P(t, v);
        ctx.fillStyle = `rgba(160,170,185,${0.12 * p})`;
        ctx.beginPath(); ctx.ellipse(q[0], q[1], G.W * (0.2 + r() * 0.4), G.W * 0.05, 0, 0, TAU); ctx.fill();
      }
      ctx.restore();
      // 足：刃先へ向かって入る細い働き
      ctx.lineWidth = 0.8;
      for (let t = 0.06; t < TK - 0.01; t += 0.012 + r() * 0.02) {
        const hv = hAt(h, t);
        const len = 0.05 + r() * 0.08;
        ctx.strokeStyle = `rgba(245,248,255,${(0.10 + 0.22 * p) * S})`;
        ctx.stroke(line(G, t, t + 0.003, tt => lerp(hv, hv - len, (tt - t) / 0.003), 4));
      }
      // 沸：境界に散る微細な輝点
      const nNie = Math.round(500 * S * (0.3 + p));
      for (let i = 0; i < nNie; i++) {
        const t = HABAKI + r() * (1 - HABAKI);
        const hv = hAt(h, t);
        const v = hv + (r() - 0.65) * 0.07;
        const q = G.P(t, v);
        const a = r() * (0.25 + 0.6 * p) * S;
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.fillRect(q[0], q[1], r() < 0.15 ? 1.4 : 0.8, r() < 0.15 ? 1.4 : 0.8);
      }
    }

    // ---- 研ぎ傷
    if (o.scratches) {
      const rs = rng((o.seed || 1) + 999);
      ctx.lineWidth = 0.6;
      for (let i = 0; i < o.scratches * 6; i++) {
        const t = rs() * 0.95, v = rs();
        const q = G.P(t, v);
        const ang = rs() * 0.5 - 0.25, len = 6 + rs() * 26;
        ctx.strokeStyle = rs() > 0.5 ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(q[0] + Math.cos(ang) * len, q[1] + Math.sin(ang) * len); ctx.stroke();
      }
    }

    // ---- 加熱中の発光
    if (o.heat != null) {
      const T = o.heat;
      const c = heatRGB(T), gl = heatGlow(T);
      // 鋼の地色を発光色で置き換えていく（刃先側ほど薄いので熱く見える）
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = rgbStr(mixRGB([46, 42, 40], c, clamp(gl * 1.8, 0, 1)), o.heat > 300 ? 0.97 : 0);
      ctx.fill(blade);
      const a = G.P(0.5, 0), b = G.P(0.5, 1);
      const gr = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
      gr.addColorStop(0, rgbStr(heatRGB(T + 70), 0.55 * gl));
      gr.addColorStop(0.6, rgbStr(c, 0));
      gr.addColorStop(1, rgbStr(heatRGB(T - 80), 0.4 * gl));
      ctx.fillStyle = gr;
      ctx.fill(blade);
      // 酸化皮膜（黒い鱗状のスケール）
      const rs = rng((o.seed || 1) + 31);
      for (let i = 0; i < 70; i++) {
        const t = rs(), v = rs();
        const q = G.P(t, v);
        ctx.fillStyle = `rgba(20,10,6,${0.12 + 0.25 * (1 - gl)})`;
        ctx.beginPath(); ctx.ellipse(q[0], q[1], 2 + rs() * 7, 1 + rs() * 2.5, rs(), 0, TAU); ctx.fill();
      }
    }

    // ---- 焼刃土
    if (o.clay) {
      const h = o.hamon;
      const cl = o.clay;
      const heatC = o.heat != null ? heatRGB(o.heat - 220) : null;
      const thick = band(G, HABAKI, 1, t => hAt(h, t) + 0.025, 1.02, 160);
      const thin = band(G, HABAKI, 1, -0.02, t => hAt(h, t) + 0.025, 160);
      ctx.fillStyle = heatC ? rgbStr(mixRGB([70, 58, 50], heatC, 0.35), 0.92 * cl) : `rgba(98,88,78,${0.95 * cl})`;
      ctx.fill(thick);
      ctx.fillStyle = heatC ? rgbStr(heatC, 0.18 * cl) : `rgba(130,120,108,${0.42 * cl})`;
      ctx.fill(thin);
      // 土のざらつき
      const rs = rng((o.seed || 1) + 13);
      for (let i = 0; i < 260 * cl; i++) {
        const t = HABAKI + rs() * (1 - HABAKI), v = hAt(h, t) + 0.03 + rs() * (1 - hAt(h, t));
        const q = G.P(t, v);
        ctx.fillStyle = rs() > 0.5 ? `rgba(140,128,112,${0.5 * cl})` : `rgba(45,38,32,${0.5 * cl})`;
        ctx.fillRect(q[0], q[1], 1.5, 1.5);
      }
      // 足（土の細い筋）
      ctx.strokeStyle = `rgba(98,88,78,${0.9 * cl})`;
      ctx.lineWidth = 1.2;
      for (let t = 0.07; t < TK; t += 0.035) {
        const hv = hAt(h, t);
        ctx.stroke(line(G, t, t + 0.002, tt => lerp(hv + 0.02, Math.max(0.05, hv - 0.08), (tt - t) / 0.002), 3));
      }
    }

    // ---- 焼割れ
    if (o.crack) {
      const rs = rng((o.seed || 1) + 4242);
      const t0 = 0.45 + rs() * 0.2;
      const pts = [];
      let v = 0, t = t0;
      while (v < 0.5) { pts.push(G.P(t, v)); v += 0.06 + rs() * 0.06; t += (rs() - 0.5) * 0.006; }
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 0.6;
      ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q[0] + 1, q[1] + 1) : ctx.moveTo(q[0] + 1, q[1] + 1)); ctx.stroke();
    }
    ctx.restore(); // clip

    // ---- 線（鎬筋・横手・小鎬・輪郭）
    if (!(o.heat != null && o.heat > 700)) {
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = `rgba(255,255,255,${0.12 + 0.4 * p})`;
      ctx.stroke(line(G, HABAKI, TK, SHINOGI, 80));
      ctx.stroke(line(G, TK, 1, SHINOGI, 20));
      const y1 = G.P(TK, 0), y2 = G.P(TK, SHINOGI);
      ctx.beginPath(); ctx.moveTo(y1[0], y1[1]); ctx.lineTo(y2[0], y2[1]);
      ctx.strokeStyle = `rgba(255,255,255,${0.1 + 0.35 * p})`;
      ctx.stroke();
    }
    ctx.strokeStyle = heated ? rgbStr(heatRGB(o.heat - 150), 0.7) : 'rgba(0,0,0,0.75)';
    ctx.lineWidth = 1;
    ctx.stroke(blade);
    // 刃先の細いハイライト
    if (!heated) {
      ctx.strokeStyle = `rgba(255,255,255,${0.15 + 0.35 * p})`;
      ctx.lineWidth = 0.7;
      ctx.stroke(line(G, HABAKI, 0.995, 0.004, 200));
    }

    // ---- 発光のにじみ（加算合成のブルーム）
    if (heated) {
      const gl = heatGlow(o.heat);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.filter = `blur(${8 + gl * 18}px)`;
      ctx.fillStyle = rgbStr(heatRGB(o.heat), 0.12 + gl * 0.3);
      ctx.fill(blade);
      ctx.restore();
    }

    if (o.habaki !== false) drawHabaki(ctx, G);
    ctx.restore();
    return G;
  }

  /*
   * 赤熱した鋼の塊（玉鋼の積み・延べ棒）。上面形状 topFn(x) を与えて描く。
   * 中心ほど熱く、角・表面ほど早く冷えて暗く見える。酸化スケールも乗せる。
   */
  function drawHotBar(ctx, x, y, w, h, T, opt = {}) {
    const seed = opt.seed || 3;
    const r = rng(seed);
    const topFn = opt.topFn || (() => 0);
    const path = new Path2D();
    const steps = 40;
    path.moveTo(x, y + h);
    for (let i = 0; i <= steps; i++) {
      const xx = x + w * i / steps;
      path.lineTo(xx, y + topFn(i / steps));
    }
    path.lineTo(x + w, y + h);
    path.closePath();
    const c = heatRGB(T), gl = heatGlow(T);

    // 外側のにじみ（周囲を照らす光）
    if (gl > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const cx = x + w / 2, cy = y + h / 2;
      const rad = Math.max(w, h) * (0.8 + gl * 0.9);
      const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      gr.addColorStop(0, rgbStr(c, 0.38 * gl));
      gr.addColorStop(0.4, rgbStr(c, 0.12 * gl));
      gr.addColorStop(1, rgbStr(c, 0));
      ctx.fillStyle = gr;
      ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
      ctx.restore();
    }

    ctx.save();
    ctx.fillStyle = rgbStr(c);
    ctx.fill(path); // 下地
    ctx.clip(path);
    // 本体：中心が最も熱い
    const core = heatRGB(T + 50), rim = heatRGB(T - 280);
    const gy = ctx.createLinearGradient(0, y, 0, y + h);
    gy.addColorStop(0, rgbStr(heatRGB(T - 40)));
    gy.addColorStop(0.35, rgbStr(core));
    gy.addColorStop(0.75, rgbStr(heatRGB(T - 60)));
    gy.addColorStop(1, rgbStr(rim));
    ctx.fillStyle = gy;
    ctx.fillRect(x - 2, y - 40, w + 4, h + 80);
    // 両端（木口）は冷えやすい
    const gx = ctx.createLinearGradient(x, 0, x + w, 0);
    gx.addColorStop(0, rgbStr(heatRGB(T - 260), 0.75));
    gx.addColorStop(0.12, rgbStr(c, 0));
    gx.addColorStop(0.88, rgbStr(c, 0));
    gx.addColorStop(1, rgbStr(heatRGB(T - 260), 0.75));
    ctx.fillStyle = gx;
    ctx.fillRect(x - 2, y - 40, w + 4, h + 80);
    // 揺らめく明暗（表面温度ムラ）
    const tm = opt.time || 0;
    for (let i = 0; i < 14; i++) {
      const px = x + r() * w, py = y + r() * h;
      const fl = 0.5 + 0.5 * Math.sin(tm * (2 + r() * 3) + r() * 10);
      const rad = 6 + r() * w * 0.12;
      const gr = ctx.createRadialGradient(px, py, 0, px, py, rad);
      gr.addColorStop(0, rgbStr(heatRGB(T + 90), 0.35 * fl * gl));
      gr.addColorStop(1, rgbStr(c, 0));
      ctx.fillStyle = gr;
      ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    }
    // 酸化スケール：温度が下がると黒く浮き、高温では溶けて見えにくい
    const scaleA = clamp(1.0 - gl * 1.15, 0.05, 0.75);
    const nScale = opt.scale ?? 60;
    ctx.save();
    for (let i = 0; i < nScale * 0.25; i++) {          // 大きく薄い斑
      const px = x + r() * w, py = y + r() * h;
      ctx.fillStyle = `rgba(30,12,6,${scaleA * 0.35 * r()})`;
      ctx.beginPath();
      ctx.ellipse(px, py, 4 + r() * 14, 2 + r() * 5, r() * 0.4 - 0.2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.save();
    for (let i = 0; i < nScale * 2; i++) {             // 細かな鱗片
      const px = x + r() * w, py = y + r() * h;
      const s = 0.5 + r() * 1.8;
      ctx.fillStyle = r() < 0.8 ? `rgba(25,10,5,${scaleA * (0.25 + r() * 0.5)})` : rgbStr(heatRGB(T + 80), 0.5 * gl);
      ctx.fillRect(px, py, s * (1 + r()), s);
    }
    ctx.restore();
    // 層（折り返しの痕）
    if (opt.layers) {
      ctx.strokeStyle = `rgba(0,0,0,${0.12 + 0.2 * (1 - gl)})`;
      ctx.lineWidth = 0.7;
      const n = Math.min(opt.layers, 12);
      for (let i = 1; i <= n; i++) {
        const yy = y + h * i / (n + 1) + Math.sin(i * 7.1) * 1.5;
        ctx.beginPath();
        ctx.moveTo(x, yy);
        for (let k = 1; k <= 10; k++) ctx.lineTo(x + w * k / 10, yy + Math.sin(k * 1.7 + i) * 1.2);
        ctx.stroke();
      }
    }
    // 上面の照り返し
    const hi = ctx.createLinearGradient(0, y, 0, y + h * 0.3);
    hi.addColorStop(0, `rgba(255,255,240,${0.12 + 0.25 * gl})`);
    hi.addColorStop(1, 'rgba(255,255,240,0)');
    ctx.fillStyle = hi;
    ctx.fillRect(x - 2, y - 40, w + 4, h * 0.3 + 40);
    ctx.restore();

    ctx.strokeStyle = rgbStr(heatRGB(T - 300), 0.9);
    ctx.lineWidth = 1;
    ctx.stroke(path);
    return path;
  }

  /* 火床の炭火 */
  function drawCoals(ctx, x, y, w, h, intensity, time, seed = 9) {
    const r = rng(seed);
    // 炉の奥の照り
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const T = 900 + intensity * 450;
    const c = heatRGB(T);
    const gr = ctx.createRadialGradient(x + w / 2, y + h * 0.4, 5, x + w / 2, y + h * 0.4, w * 0.8);
    gr.addColorStop(0, rgbStr(c, 0.45 + 0.25 * intensity));
    gr.addColorStop(0.5, rgbStr(heatRGB(T - 300), 0.18));
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(x + w / 2 - w * 0.8, y + h * 0.4 - w * 0.8, w * 1.6, w * 1.6);
    ctx.restore();
    // 炭
    for (let i = 0; i < 70; i++) {
      const px = x + r() * w, py = y + r() * h * 0.9 + h * 0.1;
      const rw = 6 + r() * 12, rh = 4 + r() * 7;
      const fl = 0.55 + 0.45 * Math.sin(time * (3 + r() * 5) + r() * 20);
      const ct = 650 + (intensity * 520 + 120) * fl * (0.6 + r() * 0.4) - (py - y) / h * 120;
      ctx.fillStyle = r() < 0.25 ? '#141010' : rgbStr(heatRGB(ct));
      ctx.beginPath();
      ctx.moveTo(px - rw / 2, py);
      ctx.lineTo(px - rw * 0.2, py - rh / 2);
      ctx.lineTo(px + rw / 2, py - rh * 0.3);
      ctx.lineTo(px + rw * 0.3, py + rh / 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,10,8,0.7)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    // 炎
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) {
      const fx = x + w * (0.1 + 0.8 * r());
      const fh = h * (0.6 + intensity * 1.6) * (0.5 + 0.5 * Math.sin(time * (6 + r() * 6) + i));
      const fg = ctx.createLinearGradient(fx, y + h * 0.2, fx, y - fh);
      fg.addColorStop(0, rgbStr(heatRGB(1100 + intensity * 200), 0.28));
      fg.addColorStop(1, 'rgba(255,80,10,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(fx - 12, y + h * 0.2);
      ctx.quadraticCurveTo(fx + Math.sin(time * 4 + i) * 10, y - fh * 0.5, fx + Math.sin(time * 7 + i) * 6, y - fh);
      ctx.quadraticCurveTo(fx + 4, y - fh * 0.4, fx + 12, y + h * 0.2);
      ctx.fill();
    }
    ctx.restore();
  }

  return { draw, drawHotBar, drawCoals, geom, hAt, TK, SHINOGI, HABAKI };
})();
