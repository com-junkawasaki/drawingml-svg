import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { findNode, installDomShim, textEntry, unzip, xmlEntityDecode } from "./helpers.mjs";

installDomShim();

const {
  buildOfficeCausalJsonl,
  buildOfficeCausalPayload,
  buildSVGraph,
  buildSVGraphSidecar,
  drawingMlToSvg,
  svgToDrawingMl,
  svgToPptx,
} = await import("../docs/app.js");

const semanticSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 240">
  <metadata><![CDATA[{"presentation":{"slideSize":{"width":420,"height":240},"guides":[{"orientation":"vertical","position":210}],"rulers":{"unit":"px"},"textStyles":{"title":{"fontSize":28}}}}]]></metadata>
  <defs><linearGradient id="grad"><stop offset="0" stop-color="#0f766e"/></linearGradient></defs>
  <g id="slide-a" data-kind="slide" data-title="Intro">
    <rect id="title-box" data-role="title" x="20" y="20" width="120" height="48" fill="url(#grad)"/>
    <line id="rel-title-body" data-kind="relation" data-source="title-box" data-target="body-box" x1="140" y1="44" x2="220" y2="44"/>
    <rect id="body-box" data-role="body" x="220" y="20" width="140" height="48" fill="#dbeafe"/>
    <g id="table-a" data-kind="table">
      <g data-kind="cell" data-row="0" data-col="0" data-text="Role">
        <rect x="20" y="110" width="90" height="32" fill="#e0f2fe" stroke="#0f766e"/>
      </g>
      <g data-kind="cell" data-row="0" data-col="1" data-text="Output">
        <rect x="110" y="110" width="120" height="32" fill="#ffffff" stroke="#0f766e"/>
      </g>
    </g>
  </g>
</svg>`;

test("SVGraph preserves SVG metadata, data semantics, dependencies, and presentation state", () => {
  const svgraph = buildSVGraph(semanticSvg);
  const slide = findNode(svgraph.root, "slide-a");
  const title = findNode(svgraph.root, "title-box");
  const relation = findNode(svgraph.root, "rel-title-body");
  const table = findNode(svgraph.root, "table-a");

  assert.equal(svgraph.kind, "svgraph");
  assert.equal(svgraph.metadata.json.presentation.slideSize.width, 420);
  assert.equal(svgraph.presentation.slide_size[0], 420);
  assert.equal(svgraph.presentation.slide_size[1], 240);
  assert.equal(svgraph.presentation.slides.length, 1);
  assert.equal(svgraph.presentation.slides[0].title, "Intro");
  assert.deepEqual(svgraph.presentation.guides, [
    { guide_id: "guide-1", orientation: "vertical", position: 210, unit: "px", node_id: null },
  ]);
  assert.deepEqual(svgraph.presentation.rulers, []);
  assert.deepEqual(svgraph.presentation.text_styles, [
    { style_id: "title", role: "title", properties: { fontSize: 28 }, node_id: null },
  ]);

  assert.equal(slide.data.kind, "slide");
  assert.equal(title.data.role, "title");
  assert.equal(relation.data.kind, "relation");
  assert.equal(relation.data.source, "title-box");
  assert.equal(relation.data.target, "body-box");
  assert.equal(table.data.kind, "table");

  assert.deepEqual(title.dependencies, [
    { kind: "paint-server", source: "title-box", target: "#grad", attribute: "fill" },
  ]);
  assert.deepEqual(svgraph.dependencies, title.dependencies);
  assert.equal(svgraph.coverage.unsupported_elements.filter ?? 0, 0);
});

test("DrawingML export keeps semantic relations as editable connectors", () => {
  const drawingMl = svgToDrawingMl(semanticSvg);

  assert.match(drawingMl, /<p:cxnSp>/);
  assert.match(drawingMl, /name="rel-title-body"/);
  assert.match(drawingMl, /<a:stCxn id="\d+" idx="0"\/>/);
  assert.match(drawingMl, /<a:endCxn id="\d+" idx="0"\/>/);
  assert.match(drawingMl, /<a:prstGeom prst="line">/);
});

test("DrawingML import recovers connectors and native tables as SVGraph SVG semantics", async () => {
  const connectorDrawingMl = await readFile("examples/connector-style-ref.dml", "utf8");
  const tableDrawingMl = await readFile("examples/table-rich.dml", "utf8");

  const connectorSvg = drawingMlToSvg(connectorDrawingMl);
  assert.match(connectorSvg, /data-kind="relation"/);
  assert.match(connectorSvg, /stroke="#dc2626"/);

  const tableSvg = drawingMlToSvg(tableDrawingMl);
  assert.match(tableSvg, /data-kind="table"/);
  assert.match(tableSvg, /data-kind="cell"/);
  assert.match(tableSvg, /<tspan/);
  assert.match(tableSvg, /font-weight="bold"/);
});

test("PPTX export contains recoverable source, SVGraph sidecar, Office Causal JSONL, and native table XML", () => {
  const entries = unzip(svgToPptx(semanticSvg));
  const contentTypes = textEntry(entries, "[Content_Types].xml");
  const slide = textEntry(entries, "ppt/slides/slide1.xml");
  const sidecar = textEntry(entries, "customXml/item1.xml");
  const causal = textEntry(entries, "ocz/causal.jsonl");

  assert.match(contentTypes, /\/customXml\/item1\.xml/);
  assert.match(contentTypes, /ContentType="application\/jsonl"/);
  assert.match(slide, /<p:cxnSp>/);
  assert.match(slide, /<a:tbl>/);
  assert.match(slide, /Role/);
  assert.match(slide, /Output/);

  const payload = JSON.parse(xmlEntityDecode(sidecar.match(/<svgraph:json>([\s\S]*?)<\/svgraph:json>/)?.[1] ?? ""));
  assert.equal(payload.kind, "svgraph-presentation");
  assert.equal(payload.source_svg, semanticSvg);
  assert.equal(payload.slides[0].title, "Intro");

  const causalLines = causal.trim().split("\n").map((line) => JSON.parse(line));
  assert(causalLines.some((line) => line.t === "node" && line.kind === "slide"));
  assert(causalLines.some((line) => line.t === "node" && line.kind === "table"));
  assert(causalLines.some((line) => line.t === "edge" && line.kind === "contains"));
});

test("Office Causal projection is deterministic and linked to SVGraph ids", () => {
  const svgraph = buildSVGraph(semanticSvg);
  const payload = buildOfficeCausalPayload(svgraph);
  const jsonl = buildOfficeCausalJsonl(svgraph);

  assert.equal(payload.generator, "office-causal");
  assert(payload.nodes.some((node) => node.id === "ocz1:svgraph-slide-a" && node.kind === "slide"));
  assert(payload.nodes.some((node) => node.id === "ocz1:svgraph-table-a" && node.kind === "table"));
  assert(payload.edges.some((edge) => edge.kind === "contains"));
  assert.match(jsonl, /"t":"node"/);
  assert.match(jsonl, /"t":"edge"/);
});

test("SVGraph sidecar is sufficient to recover presentation metadata and original SVG source", () => {
  const svgraph = buildSVGraph(semanticSvg);
  const sidecar = buildSVGraphSidecar(svgraph, semanticSvg);

  assert.equal(sidecar.kind, "svgraph-sidecar");
  assert.equal(sidecar.source_svg, semanticSvg);
  assert.equal(sidecar.presentation.slide_size[0], 420);
  assert.equal(sidecar.dependencies.length, 1);
  assert.equal(sidecar.coverage.estimated_element_coverage, svgraph.coverage.estimated_element_coverage);
});
