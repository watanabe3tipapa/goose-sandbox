# Gander — 実験展示を、仕組みで読み解くアトラス

**goose-sandbox の 7 つの展示を、問い・パイプライン・仕組みで横断して読む。**
Gander はプロジェクト 07 の入口であり、展示同士を比べるためのアトラスです。07 自身は、秘密検出の 7 段階を試せる **KeyLint Lab** としてアトラスに内包されています。Goose 言語そのものを読む **Goose Language Corner** も併設しています。

- LP: [`index.html`](index.html)
- Atlas: [`atlas/index.html`](atlas/index.html)
- KeyLint Lab: [`atlas/lab.html`](atlas/lab.html)
- Goose 言語コーナー: [`goose/index.html`](goose/index.html)
- Sandbox ホーム: [`../index.html`](../index.html)

---

## 何を読むか

Gander は、個別の成果物を並べるだけの一覧ではありません。各展示を次の順で読みます。

1. **Question** — その展示が立てた問い
2. **Pipeline** — どこで採取し、どこで正規化し、どこで判定するか
3. **I/O** — 何を受け取り、何を読める形にするか
4. **Limits / Decisions** — できないことと、その形にした理由
5. **Mechanism** — 展示をまたいで繰り返し現れる仕組み

### 収録している展示

| No | 展示 | 問い |
|---|---|---|
| 01 | Pipeline Viz | パイプラインは、どこで詰まり、どこが不健康なのか。 |
| 02 | Goose サンプル探訪 | 31 本のサンプルを、どこから、どの順で読むべきか。 |
| 03 | Process Sentinel | 今動いているプロセスのうち、どれが普段と違うのか。 |
| 04 | Mobile Safety Kit | この端末は、何を外に見せ、何を守れているのか。 |
| 05 | Bootprint | この Mac は、起動時に何を、どこから動かしているのか。 |
| 06 | Goose Editor | 書いたものを、外部に預けずに持ち続けられるか。 |
| 07 | KeyLint Lab | 秘密情報は、どの段階で「危ない」と判定されるのか。 |

### 7 つの仕組み

| ID | 名前 | 定義の要約 |
|---|---|---|
| `collect-freeze` | Collect & Freeze | 一度だけ採取し、出典と時点を固定してから読む。 |
| `normalize-classify` | Normalize & Classify | 入力を共通の形に揃え、意味のある軸で分類する。 |
| `baseline-diff` | Baseline Diff | 前回をベースラインに、追加・削除・変更だけを見る。 |
| `client-side-only` | Client-side Only | 取得・判定・表示をブラウザ内で完結させる。 |
| `local-persistence` | Local Persistence | 端末内のストレージに保存し、同期なしで継続性を持たせる。 |
| `offline-shell` | Offline Shell | アプリの殻だけをキャッシュし、オフライン起動を可能にする。 |
| `score-judge` | Score & Judge | 複数の観測値を重み付きで合算し、判定と優先順位を出す。 |

---

## 構成

```text
Gander/
├── index.html                 # LP（7 展示 + 7 仕組み + 言語コーナーへの入口）
├── README.md                  # このファイル
├── atlas/
│   ├── index.html             # 展示と仕組みの一覧・検索・フィルタ
│   ├── exhibit.html           # 展示詳細（?id=...）
│   ├── mechanism.html         # 仕組み詳細（?id=...）
│   ├── lab.html               # KeyLint Lab
│   ├── app.js                 # 一覧の描画と URL 同期
│   ├── exhibit.js             # 展示詳細の描画
│   ├── mechanism.js           # 仕組み詳細の描画
│   ├── lab-page.js            # Lab のフォームと結果描画
│   └── gander.css             # LP / Atlas / Lab / Goose 共通スタイル
├── goose/
│   ├── index.html             # Goose 言語コーナー
│   └── goose.js               # 特色カードとデータスタックモデルの描画
├── data/
│   ├── exhibits.json          # 7 展示の編集データ
│   ├── mechanisms.json        # 7 仕組みの編集データ
│   ├── lab-samples.json       # Lab のダミーサンプル 8 件
│   └── goose-features.json    # Goose の 8 特色と読む順
└── lib/
    ├── atlas.js               # 検索・分類・リンク解決・データ検証（純粋関数）
    ├── atlas.test.js
    ├── lab.js                 # 7 段階の秘密検出（純粋関数）
    ├── lab.test.js
    ├── goose.js               # データスタックの説明用モデル
    └── goose.test.js
```

ビルドはありません。静的な HTML / CSS / JavaScript と JSON だけで動きます。

---

## Atlas の使い方

[`atlas/index.html`](atlas/index.html) では、展示と仕組みを別々に絞り込めます。

- 展示の検索は、名前・問い・要約・パイプラインのラベルと説明を対象にします。
- 仕組みの検索は、名前・日本語名・定義・why・シグナルを対象にします。
- 仕組みで展示を絞ると、その仕組みを使う展示だけが残ります。
- 展示で仕組みを絞ると、その展示が依存している仕組みだけが残ります。

フィルタ状態は URL に残ります。

```text
atlas/index.html?q=launchd
atlas/index.html?mechanism=baseline-diff
atlas/index.html?mq=localStorage
atlas/index.html?exhibit=goose-editor
atlas/exhibit.html?id=keylint-lab
atlas/mechanism.html?id=score-judge
```

### データの追加・更新

展示を追加するときは `data/exhibits.json` に 1 件追加し、`data/mechanisms.json` の `used_by` と双方向の参照を合わせます。

最低限必要なフィールドは次のとおりです。

```json
{
  "id": "new-exhibit",
  "no": "08",
  "name": "New Exhibit",
  "status": "Active",
  "question": "何を明らかにするのか。",
  "summary": "1〜2 文の要約。",
  "pipeline": [
    { "label": "Collect", "detail": "何をするか" },
    { "label": "Judge", "detail": "何をするか" }
  ],
  "core": [{ "title": "中心の考え", "body": "説明" }],
  "inputs": ["入力"],
  "outputs": ["出力"],
  "limits": [{ "title": "限界", "body": "説明" }],
  "decisions": [{ "title": "判断", "body": "説明" }],
  "mechanisms": ["collect-freeze"],
  "links": [{ "label": "LP", "href": "NewExhibit/" }],
  "reviewed": "2026-11-22"
}
```

`links[].href` は**リポジトリルートからの相対パス**で書きます。Atlas の各ページが `Gander/atlas/` からの深さに合わせてリンクを解決します。`lib/atlas.js` の `validateData()` が、ID の重複、パイプラインの短さ、未知の仕組み、双方向参照の欠落を検出します。

---

## KeyLint Lab

[`atlas/lab.html`](atlas/lab.html) は、秘密検出を 7 段階のパイプラインとして展示する実験台です。実際のファイルを走査するスキャナではありません。

### 7 段階

1. **Pattern** — GitHub、Stripe、AWS、OpenAI、Anthropic、Slack、Google、JWT、秘密鍵などの既知形式で拾う。
2. **Context** — 変数名（`TOKEN`、`SECRET` など）とファイルパス（`.env`、`.ssh`、`credentials` など）で補強する。
3. **Entropy** — 長さ 20 以上かつ Shannon エントロピー 3.3 以上を、ランダム文字列の候補として拾う。
4. **Allowlist** — `example`、`sample`、`your_`、`${...}`、`{{...}}` などを除外する。
5. **Mask** — 値を保存せず、プロバイダごとの短い接頭辞・接尾辞だけを残す。
6. **Risk** — プロバイダの基礎点に、Git 管理下（+22）、誰でも読める（+14）、資格情報ディレクトリ（+14）を加算する。
7. **Baseline** — 「前回レポートに既知」フラグだけで NEW / KNOWN を分ける。

### リスクの目安

| スコア | レベル |
|---|---|
| 72 以上 | critical |
| 52–71 | high |
| 34–51 | medium |
| 0–33 | low |

### 設計上の注意

- 入力はページ内の JavaScript だけで処理し、保存も送信もしません。
- 表示するのはマスク済みの値だけで、元の値は結果に残しません。
- Stripe 形式のダミーは、リポジトリ自体が秘密スキャナに引っかからないよう分割して保持し、実行時に結合します（`sampleValue()`）。
- 規則は展示用の最小セットです。プロバイダの形式変更や新しいサービスには追従しません。
- スコアは優先順位づけのための相対値で、実際の漏えい被害を保証しません。
- 実際の秘密情報は入力しないでください。サンプルはすべてダミーです。

---

## Goose Language Corner

[`goose/index.html`](goose/index.html) は、アトラスの土台にある Goose 言語の特色を読むコーナーです。

- **Data Stack** — ヒープを持たず、スコープ終了時のポインタ巻き戻しで解放する。
- **Stable References** — 成長専用配列は要素を移動しないため、参照が無効化されない。
- **No Lifetime Annotations** — 参照のルートを推論し、`&'a` や `unsafe` なしで安全性を検査する。
- **Inline Nesting** — 文字列や配列の配列も 1 つの連続したバイト列に置く。
- **Packed Enums** — 可変モードの ADT は、バリアントの実サイズだけを消費する。
- **Relative References** — `T&<u32>` のオフセットで、構造体をそのままファイルにする。
- **Threads Without Shared Memory** — ワーカーは別プログラムで、型付きキューの memcpy だけで交換する。
- **Long-distance Return** — `return err from load` で階層を越えて戻る。

ページ内の **Data Stack Model** は、ポインタの前進と巻き戻しだけを表した説明用のモデルです。Goose の実行系ではありません。`lib/goose.js` の純粋関数で動いています。

コード片は次の資料から、特徴を説明する最小限の範囲で引用しています。

- [Goose サンプル探訪](../GooseSamples/README.md) — `aardappel/goose` @ `64d62fc`（Apache-2.0）
- [Goose 言語ガイド](../PipelineViz/goose_language_guide.html)
- [aardappel/goose](https://github.com/aardappel/goose)（Apache-2.0）

---

## テスト

```sh
cd Gander
node --test lib/*.test.js
```

テストは次を確認します。

- 展示 7 件・仕組み 7 件の件数と、双方向参照を含むデータ整合性
- 展示リンクの解決（クエリ文字列を除く）
- 展示・仕組みの検索とフィルタ
- 秘密検出の 7 段階、マスク、リスク判定、Allowlist、Baseline
- Goose の 8 特色と、参照しているサンプル ID の存在
- データスタックモデルの成長・最高水位・スコープ解放

---

## ローカル確認

```sh
cd goose-sandbox
python3 -m http.server 8000
```

- Gander LP: `http://localhost:8000/Gander/`
- Atlas: `http://localhost:8000/Gander/atlas/`
- KeyLint Lab: `http://localhost:8000/Gander/atlas/lab.html`
- Goose 言語コーナー: `http://localhost:8000/Gander/goose/`
- 展示詳細: `http://localhost:8000/Gander/atlas/exhibit.html?id=pipeline-viz`
- 仕組み詳細: `http://localhost:8000/Gander/atlas/mechanism.html?id=baseline-diff`

`file://` で開くと JSON の fetch が制限されるため、Atlas・Lab・Goose コーナーはローカルサーバー経由で開いてください。LP の静的なカードは `file://` でも読めます。

---

## 設計判断

- **静的サイトにした** — GitHub Pages だけで配布でき、環境依存のセットアップなしに構造を議論できる。
- **データを分離した** — 展示・仕組み・サンプル・言語特色を JSON に置き、表示ロジックを `lib/` の純粋関数に寄せた。Node のテストで守れる。
- **一覧と詳細を分けた** — Atlas で横断し、詳細ページで 1 件を深く読む。URL で状態を共有できる。
- **Lab は実験台に留めた** — 実ファイルを走査するスキャナは別プロジェクトとして切り出す。ここでは判定の説明可能性を主役にする。
- **Goose コーナーは言語の理解に限定した** — 処理系を再実装せず、特色とコード片、データスタックの説明用モデルだけを置く。

## ライセンス

Gander のコードはリポジトリ本体と同じ MIT ライセンスです。引用している Goose のサンプルと言語ガイドは Apache-2.0 に従います。詳細は [`../LICENSE`](../LICENSE) と [`../GooseSamples/THIRD_PARTY_LICENSES.md`](../GooseSamples/THIRD_PARTY_LICENSES.md) を参照してください。
