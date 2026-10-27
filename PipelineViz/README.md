# Pipeline Viz

**データ処理工程を、生きた設計図に。**

Pipeline Viz は、**Goose によるデータ処理工程の「見える化」**を主題に、実行時メトリクスと **oh-my-mermaid** の Perspective 構造を接合し、データ処理パイプラインの「流れ」と「健康状態」を一枚のダッシュボードで可視化する試作プロジェクトです。静的なアーキテクチャ図を、実行状態を反映するライブ・ビューに変えることを目指しています。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../LICENSE)
[![Version](https://img.shields.io/badge/version-v0.1.0-blue.svg)](https://github.com/watanabe3tipapa/goose-sandbox)
[![Goose](https://img.shields.io/badge/Goose-language-00e5a8.svg)](https://aardappel.github.io/goose/)
[![oh-my-mermaid](https://img.shields.io/badge/oh--my--mermaid-Perspective-00e5a8.svg)](https://github.com/oh-my-mermaid/oh-my-mermaid)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-site-00e5a8.svg)](https://watanabe3tipapa.github.io/goose-sandbox/PipelineViz/)
[![GitHub issues](https://img.shields.io/github/issues/watanabe3tipapa/goose-sandbox.svg)](https://github.com/watanabe3tipapa/goose-sandbox/issues)

---

## 概要

パイプラインは、ステップが増えるほど「いま何が起きているか」を把握するコストが急増します。ログを追い、メトリクスを別画面で確認し、構成図と突き合わせる——この分断を減らすために、Pipeline Viz は **構造（ダイアグラム）と状態（メトリクス）を同じ枠組みで扱います**。

`goose-sandbox` リポジトリ内の `PipelineViz/` に配置された、Goose と oh-my-mermaid を組み合わせたダッシュボードの **静的プロトタイプ** です。バックエンドを持たず、ブラウザだけで動作します。`meta.yaml` と JSON スナップショットを差し替えることで、任意のパイプライン状態を表示できます。

- ランディングページ: [https://watanabe3tipapa.github.io/goose-sandbox/PipelineViz/](https://watanabe3tipapa.github.io/goose-sandbox/PipelineViz/)
- ダッシュボード: [https://watanabe3tipapa.github.io/goose-sandbox/PipelineViz/viewer/](https://watanabe3tipapa.github.io/goose-sandbox/PipelineViz/viewer/)

## コンセプト（なぜ「見える化」か）

データ処理の健全性は、単一の数値ではなく **構造と状態の関係** で決まります。Pipeline Viz は、oh-my-mermaid の Perspective ごとに次の視点を整理します。

| Perspective | 確認する内容 | ダッシュボードでの表示 |
|---|---|---|
| `data-pipeline` | ETL 本流の入出力、処理時間、隔離レコード | ステップノード、接続ラベル、ライブ指標 |
| `overall-architecture` | 収集・蓄積・可視化・ナビゲーションの層構成 | アーキテクチャ表とコンポーネント相関 |
| `error-handler` | スキーマ検証エラー、隔離、エラーログ | エラー一覧、発生元ステップ、件数 |
| `performance-metrics` | スループット、レイテンシ、隔離レコード数の推移 | 時系列チャート、ステップ別バー、履歴表 |

## 主な特徴

- **静的サイトだけで動作** — サーバーサイド処理なし。GitHub Pages にそのまま公開可能
- **meta.yaml 駆動** — `.omm/data-pipeline/meta.yaml` からメトリクス URL、ポーリング間隔、ステータス色、パイプライン一覧を実行時に読み込み
- **複数パイプライン切替** — サイドバーのセレクタと `?pipeline=` で ETL 本流 / 日次レポートを切替
- **ファイルポーリング** — 表示中の `pipelines[].metrics_url`（未指定時は `live_metrics_url`）を一定間隔で再取得し、更新を検知したら表示へ反映。更新がなければクライアント側シミュレーションで動きを継続
- **スキーマ検証** — 必須フィールド、数値、ステータス、前段との件数整合、隔離件数を検証し、結果を Meta カードに表示
- **4 つの Perspective ナビゲーション** — `.omm/config.yaml` の Perspective 名を画面切替に割り当て（各ビューはダッシュボード内の固定実装）
- **Diff モード** — 前回スナップショットとの差分をノードと指標にハイライト
- **アラート連携** — Warning / Error のステップを上部のアラートとサイドバーに自動表示
- **ドリルダウン** — ノード選択で処理時間、入出力、メッセージをインスペクタに表示
- **障害注入** — ボタン一つで 2 番目のステップを Error 状態にし、UI の挙動を確認
- **Mermaid ソース生成** — `status_map` の `classDef` を使い、現在の状態を Mermaid 定義として表示
- **meta.yaml 再読込** — ファイルを編集後、ページを再読み込みせずに設定を反映
- **URL パラメータ** — `?persp=...&pipeline=...&diff=1&live=0` で表示状態を再現
- **レスポンシブ / 印刷対応** — モバイル幅と印刷用スタイルを用意
- **ブルータリズム調の UI** — 白背景、黒枠、アクセントカラー `#00e5a8`

## デモ

### ダッシュボード

`viewer/` を開くと、サンプルスナップショットが読み込まれます。サイドバーで Perspective を切り替え、ノードをクリックすると詳細が表示されます。

```text
https://watanabe3tipapa.github.io/goose-sandbox/PipelineViz/viewer/
```

表示状態を URL で固定できます。

```text
?persp=performance-metrics     # 時系列指標を開く
?pipeline=etl-reporting        # 日次レポートのパイプラインを表示
?diff=1                        # Diff モードを有効化
?live=0                        # ライブ更新を停止
```

### ドキュメント

- [Goose プログラミング言語 詳細解説](goose_language_guide.html)
- [データ処理工程「見える化」ダッシュボード提案](pipeline_viz_proposal.html)

## 使い方

### ローカルで開く

`fetch()` で JSON を読み込むため、`file://` ではなく静的サーバー経由で開いてください。

```sh
git clone https://github.com/watanabe3tipapa/goose-sandbox.git
cd goose-sandbox
python3 -m http.server 8000
```

- Sandbox ホーム: `http://localhost:8000/`
- PipelineViz LP: `http://localhost:8000/PipelineViz/`
- ダッシュボード: `http://localhost:8000/PipelineViz/viewer/`

サーバーなしで `PipelineViz/viewer/index.html` を直接開いた場合も、埋め込みサンプルで動作します（`meta.yaml` と JSON は取得できず、既定値と埋め込みの ETL サンプルが使われます）。

### テスト

データ層（YAML パーサー・設定解決・スキーマ検証）は Node.js の組み込みテストランナーで確認できます。

```sh
node --test PipelineViz/viewer/lib/data-source.test.js
```

### 自分のデータに差し替える

表示設定は `PipelineViz/.omm/data-pipeline/meta.yaml`、スナップショットは `PipelineViz/viewer/data/*.json` にあります。ビューアは起動時に `meta.yaml` を読み、`pipelines[]` の `metrics_url` を解決して JSON を取得します。取得に失敗した場合は `viewer/index.html` 内の `FALLBACK_SNAPSHOT`（ETL 本流の埋め込みサンプル）が使われます。

```yaml
updated: 2026-10-27T09:15:02Z
git_commit: a1b2c3d
live_metrics_url: ../../viewer/data/metrics.json
poll_interval_ms: 2500
default_pipeline: etl-main
pipelines:
  - id: etl-main
    label: ETL 本流
    metrics_url: ../../viewer/data/metrics.json
    prev_url: ../../viewer/data/metrics-prev.json
  - id: etl-reporting
    label: 日次レポート
    metrics_url: ../../viewer/data/etl-reporting.json
    prev_url: ../../viewer/data/etl-reporting-prev.json
status_map:
  Healthy: "classDef healthy fill:#8ef0cf,stroke:#0b0b0b,color:#0b0b0b"
  Warning: "classDef warning fill:#ffc857,stroke:#0b0b0b,color:#0b0b0b"
  Error: "classDef error fill:#ff6b6b,stroke:#0b0b0b,color:#0b0b0b"
  External: "classDef external fill:#b8dcff,stroke:#0b0b0b,color:#0b0b0b"
```

| フィールド | 型 | 説明 |
|---|---|---|
| `updated` | string | `meta.yaml` の更新時刻 |
| `git_commit` | string | 表示用のコミット識別子 |
| `live_metrics_url` | string | 既定のメトリクス URL（`pipelines` 省略時、および `pipelines[].metrics_url` 省略時のフォールバック） |
| `poll_interval_ms` | number | 再取得・シミュレーションの間隔（500–60,000 ms、既定 2,500） |
| `default_pipeline` | string | 初期表示する `pipelines[].id` |
| `pipelines[]` | array | 切替可能なパイプライン一覧 |
| `pipelines[].id` | string | 一意な ID（`?pipeline=` の値） |
| `pipelines[].label` | string | セレクタに表示する名前 |
| `pipelines[].metrics_url` | string | 現在のスナップショット（`meta.yaml` からの相対パス。省略時は `live_metrics_url`） |
| `pipelines[].prev_url` | string | Diff 用の前回スナップショット（省略時は `metrics_url` から `-prev.json` を導出） |
| `status_map` | map | Mermaid の `classDef` 定義。未指定のステータスは既定色を使用 |
| `prev_diagram` | string | oh-my-mermaid 互換の Mermaid 定義（省略可。ビューアの Diff は `prev_url` の JSON を使用） |

`prev_diagram` は oh-my-mermaid 側との互換用に保持しており、現在のダッシュボード表示には使用していません。

#### ポーリングとシミュレーション

`poll_interval_ms` ごとに `metrics_url` を再取得します。内容のハッシュが変わっていれば新しいスナップショットとして反映し、変わっていなければクライアント側で数値を揺らしてライブ感を保ちます。再取得または JSON の解析に 3 回連続で失敗した場合はシミュレーションへ切り替わり、Meta カードに警告が表示されます。`?live=0` を指定すると再取得もシミュレーションも停止します。

> GitHub Pages や CDN 経由で公開した場合、エッジキャッシュの都合で JSON の更新が反映されるまで時間がかかることがあります。すぐに反映したい場合はキャッシュバスター（`?v=...`）を付けた URL を `meta.yaml` に設定するか、ローカルサーバーで確認してください。

#### スキーマ検証

取得した JSON は表示前に検証され、結果が Meta カードの「データ検証」に表示されます。主なチェック内容は次のとおりです。

- `steps` が配列で 1 件以上あるか、`step_id` が重複していないか
- 件数・処理時間が数値で、負の値になっていないか
- `status` が `Healthy` / `Warning` / `Error` / `External` のいずれかか（本流ステップの `External` は警告）
- `records_out` が `records_in` を上回っていないか、処理時間が 1,000 ms を超えていないか
- 前段の `records_out` と次段の `records_in` が一致するか
- 本流の減少件数と `quarantine.records_in` が一致するか
- `errors[]` の参照先 `step_id` が実在するか、`count` が数値か
- `timestamp` / `pipeline` / `label` / `quarantine` などの必須項目が揃っているか

修復可能な問題（未知のステータス、欠損値など）は安全な値に置き換えたうえで警告として表示します。負の値・数値でない値・重複 ID・`steps` の欠落などはエラーとして表示します（数値は 0、欠けた `step_id` は連番で補完します）。

スナップショットの形式は次のとおりです（ステップと `errors[]` は 1 件のみの抜粋）。

```json
{
  "timestamp": "2026-10-27T09:15:02Z",
  "pipeline": "etl-main",
  "steps": [
    {
      "step_id": "Extract",
      "label": "Extract",
      "records_in": 1240,
      "records_out": 1240,
      "elapsed_ms": 46,
      "status": "Healthy",
      "message": ""
    }
  ],
  "quarantine": {
    "step_id": "error-handler",
    "label": "@error-handler",
    "records_in": 0,
    "records_out": 0,
    "elapsed_ms": 0,
    "status": "External",
    "message": ""
  },
  "errors": [
    {
      "at": "09:14:58",
      "step_id": "Extract",
      "kind": "schema",
      "message": "フィールド amount が数値ではありません",
      "count": 12
    }
  ]
}
```

### ステータス

| ステータス | 意味 | 表示色 |
|---|---|---|
| `Healthy` | 正常 | ミントグリーン |
| `Warning` | 遅延・欠損・隔離あり | アンバー |
| `Error` | 処理失敗 | レッド |
| `External` | 外部依存・別系統 | ブルー |

## フィールド定義

| フィールド | 型 | 説明 |
|---|---|---|
| `timestamp` | string | スナップショット生成時刻（ISO 8601） |
| `pipeline` | string | パイプライン識別子 |
| `steps[]` | array | 本流の処理ステップ（表示順） |
| `steps[].step_id` | string | 一意なステップ ID |
| `steps[].label` | string | 表示名 |
| `steps[].records_in` | number | 入力レコード数 |
| `steps[].records_out` | number | 出力レコード数 |
| `steps[].elapsed_ms` | number | 処理時間（ミリ秒） |
| `steps[].status` | string | `Healthy` / `Warning` / `Error`（`External` は隔離ノード用） |
| `steps[].message` | string | 補足メッセージ |
| `quarantine` | object | 隔離・エラーハンドラ系統のノード（`status` は常に `External`） |
| `errors[]` | array | エラーイベント（時刻、ステップ、種別、メッセージ、件数） |
| `errors[].at` | string | 発生時刻（`HH:MM:SS` 形式の表示用文字列） |
| `errors[].step_id` | string | 発生元ステップの `step_id` |
| `errors[].kind` | string | 種別（`schema` / `timeout` / `lookup` など任意の文字列） |
| `errors[].message` | string | エラー内容 |
| `errors[].count` | number | 該当件数 |

## リポジトリ構成

```text
goose-sandbox/
├── PipelineViz/                  # このプロジェクト
│   ├── index.html                # ランディングページ
│   ├── goose_language_guide.html # Goose 言語ガイド
│   ├── pipeline_viz_proposal.html # 実装提案資料
│   ├── assets/
│   │   └── brutalist-doc.css     # ドキュメント共通スタイル
│   ├── viewer/
│   │   ├── index.html            # ダッシュボード本体（HTML/CSS/JS）
│   │   ├── lib/
│   │   │   ├── data-source.js    # meta.yaml パーサー・検証・URL 解決
│   │   │   └── data-source.test.js # Node.js テスト
│   │   └── data/
│   │       ├── metrics.json      # ETL 本流の現在スナップショット
│   │       ├── metrics-prev.json # 同・Diff 用
│   │       ├── etl-reporting.json      # 日次レポートの現在スナップショット
│   │       └── etl-reporting-prev.json # 同・Diff 用
│   ├── .omm/
│   │   ├── config.yaml           # Perspective 一覧
│   │   └── data-pipeline/
│   │       ├── meta.yaml         # live_metrics_url / pipelines / status_map / prev_diagram
│   │       └── diagram.mmd       # Mermaid 定義サンプル
│   └── README.md                 # このファイル
├── .github/workflows/pages.yml   # GitHub Pages デプロイ
├── .nojekyll                     # ブランチ公開時の Jekyll 処理を無効化
├── LICENSE                       # MIT
└── README.md                     # Sandbox 全体の README
```

## Goose について

[Goose](https://github.com/aardappel/goose) は、Wouter van Oortmerssen によるシステムプログラミング言語です。**ヒープなし・GC なし・ライフタイム注釈なし**でメモリ安全性を実現し、データスタックによる一括解放と、ネストデータの完全インライン化を特徴とします。

Goose の公式サンプル（全 31 本）は、言語の設計思想を理解するための優れた教材です。Pipeline Viz の着想にも、次のサンプルが関係しています。

| サンプル | 内容 | 本プロジェクトとの関連 |
|---|---|---|
| [`18_json.goose`](https://github.com/aardappel/goose/blob/master/samples/18_json.goose) | JSON のパースとシリアライズ | 可変モード Enum、成長専用プール、4 バイト相対リンク、`return ... from` によるエラー伝播 |
| [`16_records.goose`](https://github.com/aardappel/goose/blob/master/samples/16_records.goose) | レコード型の集計処理 | 構造体配列のインライン配置と集計 |
| [`15_word_freq.goose`](https://github.com/aardappel/goose/blob/master/samples/15_word_freq.goose) | 単語頻度の集計 | ハッシュ構造とカウンタの扱い |
| [`23_mandelbrot_threads.goose`](https://github.com/aardappel/goose/blob/master/samples/23_mandelbrot_threads.goose) | ワーカースレッドによる並列計算 | 共有メモリなしのキュー通信 |
| [`25_serialize.goose`](https://github.com/aardappel/goose/blob/master/samples/25_serialize.goose) | 構造体のシリアライズ | 相対参照とファイル書き出し |
| [`26_file_tree.goose`](https://github.com/aardappel/goose/blob/master/samples/26_file_tree.goose) | ファイルツリーの構築 | 相対参照によるツリー表現 |

- 公式サイト: [https://aardappel.github.io/goose/](https://aardappel.github.io/goose/)
- サンプル一覧: [https://aardappel.github.io/goose/samples/index.html](https://aardappel.github.io/goose/samples/index.html)
- 言語ガイド: [goose_language_guide.html](goose_language_guide.html)

## oh-my-mermaid について

[oh-my-mermaid](https://github.com/oh-my-mermaid/oh-my-mermaid) は、コードベースから Mermaid ダイアグラムとメタ情報を生成・管理するフレームワークです。`.omm/` ディレクトリ配下に Perspective ごとの構成を置き、`@class-name` リンクで図と説明を相互参照します。

```sh
npm install -g oh-my-mermaid && omm setup
omm view
```

AI コーディングツール内で `/omm-scan` を実行すると、コードベースの解析と `.omm/` の生成が行われます。

本プロジェクトでは、oh-my-mermaid の Perspective 構造をダッシュボードのナビゲーションに写像し、`meta.yaml` に `live_metrics_url`、`poll_interval_ms`、`default_pipeline`、`pipelines`、`status_map` を追加する拡張を採用しています。oh-my-mermaid 本体へのパッチは含みません。

## GitHub Pages

`.github/workflows/pages.yml` が `main` ブランチへの push でリポジトリ全体を GitHub Pages にデプロイします。本プロジェクトは `PipelineViz/` 配下で公開されます。

初回のみ、リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に設定してください。以降は自動で公開されます（Actions タブから `workflow_dispatch` で手動実行も可能）。

- Sandbox ホーム: [https://watanabe3tipapa.github.io/goose-sandbox/](https://watanabe3tipapa.github.io/goose-sandbox/)
- PipelineViz: [https://watanabe3tipapa.github.io/goose-sandbox/PipelineViz/](https://watanabe3tipapa.github.io/goose-sandbox/PipelineViz/)
- ダッシュボード: [https://watanabe3tipapa.github.io/goose-sandbox/PipelineViz/viewer/](https://watanabe3tipapa.github.io/goose-sandbox/PipelineViz/viewer/)
- デプロイ対象: リポジトリルート（Actions デプロイ。`.nojekyll` も同梱）

## 現在の制限

- メトリクスはサンプルデータおよびクライアント側シミュレーションであり、Goose ランタイムとの実接続は未実装
- バックエンド、SSE、WebSocket は未実装（静的 JSON のポーリングとクライアント側シミュレーションのみ）
- スキーマ検証は構造と整合性の最小チェックであり、業務固有のルールは未実装
- ファイルポーリングはブラウザからの `fetch` に依存するため、`file://` では動作しない
- 障害注入は UI 確認用のクライアント側状態変更であり、実パイプラインには影響しない
- 複数パイプラインは切替表示のみで、同時監視は未対応
- oh-my-mermaid 本体への組み込みは未実施（データ構造と UI の試作段階）
- 認証・アクセス制御は未実装
- Perspective は 4 種類の固定ビュー。`.omm/config.yaml` の一覧と画面を対応付けており、各 Perspective の `.omm/` ディレクトリを読み込むわけではない
- パンくずのファイル名は `.omm/` 上の想定パスを示す表示であり、実際に読み込むファイルとは限らない

## コントリビューション

不具合報告や改善案は、GitHub の Issue または Pull Request で共有してください。UI、データ形式、ドキュメントのいずれも対象です。

1. リポジトリをフォーク
2. 機能ブランチを作成 (`git checkout -b feature/your-change`)
3. 変更をコミット (`git commit -m 'Add your change'`)
4. ブランチをプッシュし、Pull Request を作成

## 関連リンク

- [Goose 公式](https://aardappel.github.io/goose/)
- [Goose GitHub](https://github.com/aardappel/goose)
- [oh-my-mermaid GitHub](https://github.com/oh-my-mermaid/oh-my-mermaid)

## ライセンス

MIT ライセンス — 詳細は [LICENSE](../LICENSE) を参照してください。
