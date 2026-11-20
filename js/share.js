'use strict';
/* 鑑定結果のシェア：SNS 用の画像（1200×630）とテキストを作る */
const Share = (() => {
  const gameUrl = () => location.origin + location.pathname;

  function text(rec) {
    return `刀鍛冶で日本刀を一振り打った！\n号「${rec.name}」　${rec.rank}（総合${rec.total}）\n切れ味${rec.sharp}・強靭さ${rec.tough}・美しさ${rec.beauty}\n#刀鍛冶 #日本刀づくり`;
  }

  /* シェア用の画像 */
  function card(rec, swordOpt) {
    const W = 1200, H = 630;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const bg = g.createRadialGradient(W / 2, H * 1.1, 50, W / 2, H * 0.6, W * 0.8);
    bg.addColorStop(0, '#4a200c'); bg.addColorStop(0.5, '#1a0f09'); bg.addColorStop(1, '#0b0806');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(210,174,99,0.5)'; g.lineWidth = 2; g.strokeRect(24, 24, W - 48, H - 48);
    const F = '"Shippori Mincho", "Hiragino Mincho ProN", "Yu Mincho", serif';
    g.textAlign = 'left';
    g.fillStyle = '#d2ae63'; g.font = `600 26px ${F}`;
    g.fillText('刀鍛冶 ― 日本刀づくり', 64, 84);
    g.fillStyle = '#f3ead8'; g.font = `800 64px ${F}`;
    g.fillText(`号「${rec.name}」`, 64, 168);
    g.fillStyle = '#b8a890'; g.font = `400 26px ${F}`;
    g.fillText(`銘　${rec.smith ? rec.smith + '作' : '無銘'}`, 68, 214);
    Sword.draw(g, { ...swordOpt, x: 250, y: 330, length: 860, width: 74, sori: (rec.sori ?? 16) * 860 / 760, bg: '#120c08' });
    // 位の印
    g.save();
    g.translate(1010, 150); g.rotate(-0.07);
    g.strokeStyle = '#d0472f'; g.lineWidth = 5; g.strokeRect(-110, -80, 220, 160);
    g.lineWidth = 2; g.strokeRect(-100, -70, 200, 140);
    g.fillStyle = '#e0563c'; g.textAlign = 'center';
    g.font = `800 ${rec.rank.length > 4 ? 34 : 42}px ${F}`; g.fillText(rec.rank, 0, 2);
    g.font = `400 24px ${F}`; g.fillStyle = '#f3ead8'; g.fillText(`総合 ${rec.total}`, 0, 48);
    g.restore();
    // 能力
    const stats = [['切れ味', rec.sharp], ['強靭さ', rec.tough], ['美しさ', rec.beauty]];
    stats.forEach(([label, v], i) => {
      const x = 64 + i * 370, y = 500;
      g.textAlign = 'left'; g.fillStyle = '#b8a890'; g.font = `400 26px ${F}`;
      g.fillText(label, x, y);
      g.fillStyle = '#f3ead8'; g.font = `800 40px ${F}`; g.textAlign = 'right';
      g.fillText(String(v), x + 320, y + 4);
      g.fillStyle = '#2a2018'; g.fillRect(x, y + 22, 320, 12);
      const gr = g.createLinearGradient(x, 0, x + 320, 0);
      gr.addColorStop(0, '#7a2414'); gr.addColorStop(0.6, '#e0563c'); gr.addColorStop(1, '#f0cf80');
      g.fillStyle = gr; g.fillRect(x, y + 22, 320 * v / 100, 12);
    });
    g.textAlign = 'right'; g.fillStyle = '#8a7c68'; g.font = `400 20px ${F}`;
    g.fillText(gameUrl().replace(/^https?:\/\//, ''), W - 56, H - 48);
    return c;
  }

  const toBlob = c => new Promise(res => c.toBlob(res, 'image/png'));

  function toast(msg) {
    const t = el('div', 'toast', msg);
    document.body.append(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 2200);
  }

  /* 結果画面に置くシェアボタン群 */
  function buttons(rec, swordOpt) {
    const box = el('div', 'share');
    box.append(el('p', 'share-label', 'この一振りを披露する'));
    const row = el('div', 'share-row');
    const msg = text(rec);
    const url = gameUrl();
    let cardCanvas = null;
    const getCard = () => (cardCanvas ||= card(rec, swordOpt));

    if (navigator.share) {
      row.append(btn('シェアする', 'primary share-native', async () => {
        try {
          const blob = await toBlob(getCard());
          const file = new File([blob], 'katana.png', { type: 'image/png' });
          const data = { title: '刀鍛冶 ― 日本刀づくり', text: msg, url };
          if (navigator.canShare && navigator.canShare({ files: [file] })) data.files = [file];
          await navigator.share(data);
        } catch (e) { /* キャンセルは無視 */ }
      }));
    }
    const x = el('a', 'btn share-x', '𝕏 でポスト');
    x.href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(msg) + '&url=' + encodeURIComponent(url);
    x.target = '_blank'; x.rel = 'noopener';
    const line = el('a', 'btn share-line', 'LINEで送る');
    line.href = 'https://social-plugins.line.me/lineit/share?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(msg);
    line.target = '_blank'; line.rel = 'noopener';
    const save = btn('画像を保存', '', async () => {
      const blob = await toBlob(getCard());
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `katana-${rec.name}.png`;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
    const copy = btn('文章をコピー', '', async () => {
      try { await navigator.clipboard.writeText(msg + '\n' + url); toast('コピーしました'); }
      catch (e) { toast('コピーできませんでした'); }
    });
    row.append(x, line, save, copy);
    box.append(row);
    return box;
  }

  return { buttons, card, text };
})();
