// main.goose -- entry point.
//
//   goose run PipelineViz/src/main.goose -- --in sample.csv --out metrics.json
//
// Defaults are relative to the current working directory. scripts/build.sh
// passes absolute paths and then runs scripts/verify.sh on the result.

import std;
import os;
import .metrics;
import .pipeline;

fn main() {
  var in_path: u8[>..] = [];
  in_path.append("PipelineViz/src/sample.csv");
  var out_path: u8[>..] = [];
  out_path.append("PipelineViz/out/metrics.json");

  let argv = args();
  for i in 1..argv.len {
    if argv[i] == "--in" && i + 1 < argv.len {
      in_path = [];
      in_path.append(argv[i + 1]);
    } else if argv[i] == "--out" && i + 1 < argv.len {
      out_path = [];
      out_path.append(argv[i + 1]);
    }
  }

  var text: u8[>..] = [];
  if !read_file(in_path, text) { abort("cannot read input file"); }
  let now_ns = time_ns();
  let snapshot = pipeline::run_etl(text, now_ns);

  var out: u8[>..] = [];
  metrics::emit_snapshot(out, snapshot);
  out.push('\n');
  if !write_file(out_path, out) { abort("cannot write output file"); }
  print("wrote ", out_path, " (", out.len, " bytes)");
}
