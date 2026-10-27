# Process Sentinel

**デバイスの中で動くプロセスを、流れとして読む。**

Process Sentinel は、Mac 上のプロセスを**親子ツリー**として描き、署名・CPU・メモリ・ネットワーク接続・前回スナップショットとの差分を重ねて表示する静的ビューアです。Pipeline Viz の「構造（ダイアグラム）× 状態（メトリクス）」という発想を、データ処理パイプラインから**デバイス内部のプロセス群**へ移した試作です。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../LICENSE)
[![Version](https://img.shields.io/badge/version-v0.1.0-f59e0b.svg)](https://github.com/watanabe3tipapa/goose-sandbox)
[![Platform](https://img.shields.io/badge/platform-macOS-000000.svg)](https://www.apple.com/macos/)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-site-f59e0b.svg)](https://watanabe3tipapa.github.io/goose-sandbox/ProcessSentinel/)
[![GitHub issues](https://img.shields.io/github/issues/watanabe3tipapa/goose-sandbox.svg)](https://github.com/watanabe3tipapa/goose-sandbox/issues)

---

## 概要

プロセスは数百個単位で動いています。`ps` の一覧を上から読んでも、親子関係、署名の有無、外向き接続、前回からの変化は別々の場所に散らばります。Process Sentinel は、それらを**1 枚のツリーと 1 つのインスペクタ**に寄せ、怪しい候補から順に確認できる状態をつくります。

- ランディングページ: [https://watanabe3tipapa.github.io/goose-sandbox/ProcessSentinel/](https://watanabe3tipapa.github.io/goose-sandbox/ProcessSentinel/)
- ビューア（合成デモ）: [https://watanabe3tipapa.github.io/goose-sandbox/ProcessSentinel/viewer/](https://watanabe3tipapa.github.io/goose-sandbox/ProcessSentinel/viewer/)
- 実装提案資料: [process_sentinel_proposal.html](process_sentinel_proposal.html)

公開デモは**合成スナップショット**です。実データはローカルのコレクタで生成します。

## 何をするか

```text
ps + proc_pidpath + codesign + lsof
        │
        ▼
process_snapshot.json  ──►  ブラウザ
        │                     ├─ 状態分類（Error / Warning / Healthy / External）
process_baseline.json         ├─ 親子ツリー + アラート
        └────────────────────►└─ インスペクタ / 差分 / 履歴
```

1. **収集** — `ps` で PID・PPID・ユーザー・CPU・メモリ・RSS を取得し、libproc の `proc_pidpath` で実行パスを補完。`lsof` で TCP / UDP の接続先を紐づけます。
2. **正規化** — 実行パスごとに `codesign` を確認し、署名の有無・アドホック署名・Team ID を 1 つの JSON にまとめます。
3. **可視化** — 事実だけを持つ JSON をブラウザが読み、状態とスコアを計算してツリー・アラート・差分を描画します。

サーバーもデータベースもビルド手順もありません。GitHub Pages に静的ファイルとして置けます。

## デモの内容

`viewer/data/process_snapshot.json` は、実在の macOS プロセスを模した 29 プロセスの合成スナップショットです。

| 状態 | 件数 | 例 |
|---|---:|---|
| Error | 1 | `unknown_agent` — 未署名、`/private/tmp` から実行、外向き接続あり |
| Warning | 5 | `node` / `esbuild`（アドホック署名）、`backupd`（CPU 87%）、`com.apple.WebKit.WebContent`（CPU 62%）、`curl`（新規出現） |
| Healthy | 6 | Safari、Docker、Xcode、Terminal など |
| External | 17 | launchd、WindowServer、mds_stores などシステム領域 |

`process_baseline.json` との差分は **+1 new / ~3 changed / −1 removed**。`old_helper` が前回だけに存在する例です。

## クイックスタート

### 1. デモを見る

```sh
cd goose-sandbox
python3 -m http.server 8000
```

`http://localhost:8000/ProcessSentinel/viewer/` を開きます。`fetch` を使うため、`index.html` を直接開くのではなく HTTP 経由で読み込んでください。

### 2. 手元の Mac のスナップショットを取得する

```sh
python3 ProcessSentinel/tools/collect_processes.py
```

既定の出力先は `ProcessSentinel/viewer/data/process_snapshot.json` です。前回分をベースラインに残す場合は次を使います。

```sh
python3 ProcessSentinel/tools/collect_processes.py \
  --baseline ProcessSentinel/viewer/data/process_baseline.json \
  --watch 12 \
  --interval 2
```

`--watch 12` は 2 秒間隔で 12 回サンプリングし、CPU / メモリの履歴を各プロセスに付けます。処理には数十秒かかることがあります。

### 3. ビューアを再読込

LIVE モードは 8 秒ごとに JSON を再取得します。ファイルを差し替えれば、ページを開いたまま表示が更新されます。

## コレクタ

`tools/collect_processes.py` は macOS 標準のツールだけで動きます。Python 3 以外の依存はありません。

| オプション | 既定値 | 説明 |
|---|---|---|
| `--output PATH` | `viewer/data/process_snapshot.json` | スナップショットの出力先 |
| `--baseline PATH` | なし | 書き込み前に既存の出力をコピーしてベースラインにする |
| `--watch N` | `1` | サンプリング回数。2 以上で履歴が付く |
| `--interval SECONDS` | `2` | サンプリング間隔 |
| `--no-network` | 無効 | `lsof` を省略する |
| `--no-codesign` | 無効 | `codesign` を省略する（未確認扱いになる） |

実装上のポイント:

- `ps` の `comm` は切り詰められるため、実行パスは `libproc.proc_pidpath` から取得します。
- 署名確認は実行パス単位でキャッシュし、最大 8 並列で処理します。
- `codesign` が「not signed」を返した場合だけ `signed: false`。権限不足などで確認できない場合は `null`（未確認）にします。
- ネットワークは `lsof -nP -iTCP -iUDP` を 1 回だけ実行し、PID ごとにまとめます。
- 履歴は**実行パス**をキーに最大 60 点まで保持します。

## スナップショット JSON

```json
{
  "meta": {
    "generated_at": "2026-10-27T18:41:38+09:00",
    "host": "sentinel-mbp",
    "os": "macOS 15.7",
    "source": "demo snapshot (synthetic)",
    "interval_ms": 2000,
    "samples": 12
  },
  "processes": [
    {
      "pid": 31337,
      "ppid": 1,
      "name": "unknown_agent",
      "path": "/private/tmp/.cache/unknown_agent",
      "user": "watanabe3tipapa",
      "state": "S",
      "command": "/private/tmp/.cache/unknown_agent --daemon",
      "cpu": 44.8,
      "memory": 3.9,
      "rss": 312000,
      "signed": false,
      "adhoc": false,
      "teamId": null,
      "signature": null,
      "network": [
        {
          "proto": "TCP",
          "local": "192.168.1.24:52811",
          "remote": "45.77.12.9:8443",
          "state": "ESTABLISHED"
        }
      ],
      "history": [
        { "t": "18:41:16", "cpu": 30.6, "memory": 3.8 }
      ]
    }
  ]
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `pid` / `ppid` | integer | ✓ | 0 以上の整数。`pid` はスナップショット内で一意 |
| `name` / `path` / `user` / `state` / `command` | string | ✓ | 空文字は不可 |
| `cpu` / `memory` | number | ✓ | 0 以上のパーセント値 |
| `rss` | number | ✓ | KB 単位の常駐メモリ |
| `signed` | `true` / `false` / `null` | ✓ | `null` は「確認できない」 |
| `adhoc` | boolean | ✓ | アドホック署名か |
| `teamId` / `signature` | string / null | — | 表示用 |
| `network` | array | — | `proto` / `local` / `remote` / `state` |
| `history` | array | — | `t` / `cpu` / `memory` の点列 |

`viewer/lib/model.js` の `validateSnapshot()` が読み込み時に検証し、問題があればビューア上部に表示します。

## 状態分類

分類はブラウザ側の純粋関数 `classifyProcess()` で行います。JSON には判定結果を持たせません。判定順は次のとおりです。

| 状態 | 条件 | スコアへの加点 |
|---|---|---|
| **Error** | `signed: false`、または `/tmp`・`/private/tmp`・`/var/tmp`・`/Users/Shared` からの実行 | 未署名 +50 / 危険パス +30 |
| **Warning** | アドホック署名、CPU 40% 以上、メモリ 15% 以上、前回以降の新規出現、システム外で署名不明 | アドホック +20 / CPU 40%+ +12 / CPU 80%+ +20 / メモリ 15%+ +15 / 新規 +15 / 署名不明 +10 |
| **External** | `/System`、`/usr/libexec`、`/usr/sbin`、`/sbin` などのシステム領域、または `launchd` などの主要プロセス | スコアは 0 に固定 |
| **Healthy** | 上記に該当しない署名済みプロセス | — |

ネットワーク接続がある場合は +10（表示用の理由にも追加）。スコアは 0–100 に丸め、アラートは Error → Warning、スコア降順で並びます。

### ベースライン差分

実行パスをキーに前回と比較します。

- **new** — 前回に存在しない
- **changed** — 状態、CPU ±10pt、メモリ ±3pt、署名（signed / adhoc / teamId）、または実行パスのいずれかが変化
- **removed** — 前回だけに存在（ツリーには出さず、差分カードとインスペクタに表示）

## ビューアの機能

- **プロセスツリー** — 親から子へ左→右。子の数に応じて縦位置を自動計算
- **状態フィルタ** — All / Error / Warning / Healthy / External。一致したノードの祖先は「文脈」として薄く残す
- **検索** — 名前・パス・ユーザー・コマンド・Team ID・理由を横断。`/` でフォーカス
- **未署名のみ / 差分のみ** — 提案の最小原型にある「未署名を赤で強調する」操作をフィルタとして実装
- **アラートレール** — Error / Warning をスコア順に表示し、クリックでノードへ移動
- **インスペクタ** — 理由、PID / PPID / ユーザー / 状態 / CPU / メモリ / RSS、CPU・メモリのスパークライン、署名、接続先、コマンド
- **Diff** — 新規・変更・消滅の一覧。消滅プロセスもインスペクタで確認できる
- **LIVE** — 8 秒ごとに JSON を再取得。`PAUSED` で停止
- **URL 同期** — フィルタ・選択・データファイルをクエリに反映
- **レスポンシブ** — 360px 幅まで 1 カラムに整理。ツリーは横スクロール

### URL パラメータ

| パラメータ | 例 | 説明 |
|---|---|---|
| `pid` | `?pid=31337` | 選択する PID |
| `status` | `?status=error` | 状態フィルタ |
| `q` | `?q=webkit` | 検索語 |
| `unsigned` | `?unsigned=1` | 未署名のみ |
| `diff` | `?diff=1` | 差分のみ |
| `live` | `?live=0` | ポーリング停止 |
| `data` | `?data=local_snapshot.json` | 読み込むスナップショット（同一ディレクトリ内のファイル名のみ） |
| `baseline` | `?baseline=local_baseline.json` | 比較対象 |

`data` / `baseline` はディレクトリ traversal を避けるため、英数字で始まる `*.json` のファイル名だけを受け付けます。

## テスト

```sh
node --test ProcessSentinel/viewer/lib/model.test.js
```

検証、分類の優先順位、差分、祖先を含むフィルタ、ツリーレイアウト、URL の往復変換など 21 ケースを確認します。Node.js 18 以降を想定しています。

## 構成

```text
ProcessSentinel/
├── index.html                    # プロジェクト LP
├── README.md                     # このファイル
├── process_sentinel_proposal.html # 実装提案資料
├── tools/
│   └── collect_processes.py      # macOS コレクタ
└── viewer/
    ├── index.html                # ビューア
    ├── viewer.js                 # 描画・操作・ポーリング
    ├── lib/
    │   ├── model.js              # 分類・差分・レイアウト・URL
    │   └── model.test.js         # Node テスト
    └── data/
        ├── process_snapshot.json # 合成デモ
        └── process_baseline.json # 差分確認用
```

## 設計メモ

- **静的サイト + ローカルコレクタ** — 常駐エージェントや署名付きアプリを作らず、提案の最小原型（収集 → 正規化 → 表示 → 未署名フィルタ）を最短で動かすため。
- **事実と解釈の分離** — JSON は `ps` / `codesign` / `lsof` が観測した事実だけを持つ。状態・スコア・差分はビューア側で計算するので、分類ルールを変えてもデータを作り直さなくてよい。
- **外部をノイズにしない** — システム領域は `External` として残しつつスコア 0 に固定。全部を警告にすると肝心の候補が埋もれるため。
- **Diff のキーは実行パス** — PID は再起動で変わるため、同一バイナリの再出現を「新規」と誤認しないようにしています。

## 制約

- 収集は macOS のみ。iOS / iPadOS のプロセス取得は未実装です。
- イベントの常時監視ではなく、スナップショットベースの試作です。Endpoint Security API は使っていません。
- 公開デモのプロセス名・PID・接続先は合成値です。実在のマルウェアや感染端末のデータではありません。
- 署名の「未確認」は権限不足でも起こります。Error と Warning の区別は補助線であり、最終判断を自動化するものではありません。
- 大量のプロセス（600 前後）では初回描画に少し時間がかかります。検索・状態フィルタで絞ると扱いやすくなります。

## ライセンス

MIT ライセンス — 詳細は [../LICENSE](../LICENSE) を参照してください。
