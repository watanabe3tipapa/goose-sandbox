# Mobile Safety Kit

**スマホの状態を、ブラウザだけで診断する。**

Mobile Safety Kit は、OS・通信・権限・追跡防止を**ブラウザ標準 API だけで観測**し、Device → Network → Privacy → Risk Judge のパイプラインとして表示する静的ダッシュボードです。Pipeline Viz の「構造（ダイアグラム）× 状態（メトリクス）」という発想を、データパイプラインから**スマートフォンのセキュリティ状態**へ移した試作です。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../LICENSE)
[![Version](https://img.shields.io/badge/version-v0.1.0-38bdf8.svg)](https://github.com/watanabe3tipapa/goose-sandbox)
[![Platform](https://img.shields.io/badge/platform-web%20%2F%20mobile-38bdf8.svg)](https://watanabe3tipapa.github.io/goose-sandbox/MobileSafetyKit/)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-site-38bdf8.svg)](https://watanabe3tipapa.github.io/goose-sandbox/MobileSafetyKit/)
[![GitHub issues](https://img.shields.io/github/issues/watanabe3tipapa/goose-sandbox.svg)](https://github.com/watanabe3tipapa/goose-sandbox/issues)

---

## 概要

スマートフォンは個人情報の集積地ですが、利用者自身が「どこまで安全か」を把握する手段は限られています。Mobile Safety Kit は、アプリのインストールを求めず、ブラウザが公開している事実だけを集めて、数秒でリスクの見取り図をつくります。

- ランディングページ: [https://watanabe3tipapa.github.io/goose-sandbox/MobileSafetyKit/](https://watanabe3tipapa.github.io/goose-sandbox/MobileSafetyKit/)
- ダッシュボード: [https://watanabe3tipapa.github.io/goose-sandbox/MobileSafetyKit/viewer/](https://watanabe3tipapa.github.io/goose-sandbox/MobileSafetyKit/viewer/)
- デモ表示: [https://watanabe3tipapa.github.io/goose-sandbox/MobileSafetyKit/viewer/?demo=1](https://watanabe3tipapa.github.io/goose-sandbox/MobileSafetyKit/viewer/?demo=1)

公開デモは**合成データ**です。実スキャンは、開いたブラウザの情報だけを使います。

## 何をするか

```text
User-Agent / Client Hints / Permissions / Network Information / Document
        │
        ▼
ブラウザ内で観測（外部送信なし）
        │
        ├─ 8 checks ──► 重み付きスコア
        │                 │
        │                 └─ 総合レベル = 最弱のチェック
        ▼
Device Scan → Security Check → Privacy Check → Risk Judge
        │
        ├─ アラート / 対処法 / 観測値
        └─ JSON レポート / 前回比較（localStorage）
```

1. **観測** — `navigator.userAgentData`、`navigator.permissions`、`navigator.connection`、`location`、`document.referrerPolicy` などから事実を集めます。
2. **判定** — 8 つのチェックを重み付き平均し、総合レベルは最も重い状態に合わせます。観測できない項目は `Unknown` としてスコアから除外します。
3. **可視化** — パイプラインの色・スコア・アラート・対処法を 1 画面にまとめます。結果は JSON で保存できます。

サーバーもデータベースもビルド手順もありません。GitHub Pages に静的ファイルとして置けます。

## 診断項目

| グループ | チェック | 重み | 観測するもの | 主なデータ源 |
|---|---|---:|---|---|
| 端末・OS | OS バージョン | 3 | OS 名とメジャーバージョン | UA / Client Hints |
| 端末・OS | ブラウザ更新 | 2 | ブラウザ名とバージョン | User-Agent |
| 端末・OS | 画面ロック | 1 | 観測不能（手動確認） | — |
| 接続・通信 | HTTPS 通信 | 3 | `https:` かどうか | `location.protocol` |
| 接続・通信 | 回線品質 | 1 | `effectiveType` / `saveData` | Network Information API |
| プライバシー | 権限の許可状態 | 3 | 位置情報・カメラ・マイク | Permissions API |
| プライバシー | トラッキング防止 | 1 | DNT / GPC | `navigator.doNotTrack` など |
| プライバシー | Referrer-Policy | 1 | 遷移先へ渡す URL 情報 | `document.referrerPolicy` |

重みは「見る順番」の目安です。画面ロックは Web から観測できないため `Unknown` のチェックとして残し、公衆 Wi-Fi は判定ではなくガイドとして扱います。

## スコアと状態

### スコア

- 各チェックは 0–100 のスコアを持ちます。
- 総合スコアは、**スコアを持つチェックの重み付き平均**です。
- `Unknown` のチェックはスコアを持たず、平均から除外されます。
- 総合レベルは、**Error → Warning → Healthy の順で最も重い状態**に合わせます。弱点を平均で薄めないための設計です。

### 状態

| 状態 | 条件の例 | 表示 |
|---|---|---|
| **Healthy** | OS / ブラウザが更新目安を満たす、HTTPS、主要な権限が未許可 | ミント色 |
| **Warning** | OS / ブラウザの更新推奨、位置情報・カメラ・マイクの許可、低速回線 | 琥珀色 |
| **Error** | HTTP 通信、サポートが古い OS / ブラウザ、`unsafe-url` の Referrer-Policy | 赤色 |
| **Unknown** | 画面ロック、UA が固定された macOS、Permissions API 非対応 など | 灰色・スコア除外 |

`Unknown` は「安全」でも「危険」でもありません。観測できないものを Healthy に丸めないための状態です。

### サポート表

OS / ブラウザの更新目安は、`viewer/lib/scanner.js` の `OS_SUPPORT` / `BROWSER_SUPPORT` にあります。**2026-10 時点の静的なスナップショット**で、自動更新はされません。実運用では定期的に更新してください。

```js
const OS_SUPPORT = {
  ios:     { label: "iOS",     healthy: 18, warn: 16 },
  android: { label: "Android", healthy: 14, warn: 12 },
  macos:   { label: "macOS",   healthy: 14, warn: 13 },
};
```

Windows は UA の `Windows NT 10.0` が 10 と 11 の両方を指すため、自動判定では `Unknown` にしています。

## クイックスタート

### 1. ダッシュボードを開く

```sh
cd goose-sandbox
python3 -m http.server 8000
```

`http://localhost:8000/MobileSafetyKit/viewer/` を開きます。`fetch` を使わないため、`viewer/index.html` を直接開いても動作します（localStorage の可否はブラウザ設定に依存します）。

### 2. デモを表示する

```text
http://localhost:8000/MobileSafetyKit/viewer/?demo=1
```

iPhone / iOS 16 / Safari 16.6 / 3g 回線を模した合成データで、Warning と Unknown の表示を確認できます。

### 3. 判定ロジックをテストする

```sh
node --test MobileSafetyKit/viewer/lib/scanner.test.js
```

Node.js 18 以降を想定しています。

### 4. デモレポートを再生成する

```sh
node MobileSafetyKit/tools/build-demo-report.js
```

`viewer/data/demo-report.json` を `DEMO_FACTS` から再生成します。`?demo=1` はこのファイルを読み込まず、同じ `DEMO_FACTS` をメモリ上で評価します。JSON は `.omm/` や外部ツールとの連携用です。

## ビューアの機能

- **パイプライン** — Device → Network → Privacy → Risk Judge。チェックの状態を色・スコア・差分で表示
- **スコアボード** — Safety Score、4 状態の件数、端末・ブラウザ・画面・接続・時刻
- **状態フィルタ** — All / Error / Warning / Healthy / Unknown。一致しないチェックは薄く残す
- **アラートレール** — Error / Warning をスコア順に一覧。クリックで該当チェックへ移動
- **インスペクタ** — 観測値、データ源、理由、対処法、重み、前回との差分
- **前回比較** — 「基準を更新」で現在の結果を localStorage に保存。設定を変えて再スキャンすると増減が見える
- **JSON エクスポート** — レポートをそのままダウンロード
- **URL 同期** — デモ・フィルタ・選択中のチェックをクエリに反映
- **レスポンシブ** — 360px 幅でも崩れないよう、狭い画面では 1 カラムに整理

### URL パラメータ

| パラメータ | 例 | 説明 |
|---|---|---|
| `demo` | `?demo=1` | 合成データで表示 |
| `status` | `?status=warning` | 状態フィルタ |
| `check` | `?check=permissions` | 選択するチェック |

前回比較の基準は URL ではなく localStorage（`msk:baseline:v1` / デモ用 `msk:baseline:demo:v1`）に保存します。

## レポート JSON

```json
{
  "schema": "mobile-safety-kit/report@1",
  "generated_at": "2026-10-28T12:00:00+09:00",
  "demo": true,
  "support_as_of": "2026-10",
  "score": 67,
  "level": "warning",
  "counts": { "error": 0, "warning": 4, "healthy": 2, "unknown": 2 },
  "checks": [
    {
      "id": "os_version",
      "group": "device",
      "label": "OS バージョン",
      "hint": "UA / Client Hints",
      "weight": 3,
      "status": "warning",
      "score": 60,
      "message": "iOS 16 は更新を推奨します",
      "advice": "目安は iOS 18 以降です。設定 > 一般 > ソフトウェアアップデート を確認してください。",
      "detail": "iOS 16"
    }
  ],
  "groups": [
    { "id": "device", "no": "01", "label": "Device Scan", "sub": "端末・OS", "score": 60 }
  ],
  "alerts": [],
  "facts": {
    "host": "watanabe3tipapa.github.io",
    "protocol": "https:",
    "os": "iOS 16",
    "browser": "Safari 16.6",
    "screen": "390×844 @3x"
  }
}
```

| フィールド | 説明 |
|---|---|
| `schema` | レポート形式の識別子 |
| `score` / `level` | 重み付きスコアと総合レベル。判定不能なら `null` / `unknown` |
| `counts` | 4 状態の件数 |
| `checks` | 8 チェックの判定結果。`score` は `Unknown` のとき `null` |
| `groups` | Device / Network / Privacy のグループとグループ内スコア |
| `alerts` | Error / Warning をスコア順に並べたもの |
| `facts` | 表示用に要約した観測事実（UA を含む） |

レポートは端末内で生成され、自動送信はしません。JSON エクスポートだけが外部への持ち出し経路です。

## テスト

```sh
node --test MobileSafetyKit/viewer/lib/scanner.test.js
```

18 ケースで、ブラウザ / OS 判定、HTTPS・回線・権限・追跡防止・Referrer-Policy の判定、重み付きスコア、最弱レベル、Unknown の除外、前回差分、`collectFacts()` のマッピングを確認します。

## 構成

```text
MobileSafetyKit/
├── index.html                    # プロジェクト LP
├── README.md                     # このファイル
├── .omm/
│   └── mobile-safety/
│       ├── description.md
│       ├── diagram.mmd           # デモレポートの Mermaid 表現
│       └── meta.yaml             # 状態色とレポートの置き場所
├── tools/
│   └── build-demo-report.js      # demo-report.json の生成
└── viewer/
    ├── index.html                # ダッシュボード
    ├── viewer.js                 # 観測・描画・操作
    ├── lib/
    │   ├── scanner.js            # 判定・スコア・差分・事実収集
    │   └── scanner.test.js       # Node テスト
    └── data/
        └── demo-report.json      # 合成レポート（生成物）
```

## 設計メモ

- **事実と解釈の分離** — `collectFacts()` は観測だけを行い、`buildReport()` が判定します。判定ルールを変えても観測コードを触らずに済みます。
- **Unknown を残す** — 観測できない項目を Healthy に丸めると、根拠のない安心感を与えます。画面ロックや固定 UA は `Unknown` として残し、対処法を添えます。
- **最弱項目でレベルを決める** — セキュリティは平均点ではなく弱点で決まります。スコアは全体の目安、レベルは「最初に見るべき場所」を示すシグナルです。
- **ネットワークに出ない** — `fetch` / `XMLHttpRequest` を使いません。診断結果は DOM と localStorage の外へ出ません。
- **静的なサポート表** — OS / ブラウザの EOL を外部 API に問い合わせると、診断のたびに通信が発生します。あえて静的な表にし、更新を明示的な作業にしています。

## 制約

- 観測できるのは**ブラウザから見える範囲**だけです。端末内のファイル、他アプリ、OS の設定そのものには触れません。
- ウイルススキャンやマルウェア検知ではありません。設定と露出の点検を行うプロトタイプです。
- 画面ロック、公衆 Wi-Fi の安全性、第三者の Cookie 可否などは Web から判定できません。ガイドまたは `Unknown` として扱います。
- `Permissions API` の対応状況はブラウザによって異なります。カメラ・マイクが `Unknown` になる場合があります。
- macOS の Safari は UA のバージョンが 10.15 に固定されるため、OS バージョンは `Unknown` になります。
- サポート表は 2026-10 時点の目安です。実際のサポート期限は各ベンダーの発表を確認してください。
- 公開デモの端末名・OS・権限状態・接続先はすべて合成値です。

## ライセンス

MIT ライセンス — 詳細は [../LICENSE](../LICENSE) を参照してください。
