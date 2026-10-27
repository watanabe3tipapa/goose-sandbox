# Pipeline Viz

**データ処理工程を、生きた設計図に。**

Pipeline Viz は、**Goose によるデータ処理工程の「見える化」**を主題に、実行時メトリクスと **oh-my-mermaid** の Perspective 構造を接合し、データ処理パイプラインの「流れ」と「健康状態」を一枚のダッシュボードで可視化する試作プロジェクトです。静的なアーキテクチャ図を、実行状態を反映するライブ・ビューに変えることを目指しています。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-v0.1.0-blue.svg)](https://github.com/watanabe3tipapa/goose-sandbox)
[![Goose](https://img.shields.io/badge/Goose-language-00e5a8.svg)](https://aardappel.github.io/goose/)
[![oh-my-mermaid](https://img.shields.io/badge/oh--my--mermaid-Perspective-00e5a8.svg)](https://github.com/oh-my-mermaid/oh-my-mermaid)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-site-00e5a8.svg)](https://watanabe3tipapa.github.io/goose-sandbox/)
[![GitHub issues](https://img.shields.io/github/issues/watanabe3tipapa/goose-sandbox.svg)](https://github.com/watanabe3tipapa/goose-sandbox/issues)

---

## 概要

パイプラインは、ステップが増えるほど「いま何が起きているか」を把握するコストが急増します。ログを追い、メトリクスを別画面で確認し、構成図と突き合わせる——この分断を減らすために、Pipeline Viz は **構造（ダイアグラム）と状態（メトリクス）を同じ枠組みで扱います**。

本リポジトリは、Goose と oh-my-mermaid を組み合わせたダッシュボードの **静的プロトタイプ** です。バックエンドを持たず、ブラウザだけで動作します。サンプルの `metrics.json` を差し替えることで、任意のパイプライン状態を表示できます。

- ランディングページ: [https://watanabe3tipapa.github.io/goose-sandbox/](https://watanabe3tipapa.github.io/goose-sandbox/)
- ダッシュボード: [https://watanabe3tipapa.github.io/goose-sandbox/viewer/](https://watanabe3tipapa.github.io/goose-sandbox/viewer/)

## コンセプト（なぜ「見える化」か）

データ処理の健全性は、単一の数値ではなく **構造と状態の関係** で決まります。Pipeline Viz は、oh-my-mermaid の Perspective ごとに次の視点を整理します。

| Perspective | 確認する内容 | ダッシュボードでの表示 |
|---|---|---|
| `data-pipeline` | ETL 本流の入出力、処理時間、隔離レコード | ステップノード、接続ラベル、ライブ指標 |
| `overall-architecture` | 収集・蓄積・可視化・ナビゲーションの層構成 | アーキテクチャ表とコンポーネント相関 |
| `error-handler` | スキーマ検証エラー、隔離、再処理の流れ | エラー一覧、発生元ステップ、件数 |
| `performance-metrics` | スループット、レイテンシ、隔離レコード数の推移 | 時系列チャート、ステップ別バー、履歴表 |

## 主な特徴

- **静的サイトだけで動作** — サーバーサイド処理なし。GitHub Pages にそのまま公開可能
- **4 つの Perspective ナビゲーション** — `.omm/` の構造をそのまま画面遷移に対応
- **ライブ更新シミュレーション** — 2.5 秒ごとにメトリクスを更新（クライアント側）
- **Diff モード** — 前回スナップショットとの差分をノードと指標にハイライト
- **アラート連携** — Warning / Error のステップをサイドバーに自動表示
- **ドリルダウン** — ノード選択で処理時間、入出力、メッセージをインスペクタに表示
- **障害注入** — ボタン一つで Transform を Error 状態にし、UI の挙動を確認
- **Mermaid ソース生成** — 現在の状態を `classDef` 付きの Mermaid 定義として表示
- **URL パラメータ** — `?persp=...&diff=1&live=0` で表示状態を再現
- **レスポンシブ / 印刷対応** — モバイル幅と印刷用スタイルを用意
- **ブルータリズム調の UI** — 白背景、黒枠、アクセントカラー `#00e5a8`

## デモ

### ダッシュボード

`viewer/` を開くと、サンプルスナップショットが読み込まれます。サイドバーで Perspective を切り替え、ノードをクリックすると詳細が表示されます。

```text
https://watanabe3tipapa.github.io/goose-sandbox/viewer/
```

表示状態を URL で固定できます。

```text
?persp=performance-metrics     # 時系列指標を開く
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

- ランディングページ: `http://localhost:8000/`
- ダッシュボード: `http://localhost:8000/viewer/`

サーバーなしで `viewer/index.html` を直接開いた場合も、埋め込みサンプルで動作します。

### 自分のデータに差し替える

`viewer/data/metrics.json` と `viewer/data/metrics-prev.json` を編集します。`fetch` に失敗した場合は `viewer/index.html` 内の `FALLBACK_SNAPSHOT` が使われます。

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
  "errors": []
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
| `steps[].status` | string | `Healthy` / `Warning` / `Error` |
| `steps[].message` | string | 補足メッセージ |
| `quarantine` | object | 隔離・エラーハンドラ系統のノード |
| `errors[]` | array | エラーイベント（時刻、ステップ、種別、件数） |

## リポジトリ構成

```text
.
├── index.html                    # ランディングページ
├── goose_language_guide.html     # Goose 言語ガイド
├── pipeline_viz_proposal.html    # 実装提案資料
├── assets/
│   └── brutalist-doc.css         # ドキュメント共通スタイル
├── viewer/
│   ├── index.html                # ダッシュボード本体（HTML/CSS/JS）
│   └── data/
│       ├── metrics.json          # 現在のスナップショット
│       └── metrics-prev.json     # Diff 用の前回スナップショット
├── .omm/
│   ├── config.yaml               # Perspective 一覧
│   └── data-pipeline/
│       ├── meta.yaml             # live_metrics_url / status_map
│       └── diagram.mmd           # Mermaid 定義サンプル
├── .github/
│   └── workflows/
│       └── pages.yml             # GitHub Pages デプロイ
├── .nojekyll                     # ブランチ公開時の Jekyll 処理を無効化
├── LICENSE                       # MIT
└── README.md                     # このファイル
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

本プロジェクトでは、oh-my-mermaid の Perspective 構造をダッシュボードのナビゲーションに写像し、`meta.yaml` に `live_metrics_url` と `status_map` を追加する拡張案を採用しています。oh-my-mermaid 本体へのパッチは含みません。

## GitHub Pages

`.github/workflows/pages.yml` が `main` ブランチへの push でリポジトリ全体を GitHub Pages にデプロイします。

初回のみ、リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に設定してください。以降は自動で公開されます（Actions タブから `workflow_dispatch` で手動実行も可能）。

- 公開 URL: [https://watanabe3tipapa.github.io/goose-sandbox/](https://watanabe3tipapa.github.io/goose-sandbox/)
- デプロイ対象: リポジトリルート（Actions デプロイ。`.nojekyll` も同梱）

## 現在の制限

- メトリクスはサンプルデータおよびクライアント側シミュレーションであり、Goose ランタイムとの実接続は未実装
- バックエンド、SSE、WebSocket は未実装（静的 JSON のポーリングのみ）
- 障害注入は UI 確認用のクライアント側状態変更であり、実パイプラインには影響しない
- oh-my-mermaid 本体への組み込みは未実施（データ構造と UI の試作段階）
- 認証・アクセス制御は未実装
- Perspective は 4 種類の固定構成

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

MIT ライセンス — 詳細は [LICENSE](LICENSE) を参照してください。
