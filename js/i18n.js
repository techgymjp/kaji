'use strict';
/*
 * 多言語対応（日本語 / English）。
 *  L('日本語', 'English') で現在の言語の文字列を返す。
 *  言語は ?lang=en / ?lang=ja、保存済みの設定、ブラウザの言語の順に決める。
 */
const LANG = (() => {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'ja' || q === 'en') { localStorage.setItem('kaji.lang', q); return q; }
    const saved = localStorage.getItem('kaji.lang');
    if (saved === 'ja' || saved === 'en') return saved;
  } catch (e) { /* 保存できない環境 */ }
  return /^ja/i.test(navigator.language || 'ja') ? 'ja' : 'en';
})();
const EN = LANG === 'en';
const L = (ja, en) => (EN ? en : ja);

function setLang(lang) {
  try { localStorage.setItem('kaji.lang', lang); } catch (e) { /* 無視 */ }
  const u = new URL(location.href);
  u.searchParams.delete('lang');
  location.href = u.toString();
}

document.documentElement.lang = LANG;
if (EN) document.title = 'Katana Swordsmith: Rhythm Game';

/* 保存データ中の日本語の名称を表示言語に変換する */
const TERM_EN = {
  '直刃': 'Suguha (straight)', '湾れ': 'Notare (undulating)', '互の目': 'Gunome (wave)', '丁子': 'Chōji (clove)',
  '皆焼風': 'Hitatsura style', '自作': 'your own',
  '板目肌': 'Itame grain', '柾目肌': 'Masame grain', '杢目肌': 'Mokume grain',
  '甲伏せ': 'Kobuse', '本三枚': 'Honsanmai', '丸鍛え': 'Maru-gitae',
  '最上大業物': 'Saijō Ō-Wazamono', '大業物': 'Ō-Wazamono', '良業物': 'Yoki-Wazamono',
  '業物': 'Wazamono', '数打物': 'Kazuuchi-mono', '鈍刀': 'Namakura',
  '無名': 'Nameless',
  '月影': 'Tsukikage', '村雨': 'Murasame', '朧月': 'Oborozuki', '白露': 'Shiratsuyu', '霞': 'Kasumi', '春雷': 'Shunrai',
  '時雨': 'Shigure', '夕凪': 'Yūnagi', '東雲': 'Shinonome', '青嵐': 'Seiran', '初霜': 'Hatsushimo', '緋桜': 'Hizakura'
};
const term = s => (EN && s ? (TERM_EN[s] || s) : s);
