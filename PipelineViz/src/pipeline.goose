// pipeline.goose -- a small Extract / Transform / Load run that records a
// StepMetrics value for every step and quarantines records that fail
// schema validation.
//
// The CSV is a stand-in for any extract source. Transform is where the
// schema rules live: a row needs three fields, its amount must parse as a
// number, and the amount must not be negative. Anything else is counted
// into the quarantine node and reported in errors[].

namespace pipeline;

import std;
import csv;
import os;
import .metrics;

struct Record {
  id: u8[varint],
  amount: f64,
  parsed: bool,
  shaped: bool,
}

// Runs F and records how many records it produced and how long it took.
// F is a compile-time block (see the function-value section of the Goose
// reference), so the measurement inlines into the step it wraps.
fn measure<F>(step_id: u8[:], label: u8[:], input_count: i64) -> metrics::StepMetrics {
  let t0 = clock_ns();
  let out_count = F();
  let elapsed = (clock_ns() - t0) as f64 / 1000000.0;
  return metrics::StepMetrics {
    step_id: step_id,
    label: label,
    records_in: input_count,
    records_out: out_count,
    elapsed_ms: elapsed,
    status: metrics::Status.Healthy,
    message: "",
  };
}

// A blank line is one empty field in CSV; anything else after the header
// counts as a data row.
fn is_data_row(fields: const u8[:][:]) -> bool {
  return fields.len > 1 || (fields.len == 1 && fields[0].len > 0);
}

fn count_rows(text: u8[:]) -> i64 {
  var rows = 0;
  var first = true;
  let ok = csv::each_record(text) { fields =>
    if first { first = false; }
    else if is_data_row(fields) { rows++; }
  };
  if !ok { abort("malformed CSV"); }
  return rows;
}

fn run_etl(text: u8[:], now_ns: i64) -> metrics::PipelineSnapshot {
  let input_rows = count_rows(text);

  var records: Record[>..] = [];
  let extract = measure("Extract", "Extract", input_rows) {
    var first = true;
    let ok = csv::each_record(text) { fields =>
      if first { first = false; }
      else if is_data_row(fields) {
        if fields.len >= 3 {
          let amount, parsed = parse_flt(fields[2]);
          records.push(Record { id: fields[0], amount: amount, parsed: parsed, shaped: true });
        } else {
          records.push(Record { id: fields[0], amount: 0.0, parsed: false, shaped: false });
        }
      }
    };
    if !ok { abort("malformed CSV"); }
    records.len
  };

  var valid: Record[>..] = [];
  var bad_shape = 0;
  var bad_number = 0;
  var bad_amount = 0;
  let transform = measure("Transform", "Transform", extract.records_out) {
    for r in records {
      if !r.shaped { bad_shape++; }
      else if !r.parsed { bad_number++; }
      else if r.amount < 0.0 { bad_amount++; }
      else { valid.push(copy(r)); }
    }
    valid.len
  };

  var total = 0.0;
  let load = measure("Load", "Load", transform.records_out) {
    for r in valid { total += r.amount; }
    valid.len
  };
  print("loaded total amount = ", total);

  var steps: metrics::StepMetrics[>..] = [];
  steps.push(copy(extract));
  steps.push(copy(transform));
  steps.push(copy(load));

  let invalid = bad_shape + bad_number + bad_amount;
  let quarantine = metrics::StepMetrics {
    step_id: "error-handler",
    label: "@error-handler",
    records_in: invalid,
    records_out: 0,
    elapsed_ms: 0.0,
    status: metrics::Status.External,
    message: "schema validation",
  };

  var errors: metrics::ErrorEvent[>..] = [];
  let at = metrics::clock_text_value(now_ns);
  if bad_shape > 0 {
    errors.push(metrics::ErrorEvent {
      at: copy(at), step_id: "Transform", kind: "schema",
      message: "row has fewer than three fields", count: bad_shape,
    });
  }
  if bad_number > 0 {
    errors.push(metrics::ErrorEvent {
      at: copy(at), step_id: "Transform", kind: "schema",
      message: "amount is not a number", count: bad_number,
    });
  }
  if bad_amount > 0 {
    errors.push(metrics::ErrorEvent {
      at: copy(at), step_id: "Transform", kind: "range",
      message: "amount is negative", count: bad_amount,
    });
  }

  return metrics::PipelineSnapshot {
    timestamp: metrics::timestamp_text(now_ns),
    pipeline: "etl-main",
    steps: steps,
    quarantine: quarantine,
    errors: errors,
  };
}
