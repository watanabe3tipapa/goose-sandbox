# Pipeline Viz — Goose implementation (`goose` branch)

**Goose で ETL を実行し、ダッシュボードが読む `metrics.json` を生成する。**

このブランチは Goose 実装とメトリクス出力の検証専用です。ダッシュボード（`viewer/`）とランディングページ（`index.html`）は `main` ブランチで管理しており、このブランチには含まれません。GitHub Pages のデプロイも行いません。

- 公開用（`main`）: [PipelineViz](https://watanabe3tipapa.github.io/goose-sandbox/PipelineViz/) / [Dashboard](https://watanabe3tipapa.github.io/goose-sandbox/PipelineViz/viewer/)
- 開発用（このブランチ）: `PipelineViz/src/` の Goose プログラムと `scripts/` の検証スクリプト

---

## 現在の状態

| 項目 | 状態 | 備考 |
|---|---|---|
| Goose ETL（Extract → Transform → Load） | 実装済み | `PipelineViz/src/pipeline.goose` |
| `StepMetrics` / `PipelineSnapshot` | 実装済み | `PipelineViz/src/metrics.goose` |
| `metrics.json` の生成 | 検証済み | Goose v2026.4 / macOS arm64 で実行 |
| スキーマ検証 | 実装済み | `scripts/verify.sh`（Node.js） |
| ダッシュボードでの表示 | 反映済み | `main` の `viewer/data/goose-metrics.json` を REAL MODE で表示（静的スナップショット） |
| oh-my-mermaid CLI 連携 | 未実施 | CLI 未導入。`.omm/` は手書きで維持 |

「検証済み」は、このリポジトリのサンプル CSV に対して `scripts/build.sh` を実行し、`scripts/verify.sh` が成功したことを指します。Goose コンパイラはリポジトリに含めていません。

> このブランチは `viewer/` と `index.html` を持たないため、そのまま `main` にマージすると公開サイトが消えます。実装のマージではなく、生成した `metrics.json` を `main` の `viewer/data/` へ反映する運用にしています。

## 構成

```text
PipelineViz/
├── src/
│   ├── main.goose        # エントリーポイント（引数処理・ファイル入出力）
│   ├── pipeline.goose    # ETL と measure() ラッパー
│   ├── metrics.goose     # データ構造・時刻整形・JSON 出力
│   └── sample.csv        # 検証用の入力（正常 5 件 / 隔離 3 件）
├── .omm/                 # oh-my-mermaid の Perspective 定義（手書き）
├── assets/               # ドキュメント共通スタイル
├── goose_language_guide.html
├── pipeline_viz_proposal.html
└── README.md
scripts/
├── build.sh              # Goose を実行して metrics.json を生成し、検証する
└── verify.sh             # スナップショットのスキーマ検証
```

## 必要なもの

- [Goose](https://github.com/aardappel/goose/releases) v2026.4 以降（macOS arm64 で確認）
- Node.js 18 以降（`scripts/verify.sh` のみ）

Goose は `PATH` に置くか、`GOOSE` 環境変数で指定します。

```sh
export GOOSE=/path/to/goose
```

## ビルドと検証

```sh
# 既定: PipelineViz/out/metrics.json を生成して検証
scripts/build.sh

# 出力先と入力を指定
scripts/build.sh /tmp/metrics.json PipelineViz/src/sample.csv

# 生成済みファイルだけを検証
scripts/verify.sh PipelineViz/out/metrics.json
```

`build.sh` は次を実行します。

```sh
"$GOOSE" run PipelineViz/src/main.goose -- \
  --in PipelineViz/src/sample.csv \
  --out PipelineViz/out/metrics.json
scripts/verify.sh PipelineViz/out/metrics.json
```

`PipelineViz/out/` は `.gitignore` の対象です。生成物はコミットしません。

## ETL の内容

| ステップ | 処理 | 隔離条件 |
|---|---|---|
| Extract | CSV を読み、1 行を 1 レコードとして `Record` に変換 | — |
| Transform | 3 フィールド以上・`amount` が数値・負でないことを検証 | 形不足 / 非数値 / 負値 |
| Load | 合格レコードの `amount` を合計 | — |

各ステップは `measure()` で包み、`clock_ns()` の前後差を `elapsed_ms` として記録します。`measure()` のブロックは Goose のコンパイル時関数値なので、計測用の間接呼び出しは生成されません。

隔離されたレコードは `quarantine` ノードに件数を集約し、理由ごとに `errors[]` へ 1 件ずつ記録します。

## 出力スキーマ

`metrics.json` は `main` の `PipelineViz/viewer/lib/data-source.js` が検証する形式に合わせています。

```json
{
  "timestamp": "2026-11-26T01:01:39Z",
  "pipeline": "etl-main",
  "source": "goose",
  "steps": [
    {
      "step_id": "Extract",
      "label": "Extract",
      "records_in": 8,
      "records_out": 8,
      "elapsed_ms": 0.005,
      "status": "Healthy",
      "message": ""
    }
  ],
  "quarantine": {
    "step_id": "error-handler",
    "label": "@error-handler",
    "records_in": 3,
    "records_out": 0,
    "elapsed_ms": 0.0,
    "status": "External",
    "message": "schema validation"
  },
  "errors": [
    {
      "at": "01:01:39",
      "step_id": "Transform",
      "kind": "schema",
      "message": "amount is not a number",
      "count": 1
    }
  ]
}
```

`scripts/verify.sh` は次を確認します。

- `timestamp` が ISO 8601 UTC、`pipeline` が非空
- `source` が `goose` または `sample`（未指定はサンプル扱い）
- `steps[]` が 1 件以上、`step_id` が一意
- 件数が非負整数、`records_out <= records_in`
- `status` が `Healthy` / `Warning` / `Error` / `External`
- 前段の `records_out` と次段の `records_in` が一致
- `quarantine.status` が `External`、`records_in` が減少件数と一致
- `errors[].step_id` が実在するステップまたは隔離ノードを参照

## oh-my-mermaid について

`omm` CLI はこの環境に導入されておらず、`.omm/` をツールで再生成できるかは未確認です。上流の手順では `npm install -g oh-my-mermaid`、`omm setup`、`omm view` を使い、AI コーディングツール内の `/omm-scan` で `.omm/` を生成するとされていますが、このリポジトリでは実行していません。

現状は手書きの `config.yaml` と `data-pipeline/meta.yaml` を維持し、Goose 側は `metrics.json` の生成だけを担当します。`.omm/` の生成・更新をツールに任せるのは、CLI の入出力を実際に確認できてからにします。

`meta.yaml` の `live_metrics_url` は `main` の `viewer/data/metrics.json` を指しています。Goose 生成のスナップショットは `main` の `viewer/data/goose-metrics.json` に置き、`pipelines[]` の `goose-etl` から参照します。

## main への反映条件

生成物を `main` へ反映する前に、次を確認します。

- [x] `PipelineViz/src/` にコンパイル可能な Goose ファイルがある
- [x] `metrics.json` を Goose プログラムの実行で生成できる
- [x] 生成した `metrics.json` がダッシュボードのスキーマと一致する
- [x] ダッシュボードで「REAL MODE」として表示できる（`main` の `10744e9` で反映）
- [x] `main` の README 実装状態マトリクスを更新する

## ドキュメント

- [Goose プログラミング言語 詳細解説](goose_language_guide.html)
- [データ処理工程「見える化」ダッシュボード提案](pipeline_viz_proposal.html)
- [Goose 公式](https://aardappel.github.io/goose/)
- [Goose GitHub](https://github.com/aardappel/goose)

## ライセンス

MIT ライセンス — 詳細は [LICENSE](../LICENSE) を参照してください。
