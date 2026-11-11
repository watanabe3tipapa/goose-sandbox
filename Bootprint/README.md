# Bootprint

**起動と常駐を、読める地図へ。**

Bootprint は、macOS の **launchd ジョブ**を 4 つのレーンに並べ、トリガー・署名・前回スナップショットとの差分・24 時間スケジュールを 1 枚で読む静的ビューアです。Process Sentinel が「今動いているプロセス」を見るのに対して、Bootprint は「これから動くもの」を見ます。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../LICENSE)
[![Version](https://img.shields.io/badge/version-v0.1.0-38bdf8.svg)](https://github.com/watanabe3tipapa/goose-sandbox)
[![Platform](https://img.shields.io/badge/platform-macOS-000000.svg)](https://www.apple.com/macos/)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-site-38bdf8.svg)](https://watanabe3tipapa.github.io/goose-sandbox/Bootprint/)
[![GitHub issues](https://img.shields.io/github/issues/watanabe3tipapa/goose-sandbox.svg)](https://github.com/watanabe3tipapa/goose-sandbox/issues)

---

## 概要

起動時の常駐は `LaunchDaemons` / `LaunchAgents` に分かれ、system / GUI / user のドメインで動きます。ラベルだけの一覧では、**どこに置かれ、何をきっかけに動き、誰が署名したのか**が別々の場所に散らばります。

Bootprint は macOS 標準の `plutil` / `launchctl` / `codesign` で事実を集め、JSON に正規化します。ブラウザはその JSON を読み、4 つの配置レーン・ベンダー・状態・スコア・差分を描画します。

- ランディングページ: [https://watanabe3tipapa.github.io/goose-sandbox/Bootprint/](https://watanabe3tipapa.github.io/goose-sandbox/Bootprint/)
- ビューア（合成デモ）: [https://watanabe3tipapa.github.io/goose-sandbox/Bootprint/viewer/](https://watanabe3tipapa.github.io/goose-sandbox/Bootprint/viewer/)
- 提案資料: [bootprint_proposal.html](bootprint_proposal.html)

公開デモは **40 件の合成ジョブ**です。実データはローカルのコレクタで生成します。読み取り専用で、ジョブの load / unload / enable / disable / 削除は行いません。

## 何をするか

```text
plutil + launchctl print + codesign
        │
        ▼
jobs_snapshot.json  ──►  ブラウザ
        │                  ├─ 4 レーン × ベンダーの永続化マップ
jobs_baseline.json         ├─ 状態分類（Error / Warning / Healthy / External）
        └─────────────────►├─ アラート / 差分 / インスペクタ
                           └─ 24 時間スケジュール
```

1. **収集** — 5 つの plist ディレクトリ（`/System/Library/LaunchDaemons`、`/System/Library/LaunchAgents`、`/Library/LaunchDaemons`、`/Library/LaunchAgents`、`~/Library/LaunchAgents`）を走査。`plutil` で plist を解析し、`launchctl print` で loaded / PID / 終了コード / disabled を突き合わせます。
2. **正規化** — `RunAtLoad` / `KeepAlive` / `StartInterval` / `StartCalendarInterval` / `WatchPaths` / `Sockets` を 1 つの `triggers` にまとめます。第三者バイナリは `codesign -dv` で署名・アドホック署名・Team ID を確認します。環境変数は保存せず、トークン様の引数はマスクします。
3. **可視化** — 事実だけを持つ JSON をブラウザが読み、状態とスコアを計算。レーン・ベンダー・差分・インスペクタ・24h リボンを描画します。状態は URL に載ります。

サーバーもデータベースもビルド手順もありません。GitHub Pages に静的ファイルとして置けます。

## デモの内容

`viewer/data/jobs_snapshot.json` は、実在の macOS ジョブを模した 40 ジョブの合成スナップショットです。

| 状態 | 件数 | 例 |
|---|---:|---|
| Error | 3 | `com.example.helper`（未署名 + 書き込み可能領域 + KeepAlive）、`com.example.meeting-recorder`（新規 + 未署名）、`net.shady.persist`（`/Users/Shared` から実行） |
| Warning | 6 | `homebrew.mxcl.ollama`（アドホック署名 + RunAtLoad + 差分）、`com.example.sync`（間隔の変更）、`com.example.telemetry`（アドホック署名 + 書き込み可能領域）、`com.nightly.build.agent`（30 秒間隔） |
| Healthy | 11 | Docker、Tailscale、Google Keystone、GitHub など署名済みの第三者ジョブ |
| External | 20 | `com.apple.*` とシステム領域のデーモン / エージェント |

`jobs_baseline.json`（前日・39 ジョブ）との差分は **+2 new / ~3 changed / −1 removed** です。`com.example.legacy` が前回だけに存在する例です。

## クイックスタート

### 1. デモを見る

```sh
cd goose-sandbox
python3 -m http.server 8000
```

- Sandbox ホーム: `http://localhost:8000/`
- Bootprint LP: `http://localhost:8000/Bootprint/`
- ビューア: `http://localhost:8000/Bootprint/viewer/`

`file://` では `fetch` が拒否されるため、必ず静的サーバー経由で開いてください。

### 2. 実データを取る

```sh
# 既定の出力: Bootprint/viewer/data/jobs_snapshot.json
python3 Bootprint/tools/collect_launch_jobs.py

# 前回のスナップショットを baseline に残してから上書き
python3 Bootprint/tools/collect_launch_jobs.py \
  --baseline Bootprint/viewer/data/jobs_baseline.json

# 署名確認を省略（速い。signed は null になる）
python3 Bootprint/tools/collect_launch_jobs.py --no-codesign
```

`--baseline PATH` は **新しいスナップショットを書き込む前に、既存の出力を PATH へコピー**します。初回はコピー元がないため baseline は作られません。

### 3. ビューアで開く

```text
http://localhost:8000/Bootprint/viewer/
```

別のファイルを使う場合は `?data=` / `?baseline=` を指定します。ファイル名は `[A-Za-z0-9][A-Za-z0-9._-]*.json` に限定されます。

```text
...viewer/?data=jobs_snapshot.json&baseline=jobs_baseline.json
```

## ビューアの操作

| 操作 | 内容 |
|---|---|
| レーン見出しをクリック | そのレーンだけに絞り込み。もう一度押すと解除 |
| ベンダー見出しをクリック | ベンダー単位で折りたたみ / 展開 |
| `Apple を展開` | 初期状態で折りたたんでいる Apple ジョブをすべて展開 |
| 状態 / トリガーのセグメント | Error / Warning / Healthy / External、起動時 / 常駐 / 定刻 / 間隔 / 監視で絞り込み |
| `未署名` / `差分` | 未署名ジョブ、前回から変化したジョブだけを表示 |
| 検索欄 | label / program / Team ID / 理由を横断検索（`/` でフォーカス） |
| アラート行 | 該当カードへ移動し、インスペクタで理由を確認 |
| 差分の行 | 新規・変更・削除されたジョブを選択 |
| 24h リボンの行 | 該当ジョブを選択 |
| `Esc` | 選択を解除 |
| `r` | スナップショットを再読込 |

`LIVE` は 30 秒ごとに JSON を再取得します（静的デモでは表示時刻が更新されるだけです）。

### URL パラメータ

| パラメータ | 値 | 内容 |
|---|---|---|
| `job` | `domain:label` | 選択中のジョブ（削除済みジョブも可） |
| `status` | `error` / `warning` / `healthy` / `external` | 状態フィルタ |
| `q` | 任意の文字列 | 検索語 |
| `unsigned` | `1` | 未署名のみ |
| `diff` | `1` | 前回から変化したジョブのみ |
| `apple` | `1` | Apple ジョブを展開 |
| `lane` | `system` / `global` / `gui` / `user` | レーンフィルタ |
| `trigger` | `boot` / `keepalive` / `calendar` / `interval` / `watch` | トリガーフィルタ |
| `live` | `0` | 自動再取得を停止 |
| `data` | ファイル名 | スナップショット JSON |
| `baseline` | ファイル名 | ベースライン JSON |

## データモデル

スナップショットは `meta` と `jobs` だけを持つ JSON です。

```json
{
  "meta": {
    "generated_at": "2026-11-09T09:00:00+09:00",
    "host": "sentinel-mbp",
    "os": "macOS 15.7",
    "uid": 502,
    "source": "launchctl"
  },
  "jobs": [
    {
      "label": "com.example.helper",
      "domain": "gui/502",
      "lane": "gui",
      "scope": "agent",
      "plist": "~/Library/LaunchAgents/com.example.helper.plist",
      "program": "~/Library/Application Support/Helper/helper",
      "args": ["--daemon"],
      "program_exists": true,
      "triggers": {
        "run_at_load": true,
        "keep_alive": true,
        "start_interval": null,
        "start_calendar": [],
        "watch_paths": [],
        "sockets": 0
      },
      "disabled": false,
      "loaded": true,
      "pid": null,
      "last_exit_status": 1,
      "signed": false,
      "adhoc": false,
      "team_id": null
    }
  ]
}
```

- `domain` は launchd のドメイン（`system` / `gui/UID` / `user/UID`）、`lane` は plist の配置場所（`system` / `global` / `gui` / `user`）です。同じ label でも配置が違えば別ジョブとして扱います。
- 差分のキーは PID ではなく **`domain:label`**。再起動で PID が変わっても同一ジョブとして比較できます。
- `signed` は `true` / `false` / `null`（未確認）。`codesign` の権限や実行ファイルの有無で `null` になります。
- 保存するのは事実だけです。状態・スコア・ベンダー・レーン内の並びはブラウザ側で計算します。

## 状態分類

| 状態 | 主な条件 | 表示 |
|---|---|---|
| **Error** | 実行ファイルなし / 一時領域・共有領域から実行 / 未署名かつ書き込み可能領域 | 赤。スコア最大 100。アラート最上位 |
| **Warning** | 未署名 / アドホック署名 / 署名不明 / 60 秒未満の間隔実行 / 新規出現 / 定義変更 | 琥珀。理由を列挙 |
| **Healthy** | 上記に該当しない第三者ジョブ | ミント。静かに残る |
| **External** | `com.apple.*` またはシステム領域の実行パス | 青灰。スコア 0 でノイズを抑制 |

スコアは「危険度の断定」ではなく、**見る順番**を決めるためのシグナルです。判定は `viewer/lib/model.js` の純粋関数で行い、Node のテストで固定しています。

## 構成

```text
Bootprint/
├── index.html                  # プロジェクト LP
├── bootprint_proposal.html     # コンセプトと設計の提案資料
├── README.md
├── tools/
│   └── collect_launch_jobs.py  # macOS コレクタ（読み取り専用）
└── viewer/
    ├── index.html              # 永続化マップ / インスペクタ / 24h リボン
    ├── viewer.js               # 描画・フィルタ・URL 同期
    ├── lib/
    │   ├── model.js            # 検証・分類・差分・集計（依存なし）
    │   └── model.test.js       # Node テスト
    └── data/
        ├── jobs_snapshot.json  # 合成デモ（40 ジョブ）
        └── jobs_baseline.json  # 前日（39 ジョブ）
```

## テスト

```sh
node --test Bootprint/viewer/lib/model.test.js
```

34 件のテストで、スナップショット検証、状態分類、`domain:label` 差分、レーン / ベンダー grouping、トリガー解析、24h スケジュール展開、URL の round-trip、不正なデータファイル名の拒否、同梱デモの件数を確認します。

## 制約と今後

- **launchd に集中** — ログイン項目 / BTM / System Extensions は v1 の対象外です。
- **検知エンジンではない** — マルウェア判定・自動削除・イベントの常時監視はしません。
- **macOS のみ** — `launchctl` / `plutil` / `codesign` に依存します。権限のないジョブは loaded や署名が欠けることがあります。
- **デモは合成データ** — ホスト名・PID・パス・Team ID は実在の macOS を模した合成値です。
- **将来** — ログイン項目 / BTM、起動シミュレーション、`--watch` による履歴、通知は Phase 4 以降の拡張候補です。

## ライセンス

MIT ライセンス — 詳細は [LICENSE](../LICENSE) を参照してください。
