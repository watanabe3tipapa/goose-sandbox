# Goose Editor

**思考を、すぐ形にする。リッチテキストと Markdown を往復するローカルファースト・エディタ。**

Goose Editor は、リッチテキストで書きながら Markdown ソースをその場で確認できる、ブラウザだけで動く軽量エディタです。文書は端末内の `localStorage` に自動保存され、PWA としてインストールすればオフラインでも開けます。サーバーもアカウントもビルド工程もありません。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../LICENSE)
[![Version](https://img.shields.io/badge/version-v0.1.0-57e8ff.svg)](https://github.com/watanabe3tipapa/goose-sandbox)
[![PWA](https://img.shields.io/badge/PWA-offline%20ready-57e8ff.svg)](https://watanabe3tipapa.github.io/goose-sandbox/GooseEditor/editor/)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-site-57e8ff.svg)](https://watanabe3tipapa.github.io/goose-sandbox/GooseEditor/)
[![GitHub issues](https://img.shields.io/github/issues/watanabe3tipapa/goose-sandbox.svg)](https://github.com/watanabe3tipapa/goose-sandbox/issues)

---

## 概要

Markdown エディタは「書く」と「ソースを読む」が分かれがちです。Goose Editor はその 2 つを同じ画面に置き、**同じ文書モデル**を共有させます。

- Rich で書けば、Markdown が下の Source Preview に即時反映される
- Source を編集すれば、Rich の描画が即時更新される
- どちらの面で書いても、保存・検索・書き出しの対象は同じ 1 つの文書

エディタの UI は、ダークな Sci-Fi ワークスペース（Orbitron の見出し、シアンのアクセント、左の DOCUMENTS 一覧、下部の Source Preview）で構成しています。

- ランディングページ: [https://watanabe3tipapa.github.io/goose-sandbox/GooseEditor/](https://watanabe3tipapa.github.io/goose-sandbox/GooseEditor/)
- エディタ: [https://watanabe3tipapa.github.io/goose-sandbox/GooseEditor/editor/](https://watanabe3tipapa.github.io/goose-sandbox/GooseEditor/editor/)

## 機能

| 機能 | 内容 |
|---|---|
| Rich 編集 | 見出し（H1–H3）、太字、斜体、打ち消し、リンク、コード、リスト、引用、コードブロック、水平線 |
| Markdown 同期 | contenteditable の HTML を Markdown へ変換し、Source Preview に反映 |
| Source 編集 | 生の Markdown を textarea で編集。Rich 側の描画を更新 |
| 自動保存 | 入力停止から約 1.2 秒で `localStorage` に保存。`⌘/Ctrl + S` で即時保存 |
| 複数文書 | 左の一覧で切り替え。ダブルクリックで名前変更、不要な文書は削除 |
| 検索・置換 | 大文字小文字、正規表現、全角半角の正規化に対応。ヒットをソース上でハイライト |
| エクスポート | Markdown / HTML / JSON / Quarto / Plain Text を Blob でローカル生成 |
| テーマ | Dark / Light / Sepia。文字サイズは 12〜22px |
| PWA | manifest + Service Worker。ホーム画面へ追加、オフライン起動 |
| 入力補助 | Markdown ファイルのドラッグ＆ドロップ、ペーストのプレーンテキスト化 |

## クイックスタート

### 1. 公開版を開く

- [GooseEditor/editor/](https://watanabe3tipapa.github.io/goose-sandbox/GooseEditor/editor/)

### 2. ローカルで動かす

Service Worker の登録には `http://localhost` などのオリジンが必要です。`file://` で開くと PWA 以外の機能のみ動作します。

```sh
cd goose-sandbox
python3 -m http.server 8765
```

- LP: `http://localhost:8765/GooseEditor/`
- エディタ: `http://localhost:8765/GooseEditor/editor/`

### 3. テスト

```sh
node --test GooseEditor/editor/lib/model.test.js
```

外部依存はありません。`lib/model.js` は DOM に触れない純粋ロジックなので、Node で直接検証できます。

## ショートカット

| 操作 | キー |
|---|---|
| 保存 | `⌘/Ctrl + S` |
| 新しい文書 | `⌘/Ctrl + N` |
| ファイルを開く | `⌘/Ctrl + O` |
| 検索 / 置換 | `⌘/Ctrl + F` / `⌘/Ctrl + H` |
| 太字 / 斜体 / リンク / コード | `⌘/Ctrl + B` / `I` / `K` / `` ` `` |
| 見出し 1–3 / 段落 | `⌘/Ctrl + 1…3` / `0` |
| 番号付き / 箇条書き | `⌘/Ctrl + Shift + 7` / `8` |
| 引用 | `⌘/Ctrl + Shift + >` |
| 文書一覧の表示切替 | `⌘/Ctrl + \` |

## 構成

```text
GooseEditor/
├── index.html                  # プロジェクト LP
├── README.md                   # このファイル
├── assets/
│   └── editor-preview.webp     # LP 用スクリーンショット
└── editor/
    ├── index.html              # エディタ本体
    ├── app.js                  # UI・同期・保存・検索・エクスポート
    ├── lib/
    │   ├── model.js            # Markdown パース / シリアライズ / エクスポート
    │   └── model.test.js       # 20 テスト
    ├── manifest.json           # PWA manifest
    ├── sw.js                   # Service Worker（シェルキャッシュ）
    ├── icon.svg
    ├── icon-192.png
    ├── icon-512.png
    ├── icon-maskable-512.png
    └── apple-touch-icon.png
```

### モデルの責務

`lib/model.js` はブラウザと Node の両方から使える UMD 形式です。DOM には依存しません。

- `parseMarkdown(source)` — 見出し・段落・リスト・引用・コード・水平線をブロックへ
- `serializeMarkdown(doc)` — ブロックから Markdown へ
- `parseInline(text)` — 強調・コード・リンク・打ち消しのインライン解析
- `documentToHtml` / `documentToJson` / `documentToQuarto` / `documentToPlain`
- `findMatches` / `statistics` / `titleOf` / `safeFileName`

UI 側の `app.js` は contenteditable の HTML を Markdown へ変換し、このモデルへ渡します。Goose コンパイラが使える環境では、このモデル層を Goose コアへ差し替える想定です。

## PWA とデータ

- `manifest.json` は `start_url` / `scope` を `./` に限定し、192 / 512 / maskable アイコンを同梱
- `sw.js` はアプリシェル（HTML / JS / manifest / アイコン）のみをキャッシュ
- 文書データは Service Worker のキャッシュには含めず、`localStorage` にのみ保存
- 初回訪問後に「インストール」ボタンが表示されます（対応ブラウザ）。iOS Safari では共有メニューの「ホーム画面に追加」を案内

## 制約

- **Goose コンパイラ未接続** — 本実装はブラウザで動くプロトタイプです。Goose 言語の実行・型検査は行いません。
- **端末内保存のみ** — 同期・共同編集・クラウド保存は対象外です。ブラウザのデータ消去で内容も消えます。
- **localStorage の容量** — 巨大な文書や画像の埋め込みには向きません。必要な内容はこまめに書き出してください。
- **Rich 編集の変換範囲** — contenteditable の HTML は見出し・段落・リスト・引用・コード・水平線・基本インラインのみ Markdown 化します。表や任意 HTML は保持されません。

## ライセンス

MIT — [../LICENSE](../LICENSE)
