# 刀鍛冶 ― 日本刀づくり

日本刀職人（刀匠・研師）の作業工程を再現したブラウザゲームです。
師匠の小槌のリズムを聴いて大鎚で返し、皮鉄の鍛錬から焼入れまで五つの工程をたどって、世界に一振りの日本刀を打ちます。

## 遊び方

操作は**叩くだけ**。師匠（横座）が小槌で1小節ぶんリズムを叩いて見せたら、次の1小節で**同じリズムを大鎚で返す**呼びかけと応答のリズムゲームです（画面のどこをタップしてもよい／PCは Space）。
譜面は表示せず、耳で聴いて返します（画面の縁の色で「聴く／返す」の番だけを示します）。スマホでは叩くたびに振動します（対応端末のみ）。BGM の太鼓・師匠の小槌・判定はすべて同じオーディオクロックで同期しています。進むほどリズムは複雑になります。

| | 区切り | 叩くと起きること |
| --- | --- | --- |
| 一 | 皮鉄の鍛錬 | 鋼が伸びる → 中央に鏨 → 折り返し → 鍛着。これを5回 |
| 二 | 心鉄造り | 柔らかい心鉄を打ち締める |
| 三 | 造り込み | 皮鉄をU字に曲げ、心鉄を包んで鍛着（甲伏せ） |
| 四 | 打ち延ばし | 刀の長さまで延ばし、切先を打ち出す |
| 五 | 焼入れ | 自動。土を置いて赤め、水へ入れて「ジュワッ」 |

最後に「切れ味・強靭さ・美しさ」が鑑定され、刃文は叩きの出来で決まります。号（刀の名）と銘は結果画面で付けられ、SNS でシェアできます。
打った刀はブラウザの「蔵」（localStorage）に保存されます。

## 言語 / Language

日本語と英語に対応しています。画面右上のボタンで切り替えるか、URL に `?lang=en` / `?lang=ja` を付けて開きます。
English is supported: use the language button at the top right, or open the page with `?lang=en`.

## 技術

- HTML / CSS / JavaScript（ビルド不要・外部ライブラリなし）
- 刀身・赤熱した鋼・火床はすべて Canvas 2D で描画
  - 鋼の発光色は黒体放射の色温度に基づく（暗赤 → 桜色 → 月の出の色 → 橙 → 沸き）
  - 刀身は断面の稜（鎬）ごとの明暗、板目肌、刃文の匂口・沸・足、映りを重ねて表現
- 効果音と BGM は Web Audio API でリアルタイム合成（BGM は都節音階による尺八風・箏風・太鼓の生成音楽で、工程ごとに曲調が変化）

## 公開（GitHub Pages）

リポジトリの Settings → Pages で、Source を「Deploy from a branch」、Branch を `main` / `/(root)` に設定してください。

## ローカルで遊ぶ

`index.html` をブラウザで開くか、簡易サーバーを起動します。

```bash
python3 -m http.server 8000
```

## Android アプリ

[Capacitor](https://capacitorjs.com/) でゲームのファイルをアプリに同梱しています（オフラインで遊べます）。パッケージ名は `jp.techgym.kaji`。

- 動作確認用 APK（デバッグ署名・テスト広告）：リリース画面 https://github.com/techgymjp/kaji/releases/tag/android-latest
- APK を直接ダウンロード：https://github.com/techgymjp/kaji/releases/latest/download/kaji.apk

![リリース画面の QR コード](docs/apk-qr.png)

- ビルドは GitHub Actions（`.github/workflows/android.yml`）。`main` へ push するたびに APK を作り、Release `android-latest` の APK を差し替える
- GitHub Secrets（`ANDROID_KEYSTORE_BASE64` など 4 つ）があれば、本番広告の署名付き AAB（Google Play 用）も作り、Artifact に上げる
- 手元で作るとき：`npm ci` → `npm run android:sync` → `npm run android:open`（Android Studio）
- 広告（AdMob）：バナーはタイトル・遊び方・一時停止・鑑定画面だけ。全画面広告は「鍛刀を始める」「タイトルへ戻る」「再開」「もう一振り打つ」のたび。リワード広告は焼割れのときの「焼き直し」（1 振り 1 回）
- アプリ用のビルド（`npm run build:app`）では、Web 版だけの部分（行末に `// @web-only` を付けた行）を取り除く

## ライセンス

著作権はテックジム株式会社に帰属します（All rights reserved）。許可なく複製・改変・再配布すること、Web サイトやアプリ（Google Play、App Store など）として公開・販売すること、名前・ロゴ・アイコン・画像を使うことを禁じます。
テックジムの受講生が学習目的で複製・改変することは認めますが、アプリストアでの公開・広告の掲載・販売などの商用利用は禁止し、著作権表示を残してください。詳しくは [LICENSE](LICENSE) をご覧ください。
