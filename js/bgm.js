'use strict';
/*
 * BGM：Web Audio でリアルタイム生成する和風の音楽（音源ファイル不要）。
 *  音階は都節音階（ミヤコブシ：D・E♭・G・A・B♭）。
 *  尺八風の笛、箏風の撥弦、太鼓、低い持続音（ドローン）を場面ごとに組み合わせる。
 */
const Music = (() => {
  let ac = null, bus = null, wet = null, dry = null;
  let started = false, enabled = true, mood = 'calm', timer = null, hidden = false;
  let nextKoto = 0, nextFlute = 0, nextDrum = 0, drumStep = 0;
  let drone = null;
  let fluteDeg = 2;
  try { enabled = localStorage.getItem('kaji.bgm') !== 'off'; } catch (e) { /* 既定は入 */ }

  const ROOT = 146.83;                 // D3
  const SCALE = [0, 1, 5, 7, 8];       // 都節音階
  const freq = (d, oct = 1) => {
    const n = SCALE.length, o = Math.floor(d / n), s = SCALE[((d % n) + n) % n];
    return ROOT * Math.pow(2, oct + o + s / 12);
  };

  /* 場面ごとの編成。値は [最短, 最長] の間隔（秒） */
  const MOODS = {
    calm:   { koto: [2.4, 5], flute: [6, 11], drum: null,    drone: 0.55, vol: 0.34 },
    forge:  { koto: null,     flute: [10, 18], drum: 'forge', drone: 0.9,  vol: 0.24, fluteOct: 0 },
    zen:    { koto: [3.5, 7], flute: [9, 15], drum: null,    drone: 0.35, vol: 0.28 },
    tense:  { koto: null,     flute: null,    drum: 'heart', drone: 1,    vol: 0.3 },
    finale: { koto: [1.2, 2.6], flute: [4, 7], drum: 'soft', drone: 0.55, vol: 0.36 },
    groove: { koto: null,     flute: [12, 20], drum: null,    drone: 0.8,  vol: 0.3, fluteOct: 0 }
  };

  function makeReverb() {
    const len = Math.floor(ac.sampleRate * 3.4);
    const buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
    }
    const conv = ac.createConvolver();
    conv.buffer = buf;
    return conv;
  }

  function setup() {
    ac = Sound.ctx;
    if (!ac) return false;
    bus = ac.createGain();
    bus.gain.value = 0;
    bus.connect(Sound.out);
    const rev = makeReverb();
    wet = ac.createGain(); wet.gain.value = 0.55;
    dry = ac.createGain(); dry.gain.value = 0.7;
    rev.connect(wet); wet.connect(bus);
    dry.connect(bus);
    bus.rev = rev;
    // ドローン：低い D と A を柔らかく鳴らし続ける
    const g = ac.createGain(); g.gain.value = 0;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 340; lp.Q.value = 0.6;
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.06;
    const lfoG = ac.createGain(); lfoG.gain.value = 120;
    lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();
    [[ROOT / 2, 'triangle', 0.5], [ROOT / 2 * 1.5, 'sine', 0.3], [ROOT / 2 * 1.003, 'sawtooth', 0.08]].forEach(([f, type, a]) => {
      const o = ac.createOscillator(); o.type = type; o.frequency.value = f;
      const og = ac.createGain(); og.gain.value = a;
      o.connect(og); og.connect(lp); o.start();
    });
    lp.connect(g); g.connect(dry); g.connect(rev);
    drone = g;
    return true;
  }

  const out = node => { node.connect(dry); node.connect(bus.rev); };

  /* 箏：撥いた瞬間に明るく、すぐに丸く減衰する */
  function koto(f, t, vel = 1) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22 * vel, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.06 * vel, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(f * 9, t);
    lp.frequency.exponentialRampToValueAtTime(f * 2, t + 0.6);
    [[1, 'triangle', 1], [2, 'sine', 0.45], [3, 'sine', 0.2], [4.02, 'sine', 0.08]].forEach(([m, type, a]) => {
      const o = ac.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f * m, t);
      if (Math.random() < 0.18 && m === 1) o.frequency.setTargetAtTime(f * m * Math.pow(2, 1 / 12), t + 0.25, 0.08); // 押し手
      const og = ac.createGain(); og.gain.value = a;
      o.connect(og); og.connect(lp);
      o.start(t); o.stop(t + 2.8);
    });
    // 爪の当たる音
    const n = ac.createBufferSource(); n.buffer = noiseBuf();
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 6; bp.Q.value = 2;
    const ng = ac.createGain();
    ng.gain.setValueAtTime(0.06 * vel, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    n.connect(bp); bp.connect(ng); ng.connect(lp);
    n.start(t); n.stop(t + 0.05);
    lp.connect(g); out(g);
  }

  /* 尺八：息の音、ゆっくりした立ち上がり、メリ（下から当てる）と後半の揺り */
  function flute(f, t, dur, vel = 1) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11 * vel, t + 0.25);
    g.gain.setValueAtTime(0.11 * vel, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const o = ac.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f * Math.pow(2, -0.7 / 12), t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.35);
    const vib = ac.createOscillator(); vib.frequency.value = 5.2;
    const vg = ac.createGain();
    vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.012, t + dur * 0.8);
    vib.connect(vg); vg.connect(o.frequency);
    const o2 = ac.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2;
    const o2g = ac.createGain(); o2g.gain.value = 0.12;
    vg.connect(o2.frequency);
    o.connect(g); o2.connect(o2g); o2g.connect(g);
    // 息
    const n = ac.createBufferSource(); n.buffer = noiseBuf(); n.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 3;
    const ng = ac.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.09 * vel, t + 0.08);
    ng.gain.exponentialRampToValueAtTime(0.02 * vel, t + 0.5);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(bp); bp.connect(ng); ng.connect(g);
    [o, o2, vib].forEach(x => { x.start(t); x.stop(t + dur + 0.1); });
    n.start(t, Math.random()); n.stop(t + dur + 0.1);
    out(g);
  }

  /* 太鼓 */
  function taiko(t, vel = 1, pitch = 1) {
    const o = ac.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(95 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(48 * pitch, t + 0.35);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * vel, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.connect(g); o.start(t); o.stop(t + 1.2);
    const n = ac.createBufferSource(); n.buffer = noiseBuf();
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const ng = ac.createGain();
    ng.gain.setValueAtTime(0.25 * vel, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    n.connect(lp); lp.connect(ng); ng.connect(g);
    n.start(t); n.stop(t + 0.15);
    g.connect(dry); g.connect(bus.rev);
  }

  /* 太鼓の縁（カッ） */
  function kaRim(t) {
    const n = ac.createBufferSource(); n.buffer = noiseBuf();
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 3;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    n.connect(bp); bp.connect(g); g.connect(dry);
    n.start(t); n.stop(t + 0.08);
  }

  let nb = null;
  function noiseBuf() {
    if (nb) return nb;
    nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return nb;
  }

  const between = r => r[0] + Math.random() * (r[1] - r[0]);

  function schedule() {
    if (!ac || !enabled || hidden) return;
    const M = MOODS[mood];
    const now = ac.currentTime, ahead = now + 0.6;
    // 箏：短い分散和音・フレーズ
    if (M.koto) {
      while (nextKoto < ahead) {
        const start = Math.max(nextKoto, now + 0.05);
        const n = 2 + Math.floor(Math.random() * 4);
        let d = Math.floor(Math.random() * 6) + 2;
        const dir = Math.random() < 0.5 ? 1 : -1;
        const gap = 0.16 + Math.random() * 0.2;
        for (let i = 0; i < n; i++) {
          koto(freq(d, 1), start + i * gap, i === 0 ? 1 : 0.7);
          d += dir * (Math.random() < 0.7 ? 1 : 2);
        }
        if (Math.random() < 0.35) koto(freq(0, 0), start, 0.6);    // 低い D を添える
        nextKoto = start + n * gap + between(M.koto);
      }
    }
    // 尺八：長い音を2〜4つ、間をあけて
    if (M.flute) {
      while (nextFlute < ahead) {
        let t = Math.max(nextFlute, now + 0.1);
        const n = 2 + Math.floor(Math.random() * 3);
        const oct = M.fluteOct ?? 1;
        for (let i = 0; i < n; i++) {
          fluteDeg = clamp(fluteDeg + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)], 0, 7);
          if (i === n - 1 && Math.random() < 0.5) fluteDeg = Math.random() < 0.5 ? 0 : 3;   // D か A で終わる
          const dur = 1.3 + Math.random() * 2;
          flute(freq(fluteDeg, oct), t, dur, oct === 0 ? 0.8 : 1);
          t += dur + 0.05;
        }
        nextFlute = t + between(M.flute);
      }
    }
    // 太鼓
    if (M.drum) {
      while (nextDrum < ahead) {
        const t = Math.max(nextDrum, now + 0.05);
        if (M.drum === 'forge') {           // ドン……ドン・ドン（2小節周期）
          const pat = [[0, 1], [1.2, 0.55], [1.6, 0.35], [2.4, 0.9], [3.6, 0.5]];
          pat.forEach(([o, v]) => { if (Math.random() < 0.92) taiko(t + o, v * 0.8); });
          nextDrum = t + 4.8;
        } else if (M.drum === 'heart') {    // 心音
          taiko(t, 0.45, 0.8); taiko(t + 0.3, 0.3, 0.8);
          nextDrum = t + 1.5;
        } else {
          taiko(t, 0.55);
          nextDrum = t + 4.8 + Math.random() * 2;
        }
        drumStep++;
      }
    }
  }

  function applyMood(fade = 1.5) {
    if (!ac || !bus) return;
    const M = MOODS[mood];
    const on = enabled && !hidden;
    bus.gain.setTargetAtTime(on ? M.vol : 0, ac.currentTime, fade / 3);
    drone.gain.setTargetAtTime(on ? M.drone * 0.12 : 0, ac.currentTime, fade / 2);
  }

  document.addEventListener('visibilitychange', () => { hidden = document.hidden; applyMood(0.3); });

  return {
    start() {
      if (started) return;
      Sound.init();
      if (!Sound.ctx || !setup()) return;
      started = true;
      const now = ac.currentTime;
      nextKoto = now + 0.5; nextFlute = now + 2.5; nextDrum = now + 0.8;
      applyMood(2.5);
      timer = setInterval(schedule, 120);
      schedule();
    },
    setMood(m) {
      if (!MOODS[m] || m === mood) return;
      mood = m;
      if (!ac) return;
      const now = ac.currentTime;
      // 新しい場面の音をすぐ始める
      nextKoto = Math.min(nextKoto, now + 1.2);
      nextFlute = Math.min(nextFlute, now + 3);
      nextDrum = Math.min(nextDrum, now + 0.8);
      applyMood();
    },
    /* 作刀中の曲調に切り替える（太鼓はゲーム側が drumAt で拍に合わせて鳴らす） */
    groove() {
      if (!started) this.start();
      this.setMood('groove');
    },
    /* オーディオ時刻 t に太鼓を一打。pos：小節内の拍（0〜3） */
    drumAt(t, pos) {
      if (!ac || !bus || !enabled || hidden) return;
      if (pos === 0) taiko(t, 0.75);
      else if (pos === 2) taiko(t, 0.35, 1.1);
      else kaRim(t);
    },
    grooveOff() { /* 曲調は呼び出し側で切り替える */ },
    get enabled() { return enabled; },
    toggle() {
      enabled = !enabled;
      try { localStorage.setItem('kaji.bgm', enabled ? 'on' : 'off'); } catch (e) { /* 無視 */ }
      if (enabled && !started) this.start();
      if (ac) {
        const now = ac.currentTime;
        nextKoto = now + 0.5; nextFlute = now + 2; nextDrum = now + 0.5;
      }
      applyMood(0.6);
      return enabled;
    }
  };
})();
