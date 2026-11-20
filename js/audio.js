'use strict';
/* Web Audio で効果音を合成（音声ファイル不要） */
const Sound = (() => {
  let ac = null, master = null, noiseBuf = null;
  let enabled = true;
  let grindSrc = null, grindGain = null, fireSrc = null, fireGain = null;

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = enabled ? 0.7 : 0;
    master.connect(ac.destination);
    const len = ac.sampleRate * 2;
    noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  function noise(dur, type, freq, q, gain, attack = 0.002, at = 0) {
    if (!ac) return;
    const t = ac.currentTime + at;
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const gn = ac.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(gain, t + attack);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(gn); gn.connect(master);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  function tone(freq, dur, gain, type = 'sine', at = 0) {
    if (!ac) return;
    const t = ac.currentTime + at;
    const o = ac.createOscillator();
    o.type = type; o.frequency.value = freq;
    const gn = ac.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(gain, t + 0.003);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn); gn.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function loopNoise(type, freq, q) {
    const src = ac.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const gn = ac.createGain(); gn.gain.value = 0;
    src.connect(f); f.connect(gn); gn.connect(master);
    src.start();
    return [src, gn, f];
  }

  return {
    init,
    get ctx() { return ac; },
    get out() { return master; },
    get enabled() { return enabled; },
    toggle() {
      enabled = !enabled;
      if (master) master.gain.value = enabled ? 0.7 : 0;
      return enabled;
    },
    /* 鎚音。power 0..1、cold=true で冷えた鉄の甲高い音 */
    clang(power = 1, cold = false) {
      if (!ac) return;
      const base = cold ? 1.25 : 1;
      [1180, 2290, 3420, 4710, 6020].forEach((f, i) => {
        tone(f * base * rand(0.98, 1.02), (cold ? 0.9 : 0.45) / (1 + i * 0.4), 0.16 * power / (1 + i * 0.6));
      });
      noise(0.08, 'bandpass', 2600, 0.9, 0.5 * power);
      tone(110, 0.18, 0.35 * power, 'triangle');
    },
    /* 師匠の小槌を、オーディオ時刻 when に正確に鳴らす */
    tickAt(when, vel = 1) {
      if (!ac) return;
      const at = Math.max(0, when - ac.currentTime);
      tone(2650, 0.09, 0.12 * vel, 'sine', at); tone(1720, 0.12, 0.07 * vel, 'sine', at);
      noise(0.03, 'highpass', 3500, 0.7, 0.12 * vel, 0.002, at);
    },
    /* 聞こえている音の時刻（出力遅延を差し引いたオーディオ時刻） */
    now() { return ac ? ac.currentTime - (ac.outputLatency || 0) : performance.now() / 1000; },
    /* 師匠の小槌：軽く澄んだ「コン」 */
    tick() { tone(2650, 0.09, 0.12); tone(1720, 0.12, 0.07); noise(0.03, 'highpass', 3500, 0.7, 0.12); },
    /* 会心の一打：濁りの少ない倍音で長く澄んで響く（鈴や良い鋼の鳴り） */
    clangPerfect() {
      if (!ac) return;
      const f0 = 1760 * rand(0.995, 1.005);
      // 整った倍音を、少しだけずらした2本ずつ重ねてきらめかせる
      [[1, 0.16, 1.3], [2, 0.07, 0.9], [3, 0.035, 0.6], [4.2, 0.018, 0.4]].forEach(([m, g, d]) => {
        tone(f0 * m, d, g, 'sine');
        tone(f0 * m * 1.003, d * 0.9, g * 0.6, 'sine');
      });
      tone(f0 / 2, 0.5, 0.05, 'sine');
      noise(0.03, 'highpass', 5000, 0.7, 0.18);       // 打った瞬間の明るい当たり
      tone(110, 0.16, 0.3, 'triangle');                 // 打った重み
    },
    /* 拍子がずれた一打：響かない鈍い「ゴツッ」 */
    thunk() {
      if (!ac) return;
      const t = ac.currentTime;
      const o = ac.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.09);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.45, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.15);
      noise(0.07, 'lowpass', 520, 0.8, 0.45, 0.002);   // 鈍い当たり
      tone(620, 0.05, 0.05, 'triangle');                 // ごく短い金属感（響かせない）
    },
    thud() { noise(0.15, 'lowpass', 300, 0.7, 0.5); tone(70, 0.2, 0.3, 'sine'); },
    sizzle(dur = 2.6) {
      if (!ac) return;
      noise(dur, 'highpass', 2500, 0.5, 0.45, 0.01);
      noise(dur * 0.7, 'bandpass', 5200, 0.7, 0.25, 0.01, 0.05);
      noise(0.5, 'lowpass', 500, 0.8, 0.5, 0.005);
    },
    whoosh() { noise(0.55, 'lowpass', 520, 0.6, 0.28, 0.12); },
    chisel() { tone(3200 * rand(0.95, 1.05), 0.12, 0.12); noise(0.04, 'highpass', 4000, 0.7, 0.25); },
    crack() { noise(0.25, 'highpass', 1500, 0.4, 0.6); tone(900, 0.3, 0.2, 'sawtooth'); },
    click() { init(); tone(880, 0.05, 0.05, 'triangle'); },
    chime() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.9, 0.12, 'sine', i * 0.11)); },
    gong() { [196, 392, 588].forEach((f, i) => tone(f, 2.5, 0.18 / (i + 1), 'sine')); },
    /* 研ぎの連続音。level 0..1 */
    grind(level, pitch = 1) {
      if (!ac) return;
      if (!grindSrc) { const r = loopNoise('bandpass', 1600, 0.9); grindSrc = r[0]; grindGain = r[1]; grindSrc.f = r[2]; }
      grindGain.gain.setTargetAtTime(level * 0.35, ac.currentTime, 0.04);
      grindSrc.f.frequency.setTargetAtTime(1200 * pitch + level * 900, ac.currentTime, 0.05);
    },
    /* 火床の燃焼音。level 0..1 */
    fire(level) {
      if (!ac) return;
      if (!fireSrc) { const r = loopNoise('lowpass', 380, 0.5); fireSrc = r[0]; fireGain = r[1]; }
      fireGain.gain.setTargetAtTime(level * 0.4, ac.currentTime, 0.12);
    },
    stopLoops() {
      if (!ac) return;
      if (grindGain) grindGain.gain.setTargetAtTime(0, ac.currentTime, 0.05);
      if (fireGain) fireGain.gain.setTargetAtTime(0, ac.currentTime, 0.1);
    }
  };
})();
