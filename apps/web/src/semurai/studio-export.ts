import { studioPreviewSource } from './studio-preview';
import { findRealTagOffset, HTML_TAG_PATTERNS } from '@open-design/contracts/runtime/html-injection-points';

export function downloadStudioFile(contents: BlobPart, type: string, title: string, extension: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = (title.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 100) || 'semurai') + extension;
  anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** An isolated, sanitized render document. Only our pinned export code runs. */
function renderSource(source: string, deck: boolean) {
  const doc = new DOMParser().parseFromString(studioPreviewSource(source, 0, false, deck), 'text/html');
  doc.querySelectorAll('script').forEach(node => node.remove());
  const style = doc.createElement('style');
  style.textContent = '*{animation:none!important;transition:none!important;caret-color:transparent!important}' + (deck ?
    'html,body{margin:0!important;width:1920px!important;height:auto!important;overflow:visible!important}.deck-stage{position:relative!important;inset:auto!important;transform:none!important;width:1920px!important;height:auto!important;overflow:visible!important}.deck-stage .slide{display:block!important;position:relative!important;inset:auto!important;transform:none!important;opacity:1!important;visibility:visible!important;width:1920px!important;height:1080px!important;overflow:hidden!important;break-after:page;page-break-after:always}.deck-stage .slide:last-child{break-after:auto;page-break-after:auto}.deck-nav,.deck-progress,.deck-counter,[data-od-runtime]{display:none!important}@page{size:20in 11.25in;margin:0}' : '@page{margin:12mm}');
  doc.head.appendChild(style);
  return '<!doctype html>' + doc.documentElement.outerHTML;
}

export async function exportStudioDocument(source: string, deck: boolean, kind: 'pptx' | 'print', path: string, title: string) {
  let scripts: string[] = [];
  if (kind === 'pptx') {
    scripts = await Promise.all(['dom-to-pptx.js', 'renderer.js'].map(async file => {
      const response = await fetch(path + 'export/' + file, { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('Export unavailable');
      return response.text();
    }));
  }
  const token = crypto.randomUUID();
  const iframe = document.createElement('iframe');
  iframe.title = 'Semurai export'; iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('sandbox', 'allow-scripts allow-modals');
  iframe.style.cssText = 'position:fixed;left:-20000px;top:0;width:1920px;height:1080px;border:0;pointer-events:none';
  const injected = scripts.map(script => '<script>' + script.replace(/<\/script/gi, '<\\/script') + '</script>').join('');
  const execute = `(async()=>{const notify=(data)=>parent.postMessage({type:'semurai-export',token:${JSON.stringify(token)},...data},'*');try{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r;setTimeout(r,8000)})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));${kind === 'pptx' ? "const result=await SemuraiDeckExport.runDomToPptx('.deck-stage .slide');notify(result);" : "addEventListener('afterprint',()=>notify({printed:true}),{once:true});window.print();notify({printed:true});"}}catch(e){notify({error:String(e)})}})();`;
  const html = renderSource(source, deck);
  const bodyEnd = findRealTagOffset(html, HTML_TAG_PATTERNS.bodyClose);
  if (bodyEnd < 0) throw new Error('Invalid export document');
  iframe.srcdoc = html.slice(0, bodyEnd) + injected + '<script>' + execute + '</script>' + html.slice(bodyEnd);
  return new Promise<string | undefined>((resolve, reject) => {
    const cleanup = () => { clearTimeout(timeout); window.removeEventListener('message', receive); iframe.remove(); };
    const receive = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow || event.data?.type !== 'semurai-export' || event.data.token !== token) return;
      const { b64, error, printed } = event.data;
      if (error) { cleanup(); reject(new Error('Export failed')); return; }
      if (typeof b64 === 'string') {
        try {
          atob(b64);
        } catch { cleanup(); reject(new Error('Export failed')); return; }
      } else if (!printed) { cleanup(); reject(new Error('Export failed')); return; }
      cleanup(); resolve(b64);
    };
    const timeout = setTimeout(() => { cleanup(); reject(new Error('Export timed out')); }, kind === 'print' ? 600_000 : 120_000);
    window.addEventListener('message', receive); document.body.appendChild(iframe);
  });
}
