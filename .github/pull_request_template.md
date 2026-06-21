## Summary

-

## SVGraph impact

- [ ] SVGraph model or metadata changed
- [ ] SVGraph presentation/package projection changed
- [ ] SVG to DrawingML behavior changed
- [ ] DrawingML to SVG behavior changed
- [ ] PresentationML/PPTX export changed
- [ ] Analyzer behavior changed
- [ ] Browser editor or Pages artifact changed
- [ ] Documentation or project metadata only

## Testing

- [ ] `npm ci`
- [ ] `npm run check:web`
- [ ] `npm run build:web`
- [ ] `npm run check:package`
- [ ] `git diff --exit-code docs/app.js`
- [ ] `git diff --exit-code docs/app.d.ts`
- [ ] `npm pack --dry-run --json`
- [ ] `node ./bin/svgraph.mjs svg2pptx examples/svgraph.svg -o tmp/svgraph-smoke.pptx`
- [ ] `node ./bin/svgraph.mjs svgraph-presentation examples/svgraph.svg > tmp/svgraph-presentation.json`

## Notes

If this adds DrawingML preset support, update the "Supported DrawingML presets" section in `README.md`.
