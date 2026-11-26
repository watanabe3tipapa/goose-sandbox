# goose-sandbox

**試して、確かめるための実験場。**

Goose をはじめとする実験プロジェクトを、プロジェクトごとの独立したディレクトリで管理する sandbox リポジトリです。完成度よりも、動く形にして検証することを優先しています。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-site-00e5a8.svg)](https://watanabe3tipapa.github.io/goose-sandbox/)

> **このブランチは `goose`（開発用）です。** Goose の実装とメトリクス出力の検証を行います。公開用の静的サイトとダッシュボードは `main` ブランチにあり、GitHub Pages も `main` からのみデプロイします。このブランチでは `PipelineViz/viewer/`、`PipelineViz/index.html`、`.github/workflows/pages.yml` を削除しています。

---

## プロジェクト一覧

| # | プロジェクト | 状態 | 入口 |
|---|---|---|---|
| 01 | [Pipeline Viz](PipelineViz/) | Goose 実装 | [README](PipelineViz/README.md) / [LP（main）](https://watanabe3tipapa.github.io/goose-sandbox/PipelineViz/) / [Dashboard（main）](https://watanabe3tipapa.github.io/goose-sandbox/PipelineViz/viewer/) |
| 02 | [Goose サンプル探訪](GooseSamples/) | Active | [LP](GooseSamples/) / [探訪ビュー](GooseSamples/explorer/) / [README](GooseSamples/README.md) |
| 03 | [Process Sentinel](ProcessSentinel/) | Active | [LP](ProcessSentinel/) / [Viewer](ProcessSentinel/viewer/) / [README](ProcessSentinel/README.md) |
| 04 | [Mobile Safety Kit](MobileSafetyKit/) | Active | [LP](MobileSafetyKit/) / [Dashboard](MobileSafetyKit/viewer/) / [README](MobileSafetyKit/README.md) |
| 05 | [Bootprint](Bootprint/) | Active | [LP](Bootprint/) / [Viewer](Bootprint/viewer/) / [README](Bootprint/README.md) |
| 06 | [Goose Editor](GooseEditor/) | Active | [LP](GooseEditor/) / [Editor](GooseEditor/editor/) / [README](GooseEditor/README.md) |
| 07 | [Gander](Gander/) | Active | [LP](Gander/) / [Atlas](Gander/atlas/) / [KeyLint Lab](Gander/atlas/lab.html) / [Goose](Gander/goose/) / [README](Gander/README.md) |

### Pipeline Viz

Goose で ETL を実行し、ダッシュボードが読む `metrics.json` を生成する開発ブランチです。ダッシュボードと LP は `main` ブランチで管理しており、このブランチには含まれません。

- 開発用 README: [PipelineViz/README.md](PipelineViz/README.md)
- Goose 実装: `PipelineViz/src/{main,pipeline,metrics}.goose`
- 検証: `scripts/build.sh` / `scripts/verify.sh`
- Goose 言語ガイド: [PipelineViz/goose_language_guide.html](PipelineViz/goose_language_guide.html)
- 実装提案資料: [PipelineViz/pipeline_viz_proposal.html](PipelineViz/pipeline_viz_proposal.html)

```sh
export GOOSE=/path/to/goose
scripts/build.sh
# -> PipelineViz/out/metrics.json を生成し、スキーマを検証
```

現在の状態:

| 項目 | 状態 |
|---|---|
| Goose ETL / `StepMetrics` / `PipelineSnapshot` | 実装済み |
| `metrics.json` の生成 | Goose v2026.4 で検証済み |
| スキーマ検証 | 実装済み（Node.js） |
| ダッシュボードでの表示 | 未マージ（`main` はデモモードのまま） |
| oh-my-mermaid CLI 連携 | 未実施（`.omm/` は手書き） |

`main` へマージする条件は [PipelineViz/README.md](PipelineViz/README.md#main-へのマージ条件) に記載しています。Goose での生成とスキーマ検証が通り、ダッシュボードで表示できることを確認するまでマージしません。

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

### Bootprint

macOS の launchd ジョブを 4 つの配置レーンとベンダーで読み、トリガー・署名・前回差分・24 時間スケジュールを可視化する静的ビューアです。起動時に何が動くのかを「読む順番」として組み立てます。

- LP: [https://watanabe3tipapa.github.io/goose-sandbox/Bootprint/](https://watanabe3tipapa.github.io/goose-sandbox/Bootprint/)
- Viewer: [https://watanabe3tipapa.github.io/goose-sandbox/Bootprint/viewer/](https://watanabe3tipapa.github.io/goose-sandbox/Bootprint/viewer/)
- 提案資料: [Bootprint/bootprint_proposal.html](Bootprint/bootprint_proposal.html)
- 収集: `tools/collect_launch_jobs.py`（`plutil` / `launchctl` / `codesign`、macOS のみ）

### Goose Editor

リッチテキストと Markdown を往復しながら、文章を端末内に保存するローカルファーストの軽量エディタです。Rich ⇄ Source を双方向同期し、検索置換・5 種類の書き出し・PWA オフライン起動に対応します。

- LP: [https://watanabe3tipapa.github.io/goose-sandbox/GooseEditor/](https://watanabe3tipapa.github.io/goose-sandbox/GooseEditor/)
- Editor: [https://watanabe3tipapa.github.io/goose-sandbox/GooseEditor/editor/](https://watanabe3tipapa.github.io/goose-sandbox/GooseEditor/editor/)
- モデル: `editor/lib/model.js`（パース / シリアライズ / エクスポート、20 テスト）
- 保存: `localStorage` のみ。Service Worker はアプリシェルのみをキャッシュ

### Gander

7 つの実験展示を、問い・パイプライン・7 つの仕組みで横断して読むアトラスです。07 自身は秘密検出の 7 段階を試せる KeyLint Lab として内包し、Goose 言語の特色をコードとデータスタックモデルで読むコーナーも併設しています。

- LP: [https://watanabe3tipapa.github.io/goose-sandbox/Gander/](https://watanabe3tipapa.github.io/goose-sandbox/Gander/)
- Atlas: [https://watanabe3tipapa.github.io/goose-sandbox/Gander/atlas/](https://watanabe3tipapa.github.io/goose-sandbox/Gander/atlas/)
- KeyLint Lab: [https://watanabe3tipapa.github.io/goose-sandbox/Gander/atlas/lab.html](https://watanabe3tipapa.github.io/goose-sandbox/Gander/atlas/lab.html)
- Goose 言語コーナー: [https://watanabe3tipapa.github.io/goose-sandbox/Gander/goose/](https://watanabe3tipapa.github.io/goose-sandbox/Gander/goose/)
- データ: `data/exhibits.json` / `data/mechanisms.json` / `data/lab-samples.json` / `data/goose-features.json`
- ロジック: `lib/atlas.js` / `lib/lab.js` / `lib/goose.js`（Node テスト付き）

## リポジトリ構成

以下は `goose` ブランチの構成です。`main` では `PipelineViz/viewer/` と `PipelineViz/index.html`、`.github/workflows/pages.yml` が残ります。

```text
goose-sandbox/
├── index.html                    # Sandbox ホーム（プロジェクト一覧）
├── README.md                     # このファイル
├── PipelineViz/                  # プロジェクト 01（Goose 実装）
│   ├── src/
│   │   ├── main.goose            # エントリーポイント
│   │   ├── pipeline.goose        # ETL と measure()
│   │   ├── metrics.goose         # データ構造と JSON 出力
│   │   └── sample.csv            # 検証用入力
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
├── Bootprint/                    # プロジェクト 05
│   ├── index.html                # プロジェクト LP
│   ├── bootprint_proposal.html   # 提案資料
│   ├── viewer/                   # 永続化マップ / インスペクタ / 24h リボン
│   │   ├── data/                 # デモスナップショットとベースライン
│   │   └── lib/                  # 検証・分類・差分・スケジュール
│   ├── tools/                    # launchd コレクタ
│   └── README.md
├── GooseEditor/                  # プロジェクト 06
│   ├── index.html                # プロジェクト LP
│   ├── assets/                   # LP 用スクリーンショット
│   ├── editor/                   # エディタ本体（PWA）
│   │   ├── lib/                  # Markdown モデルとテスト
│   │   ├── manifest.json
│   │   └── sw.js
│   └── README.md
├── Gander/                       # プロジェクト 07
│   ├── index.html                # プロジェクト LP
│   ├── atlas/                    # 展示・仕組みの一覧と詳細、KeyLint Lab
│   ├── goose/                    # Goose 言語コーナー
│   ├── data/                     # 展示・仕組み・Lab サンプル・言語特色
│   ├── lib/                      # 検索・判定・データスタックモデルとテスト
│   └── README.md
├── scripts/
│   ├── build.sh                  # Goose 実行 + 検証
│   └── verify.sh                 # スナップショットのスキーマ検証
├── .gitignore
├── .nojekyll
└── LICENSE
```

## GitHub Pages

このブランチには `.github/workflows/pages.yml` がありません。公開は `main` ブランチからのみ行います。以下は `main` の公開先です。`.github/workflows/pages.yml` が `main` ブランチへの push でリポジトリ全体を GitHub Pages にデプロイします。Sandbox ホームをルートに置き、各プロジェクトはサブディレクトリで公開します。

- Sandbox ホーム: [https://watanabe3tipapa.github.io/goose-sandbox/](https://watanabe3tipapa.github.io/goose-sandbox/)
- Pipeline Viz: [https://watanabe3tipapa.github.io/goose-sandbox/PipelineViz/](https://watanabe3tipapa.github.io/goose-sandbox/PipelineViz/)
- Goose サンプル探訪: [https://watanabe3tipapa.github.io/goose-sandbox/GooseSamples/](https://watanabe3tipapa.github.io/goose-sandbox/GooseSamples/)
- Process Sentinel: [https://watanabe3tipapa.github.io/goose-sandbox/ProcessSentinel/](https://watanabe3tipapa.github.io/goose-sandbox/ProcessSentinel/)
- Mobile Safety Kit: [https://watanabe3tipapa.github.io/goose-sandbox/MobileSafetyKit/](https://watanabe3tipapa.github.io/goose-sandbox/MobileSafetyKit/)
- Bootprint: [https://watanabe3tipapa.github.io/goose-sandbox/Bootprint/](https://watanabe3tipapa.github.io/goose-sandbox/Bootprint/)
- Goose Editor: [https://watanabe3tipapa.github.io/goose-sandbox/GooseEditor/](https://watanabe3tipapa.github.io/goose-sandbox/GooseEditor/)
- Goose Editor 本体: [https://watanabe3tipapa.github.io/goose-sandbox/GooseEditor/editor/](https://watanabe3tipapa.github.io/goose-sandbox/GooseEditor/editor/)
- Gander: [https://watanabe3tipapa.github.io/goose-sandbox/Gander/](https://watanabe3tipapa.github.io/goose-sandbox/Gander/)
- Gander Atlas: [https://watanabe3tipapa.github.io/goose-sandbox/Gander/atlas/](https://watanabe3tipapa.github.io/goose-sandbox/Gander/atlas/)
- KeyLint Lab: [https://watanabe3tipapa.github.io/goose-sandbox/Gander/atlas/lab.html](https://watanabe3tipapa.github.io/goose-sandbox/Gander/atlas/lab.html)
- Goose 言語コーナー: [https://watanabe3tipapa.github.io/goose-sandbox/Gander/goose/](https://watanabe3tipapa.github.io/goose-sandbox/Gander/goose/)

初回のみ、リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に設定してください。

## ローカル確認

`goose` ブランチには `viewer/` がないため、Dashboard の URL は 404 になります。Goose の実行と検証は `scripts/build.sh` を使ってください。

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
- Bootprint: `http://localhost:8000/Bootprint/`
- Bootprint Viewer: `http://localhost:8000/Bootprint/viewer/`
- Goose Editor: `http://localhost:8000/GooseEditor/`
- Goose Editor 本体: `http://localhost:8000/GooseEditor/editor/`
- Gander: `http://localhost:8000/Gander/`
- Gander Atlas: `http://localhost:8000/Gander/atlas/`
- KeyLint Lab: `http://localhost:8000/Gander/atlas/lab.html`
- Goose 言語コーナー: `http://localhost:8000/Gander/goose/`

## 新しいプロジェクトを追加する

1. リポジトリ直下に `NewProject/` を作成する
2. `NewProject/index.html` を入口にする（相対パスで完結させる）
3. ルート `index.html` の Projects にカードを追加する
4. この README のプロジェクト一覧と構成を更新する

静的な HTML / CSS / JavaScript で完結するプロジェクトは、追加のビルド設定なしでそのまま GitHub Pages に公開できます。

## ライセンス

MIT ライセンス — 詳細は [LICENSE](LICENSE) を参照してください。
