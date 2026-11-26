#!/usr/bin/env bash
# Build (run) the Goose ETL program and verify the metrics snapshot.
#
# Usage:
#   scripts/build.sh [out.json] [in.csv]
#
# Environment:
#   GOOSE  path to the Goose compiler (default: goose on PATH)
#
# The output defaults to PipelineViz/out/metrics.json. On main, pass
# PipelineViz/viewer/data/metrics.json once the dashboard is wired to the
# generated snapshot.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$ROOT/PipelineViz/out/metrics.json}"
IN="${2:-$ROOT/PipelineViz/src/sample.csv}"

GOOSE_BIN="${GOOSE:-}"
if [ -z "$GOOSE_BIN" ]; then
  GOOSE_BIN="$(command -v goose || true)"
fi
if [ -z "$GOOSE_BIN" ] || [ ! -x "$GOOSE_BIN" ]; then
  echo "error: Goose compiler not found." >&2
  echo "       Install it from https://github.com/aardappel/goose/releases" >&2
  echo "       or set GOOSE=/path/to/goose." >&2
  exit 1
fi

if [ ! -f "$IN" ]; then
  echo "error: input CSV not found: $IN" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT")"

echo "Goose:  $("$GOOSE_BIN" version)"
echo "Input:  $IN"
echo "Output: $OUT"

"$GOOSE_BIN" run "$ROOT/PipelineViz/src/main.goose" -- --in "$IN" --out "$OUT"
"$ROOT/scripts/verify.sh" "$OUT"
