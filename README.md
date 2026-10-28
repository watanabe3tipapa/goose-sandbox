# goose-sandbox

**試して、確かめるための実験場。**

Goose をはじめとする実験プロジェクトを、プロジェクトごとの独立したディレクトリで管理する sandbox リポジトリです。完成度よりも、動く形にして検証することを優先しています。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-site-00e5a8.svg)](https://watanabe3tipapa.github.io/goose-sandbox/)

---

## プロジェクト一覧

| # | プロジェクト | 状態 | 入口 |
|---|---|---|---|
| 01 | [Pipeline Viz](PipelineViz/) | Active | [LP](PipelineViz/) / [Dashboard](PipelineViz/viewer/) / [README](PipelineViz/README.md) |
| 02 | [Goose サンプル探訪](GooseSamples/) | Active | [LP](GooseSamples/) / [探訪ビュー](GooseSamples/explorer/) / [README](GooseSamples/README.md) |
| 03 | [Process Sentinel](ProcessSentinel/) | Active | [LP](ProcessSentinel/) / [Viewer](ProcessSentinel/viewer/) / [README](ProcessSentinel/README.md) |
| 04 | [Mobile Safety Kit](MobileSafetyKit/) | Active | [LP](MobileSafetyKit/) / [Dashboard](MobileSafetyKit/viewer/) / [README](MobileSafetyKit/README.md) |

### Pipeline Viz

Goose の実行時メトリクスと oh-my-mermaid の Perspective 構造を接合し、データ処理パイプラインの「流れ」と「健康状態」を可視化する静的プロトタイプです。

- LP: [https://watanabe3tipapa.github.io/goose-sandbox/PipelineViz/](https://watanabe3tipapa.github.io/goose-sandbox/PipelineViz/)
- Dashboard: [https://watanabe3tipapa.github.io/goose-sandbox/PipelineViz/viewer/](https://watanabe3tipapa.github.io/goose-sandbox/PipelineViz/viewer/)
- Goose 言語ガイド: [PipelineViz/goose_language_guide.html](PipelineViz/goose_language_guide.html)
- 実装提案資料: [PipelineViz/pipeline_viz_proposal.html](PipelineViz/pipeline_viz_proposal.html)

### Goose サンプル探訪

Goose 公式サンプル 31 本を、カテゴリ・難易度・必要な環境で辿り、解説とソースコードを 1 画面で読む静的サイトです。

- LP: [https://watanabe3tipapa.github.io/goose-sandbox/GooseSamples/](https://watanabe3tipapa.github.io/goose-sandbox/GooseSamples/)
- 探訪ビュー: [https://watanabe3tipapa.github.io/goose-sandbox/GooseSamples/explorer/](https://watanabe3tipapa.github.io/goose-sandbox/GooseSamples/explorer/)
- 収録: `aardappel/goose` @ `64d62fc`（Apache-2.0、無改変）

### Process Sentinel

Mac のプロセスを親子ツリーとして表示し、署名・CPU・メモリ・ネットワーク接続・前回スナップショットとの差分から不審な動きを読む静的ビューアです。

- LP: [https://watanabe3tipapa.github.io/goose-sandbox/ProcessSentinel/](https://watanabe3tipapa.github.io/goose-sandbox/ProcessSentinel/)
- Viewer: [https://watanabe3tipapa.github.io/goose-sandbox/ProcessSentinel/viewer/](https://watanabe3tipapa.github.io/goose-sandbox/ProcessSentinel/viewer/)
- 収集: `tools/collect_processes.py`（`ps` / `codesign` / `lsof`、macOS のみ）

### Mobile Safety Kit

スマホの OS・通信・権限・追跡防止をブラウザ標準 API だけで診断し、Device → Network → Privacy → Risk Judge のパイプラインとして表示する静的ダッシュボードです。

- LP: [https://watanabe3tipapa.github.io/goose-sandbox/MobileSafetyKit/](https://watanabe3tipapa.github.io/goose-sandbox/MobileSafetyKit/)
- Dashboard: [https://watanabe3tipapa.github.io/goose-sandbox/MobileSafetyKit/viewer/](https://watanabe3tipapa.github.io/goose-sandbox/MobileSafetyKit/viewer/)
- デモ表示: [https://watanabe3tipapa.github.io/goose-sandbox/MobileSafetyKit/viewer/?demo=1](https://watanabe3tipapa.github.io/goose-sandbox/MobileSafetyKit/viewer/?demo=1)
- 判定: `viewer/lib/scanner.js`（8 チェック / 重み付きスコア / Unknown は除外）

## リポジトリ構成

```text
goose-sandbox/
├── index.html                    # Sandbox ホーム（プロジェクト一覧）
├── README.md                     # このファイル
├── PipelineViz/                  # プロジェクト 01
│   ├── index.html                # プロジェクト LP
│   ├── viewer/                   # ダッシュボード
│   ├── assets/                   # ドキュメント共通スタイル
│   ├── .omm/                     # oh-my-mermaid の Perspective 定義
│   ├── goose_language_guide.html
│   ├── pipeline_viz_proposal.html
│   └── README.md
├── GooseSamples/                 # プロジェクト 02
│   ├── index.html                # プロジェクト LP
│   ├── explorer/                 # 探訪ビュー
│   │   └── data/                 # samples.json とソース 31 本（Apache-2.0）
│   └── README.md
├── ProcessSentinel/              # プロジェクト 03
│   ├── index.html                # プロジェクト LP
│   ├── viewer/                   # プロセスツリービューア
│   │   ├── data/                 # デモスナップショットとベースライン
│   │   └── lib/                  # 分類・差分・レイアウト
│   ├── tools/                    # macOS コレクタ
│   └── README.md
├── MobileSafetyKit/              # プロジェクト 04
│   ├── index.html                # プロジェクト LP
│   ├── viewer/                   # セキュリティ診断ダッシュボード
│   │   ├── lib/                  # 判定・スコア・差分
│   │   └── data/                 # 合成デモレポート
│   ├── tools/                    # デモレポート生成
│   ├── .omm/                     # oh-my-mermaid の Perspective 定義
│   └── README.md
├── .github/
│   └── workflows/
│       └── pages.yml             # GitHub Pages デプロイ
├── .gitignore
├── .nojekyll
└── LICENSE
```

## GitHub Pages

`.github/workflows/pages.yml` が `main` ブランチへの push でリポジトリ全体を GitHub Pages にデプロイします。Sandbox ホームをルートに置き、各プロジェクトはサブディレクトリで公開します。

- Sandbox ホーム: [https://watanabe3tipapa.github.io/goose-sandbox/](https://watanabe3tipapa.github.io/goose-sandbox/)
- Pipeline Viz: [https://watanabe3tipapa.github.io/goose-sandbox/PipelineViz/](https://watanabe3tipapa.github.io/goose-sandbox/PipelineViz/)
- Goose サンプル探訪: [https://watanabe3tipapa.github.io/goose-sandbox/GooseSamples/](https://watanabe3tipapa.github.io/goose-sandbox/GooseSamples/)
- Process Sentinel: [https://watanabe3tipapa.github.io/goose-sandbox/ProcessSentinel/](https://watanabe3tipapa.github.io/goose-sandbox/ProcessSentinel/)
- Mobile Safety Kit: [https://watanabe3tipapa.github.io/goose-sandbox/MobileSafetyKit/](https://watanabe3tipapa.github.io/goose-sandbox/MobileSafetyKit/)

初回のみ、リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に設定してください。

## ローカル確認

```sh
git clone https://github.com/watanabe3tipapa/goose-sandbox.git
cd goose-sandbox
python3 -m http.server 8000
```

- Sandbox ホーム: `http://localhost:8000/`
- Pipeline Viz: `http://localhost:8000/PipelineViz/`
- Dashboard: `http://localhost:8000/PipelineViz/viewer/`
- Goose サンプル探訪: `http://localhost:8000/GooseSamples/`
- 探訪ビュー: `http://localhost:8000/GooseSamples/explorer/`
- Process Sentinel: `http://localhost:8000/ProcessSentinel/`
- Process Viewer: `http://localhost:8000/ProcessSentinel/viewer/`
- Mobile Safety Kit: `http://localhost:8000/MobileSafetyKit/`
- Safety Dashboard: `http://localhost:8000/MobileSafetyKit/viewer/`

## 新しいプロジェクトを追加する

1. リポジトリ直下に `NewProject/` を作成する
2. `NewProject/index.html` を入口にする（相対パスで完結させる）
3. ルート `index.html` の Projects にカードを追加する
4. この README のプロジェクト一覧と構成を更新する

静的な HTML / CSS / JavaScript で完結するプロジェクトは、追加のビルド設定なしでそのまま GitHub Pages に公開できます。

## ライセンス

MIT ライセンス — 詳細は [LICENSE](LICENSE) を参照してください。
