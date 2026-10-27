# Goose サンプル探訪

**31 本を、読む順に。**

Goose 公式サンプル 31 本を、カテゴリ・難易度・必要な環境で辿り、解説とソースコードを 1 画面で読むための静的サイトです。ビルド不要で、GitHub Pages にそのまま公開できます。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../LICENSE)
[![Samples: Apache--2.0](https://img.shields.io/badge/samples-Apache--2.0-blue.svg)](LICENSE-APACHE-2.0.txt)
[![Version](https://img.shields.io/badge/version-v0.1.0-blue.svg)](https://github.com/watanabe3tipapa/goose-sandbox)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-site-00e5a8.svg)](https://watanabe3tipapa.github.io/goose-sandbox/GooseSamples/)

---

## 概要

Goose のサンプルは、言語の設計思想を最短で理解できる教材です。ただし公式リポジトリでは、31 本のファイルと長い README が並ぶだけで、「どれから読むか」「何が必要か」「どこが面白いか」は読む側が組み立てる必要があります。

Goose サンプル探訪は、そこを補う **読書用の地図**です。

- 31 本を 8 カテゴリ・3 難易度に整理
- 各サンプルに日本語の要約、学べること、タグ、必要環境を付与
- ソースコードを原文のまま、行番号と簡易ハイライト付きで表示
- 検索・絞り込み・読了チェック・URL 共有

## 主な特徴

- **ビルド不要** — HTML / CSS / JavaScript のみ。GitHub Pages にそのまま置けます
- **データ駆動** — 一覧は `explorer/data/samples.json`、コードは `explorer/data/sources/*.goose` から実行時に読み込みます
- **原文を保持** — 収録コードは上流のコピーで、改変していません。帰属は [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) に記載
- **絞り込み** — カテゴリ、難易度、必要環境、未読のみ、フリーワード検索
- **読了管理** — `localStorage` に保存し、進捗バーと「未読のみ」に反映
- **共有可能な URL** — 絞り込みと選択中のサンプルをクエリに保持
- **キーボード操作** — `/` で検索、`j` / `k` で前後、`Esc` で詳細を閉じる
- **依存なし** — 外部ライブラリなし。フォントだけ Google Fonts から読み込みます

## 使い方

リポジトリのルートで静的サーバーを起動し、`GooseSamples/` を開きます。

```sh
python3 -m http.server 8000
# http://localhost:8000/GooseSamples/
```

`explorer/` は `fetch()` で JSON とソースを読むため、`file://` で直接開くと動作しません。公開サイトはこちらです。

- LP: [https://watanabe3tipapa.github.io/goose-sandbox/GooseSamples/](https://watanabe3tipapa.github.io/goose-sandbox/GooseSamples/)
- 探訪ビュー: [https://watanabe3tipapa.github.io/goose-sandbox/GooseSamples/explorer/](https://watanabe3tipapa.github.io/goose-sandbox/GooseSamples/explorer/)

## 画面構成

| 画面 | パス | 内容 |
|---|---|---|
| LP | `index.html` | 全体像、カテゴリ、読む順、必要環境、出典 |
| 探訪ビュー | `explorer/index.html` | 絞り込み、カード一覧、詳細、ソース表示 |

### URL パラメータ

| パラメータ | 値 | 内容 |
|---|---|---|
| `sample` | `18_json` など | 詳細を開くサンプル |
| `cat` | `foundations` など | カテゴリで絞り込む |
| `level` | `intro` / `intermediate` / `advanced` | 難易度で絞り込む |
| `req` | `stdlib` / `gfx` など | 必要環境で絞り込む |
| `q` | 任意の文字列 | 検索語 |
| `sort` | `number` / `lines` / `title` | 並び順 |
| `unread` | `1` | 未読のみ |

例: `explorer/?cat=language&sample=18_json`

## 収録データ

| 項目 | 値 |
|---|---|
| 出典 | [aardappel/goose](https://github.com/aardappel/goose) |
| コミット | `64d62fc7f148eadaed9b1c69be0c33d1da97c82f`（2026-10-26） |
| サンプル数 | 31 |
| 合計行数 | 7,420 |
| ライセンス | Apache-2.0 |

カテゴリは上流の章立てを 8 分類に整理したものです。難易度は「入門 01–06 / 中級 07–19・24 / 発展 20–23・25–31」としています。

| カテゴリ | 範囲 | 本数 |
|---|---|---|
| 基礎 | 01–06 | 6 |
| アルゴリズム | 07–12 | 6 |
| データ構造 | 13–16 | 4 |
| 言語処理 | 17–19 | 3 |
| グラフィックス・並列 | 20–23 | 4 |
| 実践 | 24–26 | 3 |
| 応用（GPU/UI） | 27–29 | 3 |
| ゲーム | 30–31 | 2 |

## データ形式

`explorer/data/samples.json` は、メタ情報・分類・サンプル一覧を持ちます（コード本体は含みません）。

```json
{
  "meta": {
    "source": "aardappel/goose",
    "commit": "64d62fc7f148eadaed9b1c69be0c33d1da97c82f",
    "license": "Apache-2.0",
    "totalSamples": 31,
    "totalLines": 7420
  },
  "categories": [{ "id": "language", "label": "言語処理", "range": "17–19" }],
  "levels": [{ "id": "intro", "label": "入門" }],
  "requirements": [{ "id": "stdlib", "label": "標準のみ" }],
  "features": [{ "id": "parsing", "label": "パース" }],
  "samples": [
    {
      "id": "18_json",
      "number": 18,
      "title": "JSON パーサー",
      "originalTitle": "A JSON parser and printer",
      "category": "language",
      "level": "intermediate",
      "lines": 313,
      "summary": "可変モード enum のノードを 1 つのプールに置き、4 バイトの自己相対リンクで辿る JSON パーサー兼プリンタです。",
      "shows": ["文書全体が 1 つの連続ブロックに収まる"],
      "features": ["parsing", "enums", "pools", "recursion", "errors"],
      "requirements": ["stdlib"],
      "run": "goose 18_json.goose",
      "notes": "",
      "file": "sources/18_json.goose",
      "upstream": "18_json.goose",
      "upstreamUrl": "https://github.com/aardappel/goose/blob/64d62fc7f148eadaed9b1c69be0c33d1da97c82f/samples/18_json.goose"
    }
  ]
}
```

`file` は `explorer/data/` からの相対パスです。`samples.json` は起動時に検証され、ID の重複、未定義のカテゴリ、行数の不整合などがあれば画面にエラーを表示します。

## データの更新

上流のサンプルを更新するときは、次の順で行います。

1. 対象コミットの `samples/*.goose` を `explorer/data/sources/` にコピーする
2. `samples.json` の `meta.commit`、`meta.generated`、`meta.totalLines` を更新する
3. 各サンプルの `lines` と `upstreamUrl` を新しいコミットに合わせる
4. `node --test GooseSamples/explorer/lib/*.test.js` を実行する

テストは、収録ファイルの実在と行数の一致を検証します。行数を直し忘れると失敗します。

## テスト

データ層（カタログ検証・検索・絞り込み・URL）とハイライトは、Node.js の組み込みテストランナーで確認できます。

```sh
node --test GooseSamples/explorer/lib/catalog.test.js GooseSamples/explorer/lib/highlight.test.js
```

## リポジトリ構成

```text
GooseSamples/
├── index.html                  # LP
├── explorer/
│   ├── index.html              # 探訪ビュー（CSS 込み）
│   ├── explorer.js             # 描画・検索・絞り込み・URL 同期
│   ├── lib/
│   │   ├── catalog.js          # 検証・検索・絞り込み・URL（UMD）
│   │   ├── catalog.test.js
│   │   ├── highlight.js        # Goose 簡易ハイライト
│   │   └── highlight.test.js
│   └── data/
│       ├── samples.json        # 31 件のメタデータ
│       └── sources/            # 原文の .goose（31 本）
├── LICENSE-APACHE-2.0.txt      # 上流コードのライセンス全文
├── THIRD_PARTY_LICENSES.md     # 帰属
└── README.md
```

## 現在の制限

- 収録コードは上流のスナップショットで、自動追従はしません
- サンプルの実行環境は提供しません（WASM 実行・ビルドは未対応）
- ハイライトは簡易的なもので、Goose のパーサーではありません
- コード内の全文検索は未実装です（検索対象はメタデータと解説）
- 読了状態はブラウザの `localStorage` にのみ保存されます
- 複数端末での進捗同期はありません

## ライセンスと帰属

- このプロジェクトのコードとドキュメント: [MIT](../LICENSE)
- 収録している Goose サンプル: Apache-2.0（[LICENSE-APACHE-2.0.txt](LICENSE-APACHE-2.0.txt)）

Goose は Wouter van Oortmerssen 氏と貢献者によるプロジェクトです。サンプルコードは [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) に記したコミットから、無改変で収録しています。

## リンク

- 公式リポジトリ: [https://github.com/aardappel/goose](https://github.com/aardappel/goose)
- 公式サンプル: [https://github.com/aardappel/goose/tree/master/samples](https://github.com/aardappel/goose/tree/master/samples)
- Goose 言語ガイド（Pipeline Viz 内）: [../PipelineViz/goose_language_guide.html](../PipelineViz/goose_language_guide.html)
- Sandbox ホーム: [../](../)
