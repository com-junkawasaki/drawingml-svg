import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";
import { findNode, installDomShim } from "./helpers.mjs";

installDomShim();

const execFileAsync = promisify(execFile);
const {
  buildSVGraph,
  drawingMlToSvg,
  svgToDrawingMl,
} = await import("../docs/app.js");

test("SVG feature fixture records dependencies and unsupported diagnostics separately", () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120">
    <defs>
      <linearGradient id="g" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#0f766e"/></linearGradient>
      <marker id="arrow"><path d="M 0 0 L 10 5 L 0 10 z"/></marker>
      <filter id="blur"></filter>
      <mask id="m"></mask>
    </defs>
    <style>.accent{fill:var(--brand);stroke:#111827;stroke-width:2}:root{--brand:#38bdf8}</style>
    <rect id="styled" class="accent" x="10" y="10" width="40" height="20"/>
    <rect id="gradient" x="60" y="10" width="40" height="20" fill="url(#g)"/>
    <line id="arrow-line" x1="10" y1="60" x2="120" y2="60" stroke="#111827" marker-end="url(#arrow)"/>
    <rect id="diagnostic" x="130" y="10" width="20" height="20" filter="url(#blur)" mask="url(#m)"/>
    <path id="unsupported-path" d="M 0 0 R 10 10"/>
  </svg>`;

  const svgraph = buildSVGraph(svg);
  const styled = findNode(svgraph.root, "styled");
  const gradient = findNode(svgraph.root, "gradient");
  const arrowLine = findNode(svgraph.root, "arrow-line");

  assert.equal(styled.attributes.class, "accent");
  assert.equal(gradient.dependencies[0].target, "#g");
  assert.equal(arrowLine.dependencies[0].target, "#arrow");
  assert.deepEqual(svgraph.coverage.unsupported_elements, {});
  assert.deepEqual(svgraph.coverage.unsupported_attributes, { filter: 1, mask: 1 });
  assert.deepEqual(svgraph.coverage.unsupported_path_commands, { R: 1 });
});

test("SVG to DrawingML fixture exports editable geometry, lines, and rich text", () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 160">
    <defs><linearGradient id="g"><stop offset="0" stop-color="#0f766e"/></linearGradient></defs>
    <rect id="gradient-rect" x="10" y="10" width="80" height="30" fill="url(#g)" stroke="#111827"/>
    <path id="freeform" d="M 120 10 L 180 10 Q 200 30 180 50 Z" fill="#fde68a" stroke="#92400e"/>
    <line id="connector" data-kind="relation" data-source="gradient-rect" data-target="freeform" x1="90" y1="25" x2="120" y2="25" stroke="#2563eb"/>
    <text id="rich" x="10" y="90" font-family="Aptos" font-size="20" fill="#111827">Base<tspan font-weight="700" font-style="italic" text-decoration="underline" baseline-shift="super" fill="#dc2626">Run</tspan><tspan x="10" dy="1.2em">Next</tspan></text>
  </svg>`;

  const drawingMl = svgToDrawingMl(svg);

  assert.match(drawingMl, /name="gradient-rect"/);
  assert.match(drawingMl, /<a:srgbClr val="0F766E"/);
  assert.match(drawingMl, /name="freeform"/);
  assert.match(drawingMl, /<a:custGeom>/);
  assert.match(drawingMl, /<p:cxnSp>/);
  assert.match(drawingMl, /name="connector"/);
  assert.match(drawingMl, /<a:stCxn id="\d+" idx="0"\/>/);
  assert.match(drawingMl, /<a:endCxn id="\d+" idx="0"\/>/);
  assert.match(drawingMl, /<a:rPr lang="en-US" sz="2000" b="1" i="1" u="sng" baseline="30000">/);
  assert.match(drawingMl, /<a:br\/><a:r>/);
});

test("DrawingML import fixtures recover editable SVG semantics by feature group", async () => {
  const lineArrow = drawingMlToSvg(await readFile("examples/line-arrow.dml", "utf8"));
  const textStyle = drawingMlToSvg(await readFile("examples/text-style.dml", "utf8"));
  const tableRich = drawingMlToSvg(await readFile("examples/table-rich.dml", "utf8"));

  assert.match(lineArrow, /<marker id="svgraph-arrow"/);
  assert.match(lineArrow, /marker-start="url\(#svgraph-arrow\)"/);
  assert.match(lineArrow, /marker-end="url\(#svgraph-arrow\)"/);

  assert.match(textStyle, /<tspan/);
  assert.match(textStyle, /font-weight="bold"/);
  assert.match(textStyle, /font-style="italic"/);
  assert.match(textStyle, /text-decoration="underline"/);
  assert.match(textStyle, /baseline-shift="super"/);

  assert.match(tableRich, /data-kind="table"/);
  assert.match(tableRich, /data-kind="cell"/);
  assert.match(tableRich, /font-weight="bold"/);
  assert.match(tableRich, /stroke-dasharray="4 2"/);
});

test("CLI fixture exposes package API paths used by browser-only deployments", async () => {
  const { stdout: version } = await execFileAsync("node", ["./bin/svgraph.mjs", "--version"]);
  assert.match(version, /^svgraph 0\.1\.\d+\n$/);

  const { stdout: analysis } = await execFileAsync("node", ["./bin/svgraph.mjs", "analyze", "examples/coverage.svg"], {
    maxBuffer: 1024 * 1024,
  });
  const coverage = JSON.parse(analysis);
  assert.equal(typeof coverage.estimated_element_coverage, "number");
  assert(coverage.total_elements > 0);

  const { stdout: jsonl } = await execFileAsync("node", ["./bin/svgraph.mjs", "office-causal-jsonl", "examples/svgraph.svg"], {
    maxBuffer: 1024 * 1024,
  });
  assert.match(jsonl, /"t":"node"/);
  assert.match(jsonl, /"t":"edge"/);
});
