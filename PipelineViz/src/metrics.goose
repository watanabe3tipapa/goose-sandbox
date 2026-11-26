// metrics.goose -- the metrics data model and its JSON encoding.
//
// The shape matches the snapshot schema the Pipeline Viz dashboard reads:
// timestamp, pipeline, steps[], quarantine and errors[]. The viewer's
// data-source.js validates the same fields at runtime.

namespace metrics;

import std;
import json;

enum Status { Healthy, Warning, Error, External }

struct StepMetrics {
  step_id: u8[varint],
  label: u8[varint],
  records_in: varint,
  records_out: varint,
  elapsed_ms: f64,
  status: Status,
  message: u8[varint],
}

struct ErrorEvent {
  at: u8[varint],
  step_id: u8[varint],
  kind: u8[varint],
  message: u8[varint],
  count: varint,
}

struct PipelineSnapshot {
  timestamp: u8[varint],
  pipeline: u8[varint],
  source: u8[varint],
  steps: StepMetrics[varint],
  quarantine: StepMetrics,
  errors: ErrorEvent[varint],
}

fn status_name(s: Status) -> u8[:] {
  return match s {
    Healthy => "Healthy",
    Warning => "Warning",
    Error => "Error",
    External => "External",
  };
}

// Howard Hinnant's civil_from_days: days since 1970-01-01 to y/m/d.
fn civil_from_days(z: i64) -> i64, i64, i64 {
  let zz = z + 719468;
  let era = zz / 146097;
  let doe = zz - era * 146097;
  let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
  let y = yoe + era * 400;
  let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  let mp = (5 * doy + 2) / 153;
  let d = doy - (153 * mp + 2) / 5 + 1;
  let m = mp + (if mp < 10 { 3 } else { -9 });
  return y + (if m <= 2 { 1 } else { 0 }), m, d;
}

fn put_2(out: u8[>..]&, v: i64) {
  format_int(out, v, 10, 2, '0');
}

// "2026-11-26T09:54:00Z" from nanoseconds since the Unix epoch.
fn timestamp(out: u8[>..]&, epoch_ns: i64) {
  let secs = epoch_ns / 1000000000;
  let days = secs / 86400;
  var rem = secs - days * 86400;
  let y, mo, d = civil_from_days(days);
  let h = rem / 3600;
  rem -= h * 3600;
  let mi = rem / 60;
  let s = rem - mi * 60;
  format_int(out, y, 10, 4, '0');
  out.push('-'); put_2(out, mo);
  out.push('-'); put_2(out, d);
  out.push('T'); put_2(out, h);
  out.push(':'); put_2(out, mi);
  out.push(':'); put_2(out, s);
  out.push('Z');
}

fn timestamp_text(epoch_ns: i64) -> u8[>..] {
  var out: u8[>..] = [];
  timestamp(out, epoch_ns);
  return out;
}

// "09:54:00" from nanoseconds since the Unix epoch.
fn clock_text(out: u8[>..]&, epoch_ns: i64) {
  let secs = epoch_ns / 1000000000;
  var rem = secs % 86400;
  let h = rem / 3600;
  rem -= h * 3600;
  let mi = rem / 60;
  let s = rem - mi * 60;
  put_2(out, h);
  out.push(':'); put_2(out, mi);
  out.push(':'); put_2(out, s);
}

fn clock_text_value(epoch_ns: i64) -> u8[>..] {
  var out: u8[>..] = [];
  clock_text(out, epoch_ns);
  return out;
}

fn emit_step(out: u8[>..]&, st: StepMetrics&) {
  out.push('{');
  json::format_key(out, "step_id"); json::format_string(out, st.step_id);
  out.push(',');
  json::format_key(out, "label"); json::format_string(out, st.label);
  out.push(',');
  json::format_key(out, "records_in"); json::format_int(out, st.records_in);
  out.push(',');
  json::format_key(out, "records_out"); json::format_int(out, st.records_out);
  out.push(',');
  json::format_key(out, "elapsed_ms"); json::format_number(out, st.elapsed_ms);
  out.push(',');
  json::format_key(out, "status"); json::format_string(out, status_name(st.status));
  out.push(',');
  json::format_key(out, "message"); json::format_string(out, st.message);
  out.push('}');
}

fn emit_error(out: u8[>..]&, e: ErrorEvent&) {
  out.push('{');
  json::format_key(out, "at"); json::format_string(out, e.at);
  out.push(',');
  json::format_key(out, "step_id"); json::format_string(out, e.step_id);
  out.push(',');
  json::format_key(out, "kind"); json::format_string(out, e.kind);
  out.push(',');
  json::format_key(out, "message"); json::format_string(out, e.message);
  out.push(',');
  json::format_key(out, "count"); json::format_int(out, e.count);
  out.push('}');
}

fn emit_snapshot(out: u8[>..]&, s: PipelineSnapshot&) {
  out.push('{');
  json::format_key(out, "timestamp"); json::format_string(out, s.timestamp);
  out.push(',');
  json::format_key(out, "pipeline"); json::format_string(out, s.pipeline);
  out.push(',');
  json::format_key(out, "source"); json::format_string(out, s.source);
  out.push(',');
  json::format_key(out, "steps"); out.push('[');
  for st, i in s.steps {
    if i > 0 { out.push(','); }
    emit_step(out, st);
  }
  out.push(']');
  out.push(',');
  json::format_key(out, "quarantine"); emit_step(out, s.quarantine);
  out.push(',');
  json::format_key(out, "errors"); out.push('[');
  for e, i in s.errors {
    if i > 0 { out.push(','); }
    emit_error(out, e);
  }
  out.push(']');
  out.push('}');
}
