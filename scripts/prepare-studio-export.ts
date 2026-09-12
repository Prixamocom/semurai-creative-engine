// Distribution assembly: keep the pinned desktop converter and its license in
// the browser Studio bundle without exposing a desktop runtime dependency.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const target = new URL('apps/web/public/semurai-export/', root);
await mkdir(target, { recursive: true });
const vendor = new URL('apps/desktop/vendor/dom-to-pptx/', root);
await writeFile(new URL('dom-to-pptx.js', target), gunzipSync(await readFile(new URL('dom-to-pptx.bundle.js.gz', vendor))));
await copyFile(new URL('LICENSE', vendor), new URL('LICENSE.txt', target));
await copyFile(new URL('packages/artifact-renderer/dist/browser.js', root), new URL('renderer.js', target));
process.stdout.write('Prepared Studio export assets: ' + fileURLToPath(target) + '\n');
