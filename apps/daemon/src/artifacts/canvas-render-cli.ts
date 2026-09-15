#!/usr/bin/env node
import { CanvasDocumentError } from '@open-design/contracts';
import { renderCanvasProject } from './canvas-render.js';

try {
  if (process.argv.length === 3 && process.argv[2] === '--help') {
    console.log('Usage: canvas-render design.json\nRun in the project directory. Validates Canvas v2 JSON and renders each page with the native Motif renderer. Writes page PNGs and report.json in a unique canvas-review-* directory, whose path is printed as JSON. Read the report and PNGs; fix errors in design.json and render again. Exit 0 means every page rendered without missing images or clipped text; exit 1 means an error. No server or dependency setup is needed.');
  } else {
    if (process.argv.length !== 3 || process.argv[2] !== 'design.json') throw new Error('Usage: canvas-render design.json');
    const report = await renderCanvasProject(process.cwd(), true);
    console.log(JSON.stringify(report, null, 2));
    if (!report.valid) process.exitCode = 1;
  }
} catch (error) {
  if (error instanceof CanvasDocumentError) console.error(JSON.stringify({ error: error.message, issues: error.issues }));
  else console.error(error instanceof Error && /^canvas_[a-z_]+$/.test(error.message) ? error.message : 'canvas_render_failed');
  process.exitCode = 1;
}
