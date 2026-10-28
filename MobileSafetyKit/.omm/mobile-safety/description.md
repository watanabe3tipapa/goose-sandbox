# Mobile Safety Kit

スマホのセキュリティ状態を、ブラウザ標準 API だけで診断する。

- 実スキャン: `viewer/`
- 合成レポート: `viewer/data/demo-report.json`
- 判定: 8 つのチェックを重み付きで平均し、総合レベルは**最弱のチェック**に合わせる
- 観測できない項目は `Unknown` としてスコアから除外する（推測しない）

```text
Device Scan ─┐
Security Check ─┼─► Risk Judge ─► Score / Level ─► Alerts / Advice
Privacy Check ─┘
```

`diagram.mmd` は `viewer/data/demo-report.json` の値をもとにした表示例です。
