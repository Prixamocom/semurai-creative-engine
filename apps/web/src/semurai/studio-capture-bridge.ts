import { STUDIO_PREVIEW_ACCENT } from './studio-comment-bridge';
import { STUDIO_FONT_INLINER } from './studio-fonts';

/**
 * Trusted, Semurai-owned PNG capture for the Studio preview. It runs inside the
 * sandboxed preview (no same-origin access), so the host drives it by message:
 *
 *   semurai:capture-pick     { enabled }         hover highlight + click picks an element
 *   -> semurai:capture-picked { elementId, label } or semurai:capture-pick-cancel (Escape)
 *   semurai:capture-measure  { id, target }      -> semurai:capture-measure:result
 *                            (target.kind: page | viewport | slide | element)
 *   semurai:capture-render   { id, clip, document, width, height, background, stage, fonts, fontOrigin }
 *   -> semurai:capture-render:result { id, blob, width, height, fontsMissing, fonts } or { id, error }
 *   semurai:page-styles-request -> semurai:page-styles { backgroundColor, rootBackgroundColor, fontFamily, fontSize }
 *                            (also posted once the document has loaded; computed styles of body and html
 *                            for the edit panel's page knobs, see studioPageStyles in studio-edit-values.ts)
 *
 * The host turns a measurement into a clip rectangle in document coordinates
 * (studioCapturePlan in studio-capture.ts). Rendering clones the whole document,
 * pins every element's computed layout inline, serializes it as XHTML inside an
 * SVG <foreignObject> sized to the full document (so media queries and layout
 * match the preview) and draws only the clip rectangle onto the canvas at the
 * requested scale. Only fonts embedded as data: URLs survive the SVG image, so
 * the Google Fonts faces the document uses are fetched from our font proxy
 * (`fontOrigin`) and inlined first (STUDIO_FONT_INLINER in studio-fonts.ts).
 * `fonts` in the render request is the host's session cache of already
 * fetched URLs; the result hands back the newly fetched ones and whether some
 * font fell back.
 */
export const STUDIO_CAPTURE_BRIDGE = String.raw`(function () {
  if (window.__semuraiCaptureBridge) return;
  window.__semuraiCaptureBridge = true;
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var UI = 'data-semurai-capture-ui';
  var IDS = ['data-od-id', 'data-od-source-path', 'data-od-runtime-id'];
  var PROPS = ['display','position','box-sizing','float','clear','width','height','min-width','max-width','min-height','max-height',
    'margin-top','margin-right','margin-bottom','margin-left','padding-top','padding-right','padding-bottom','padding-left',
    'border-top-width','border-right-width','border-bottom-width','border-left-width','border-top-style','border-right-style','border-bottom-style','border-left-style',
    'border-top-color','border-right-color','border-bottom-color','border-left-color',
    'border-top-left-radius','border-top-right-radius','border-bottom-right-radius','border-bottom-left-radius',
    'font-family','font-size','font-weight','font-style','font-stretch','font-variant','line-height','letter-spacing','word-spacing',
    'text-align','text-indent','text-transform','text-decoration-line','text-decoration-color','text-decoration-style','text-shadow',
    'white-space','word-break','overflow-wrap','text-overflow','vertical-align','list-style-type','list-style-position',
    'color','background-color','background-image','background-size','background-position','background-repeat','background-clip','background-origin',
    'opacity','visibility','transform','transform-origin','filter','clip-path','mix-blend-mode','box-shadow','outline-style','outline-width','outline-color','outline-offset',
    'overflow-x','overflow-y','object-fit','object-position','z-index','top','right','bottom','left',
    'flex-direction','flex-wrap','flex-grow','flex-shrink','flex-basis','order','align-items','align-content','align-self','justify-content','justify-items','justify-self',
    'row-gap','column-gap','grid-template-columns','grid-template-rows','grid-template-areas','grid-auto-flow','grid-auto-columns','grid-auto-rows',
    'grid-column-start','grid-column-end','grid-row-start','grid-row-end','table-layout','border-collapse','border-spacing','aspect-ratio'];
  var fontInliner = ${STUDIO_FONT_INLINER}(window);
  var SKIP = { head: 1, style: 1, script: 1, template: 1, title: 1, meta: 1, link: 1, base: 1, noscript: 1 };
  function post(message) { parent.postMessage(message, '*'); }
  function scrollOffset() {
    var root = document.documentElement, body = document.body;
    return { x: Math.max(window.scrollX || 0, root.scrollLeft || 0, body ? body.scrollLeft || 0 : 0),
      y: Math.max(window.scrollY || 0, root.scrollTop || 0, body ? body.scrollTop || 0 : 0) };
  }
  function bodyScrolls() {
    var body = document.body; if (!body) return false;
    var style = getComputedStyle(body);
    return /(auto|scroll)/.test(style.overflowY) && body.scrollHeight > body.clientHeight + 1;
  }
  function documentSize() {
    var root = document.documentElement, body = document.body;
    return { width: Math.max(1, root.clientWidth, root.scrollWidth, body ? body.scrollWidth : 0),
      height: Math.max(1, root.clientHeight, root.scrollHeight, body ? body.scrollHeight : 0) };
  }
  function findElement(target) {
    if (!target) return null;
    var element = null, id = typeof target.elementId === 'string' ? target.elementId : '';
    for (var i = 0; id && !element && i < IDS.length; i++) {
      try { element = document.querySelector('[' + IDS[i] + '="' + CSS.escape(id) + '"]'); } catch (_) {}
    }
    if (!element && typeof target.selector === 'string' && target.selector) { try { element = document.querySelector(target.selector); } catch (_) {} }
    return element && !element.closest('[' + UI + ']') ? element : null;
  }
  function transparent(color) { return !color || color === 'transparent' || /^rgba\([^)]*,\s*0\)$/.test(color); }
  function backgroundOf(element) {
    for (var node = element; node && node.nodeType === 1; node = node.parentElement) {
      var color = getComputedStyle(node).backgroundColor;
      if (!transparent(color)) return color;
    }
    return '#ffffff';
  }
  function labelOf(element) {
    var named = element.getAttribute('data-screen-label');
    if (named) return named;
    var tag = element.localName;
    if (element.id) return tag + '-' + element.id;
    var name = (typeof element.className === 'string' ? element.className : '').trim().split(/\s+/)[0];
    return name ? tag + '-' + name : tag;
  }
  // A sticky element (or one inside it) sits where the scroll pinned it; the
  // clone renders at scroll 0, so report how far it moved from its flow position.
  function stickyShift(element) {
    for (var node = element; node && node !== document.body; node = node.parentElement) {
      if (getComputedStyle(node).position !== 'sticky') continue;
      var before = node.getBoundingClientRect(), inline = node.style.getPropertyValue('position'), priority = node.style.getPropertyPriority('position');
      node.style.setProperty('position', 'relative', 'important');
      var after = node.getBoundingClientRect();
      if (inline) node.style.setProperty('position', inline, priority); else node.style.removeProperty('position');
      return { x: before.left - after.left, y: before.top - after.top };
    }
    return { x: 0, y: 0 };
  }
  function isFixed(element) {
    for (var node = element; node && node !== document.body; node = node.parentElement) if (getComputedStyle(node).position === 'fixed') return true;
    return false;
  }
  function measure(target) {
    var kind = target && target.kind;
    var element = kind === 'element' ? findElement(target) : kind === 'slide' ? document.querySelector('.deck-stage') : null;
    if (kind !== 'page' && kind !== 'viewport' && !element) return { error: 'not-found' };
    var scroll = scrollOffset(), size = documentSize();
    var result = { kind: kind, scroll: scroll, document: size, background: backgroundOf(element || document.body || document.documentElement), label: element ? labelOf(element) : '' };
    // The visible viewport in viewport coordinates; the host adds the scroll offset back.
    if (kind === 'viewport') { var root = document.documentElement; result.rect = { x: 0, y: 0, width: root.clientWidth || window.innerWidth, height: root.clientHeight || window.innerHeight }; return result; }
    if (!element) { result.rect = { x: -scroll.x, y: -scroll.y, width: size.width, height: size.height }; return result; }
    var box = element.getBoundingClientRect();
    result.rect = { x: box.left, y: box.top, width: box.width, height: box.height };
    var stage = element.closest('.deck-stage');
    if (stage) {
      var s = stage.getBoundingClientRect();
      result.stage = { x: s.left, y: s.top, width: s.width, height: s.height, naturalWidth: stage.offsetWidth || 1920, naturalHeight: stage.offsetHeight || 1080 };
    } else {
      result.fixed = isFixed(element);
      result.correction = result.fixed ? { x: 0, y: 0 } : stickyShift(element);
    }
    return result;
  }
  function inline(source, target) {
    if (!source || !target || source.nodeType !== 1 || target.nodeType !== 1) return;
    if (SKIP[source.localName] || (source.namespaceURI === SVG_NS && source.localName !== 'svg')) return;
    var computed = getComputedStyle(source), style = '';
    for (var i = 0; i < PROPS.length; i++) { var value = computed.getPropertyValue(PROPS[i]); if (value) style += PROPS[i] + ':' + value + ';'; }
    target.setAttribute('style', (target.getAttribute('style') || '') + ';' + style);
  }
  function syncState(source, target) {
    var tag = source.localName;
    if (tag === 'img' && source.currentSrc) target.setAttribute('src', source.currentSrc);
    if (tag === 'input') { target.setAttribute('value', source.value || ''); if (source.checked) target.setAttribute('checked', ''); else target.removeAttribute('checked'); }
    if (tag === 'textarea') target.textContent = source.value || '';
    if (tag === 'canvas') {
      try { var image = document.createElement('img'); image.setAttribute('src', source.toDataURL('image/png')); image.setAttribute('style', target.getAttribute('style') || ''); target.replaceWith(image); } catch (_) {}
    }
  }
  function cleanCss(text) {
    return String(text || '')
      .replace(/@import[^;]*;/gi, '')
      .replace(/@font-face\s*\{[^}]*\}/gi, function (rule) { return /url\(\s*(?!['"]?\s*data:)/i.test(rule) ? '' : rule; })
      .replace(/:root\b/g, 'html');
  }
  function wait() {
    var images = [].slice.call(document.images || []).map(function (image) {
      return image.complete ? null : new Promise(function (resolve) { image.addEventListener('load', resolve, { once: true }); image.addEventListener('error', resolve, { once: true }); setTimeout(resolve, 8000); });
    });
    var fonts = document.fonts && document.fonts.ready ? document.fonts.ready.catch(function () {}) : null;
    return Promise.all(images.concat([fonts]));
  }
  function svgFor(request, fontCss) {
    var root = document.documentElement;
    var originals = [root].concat([].slice.call(root.querySelectorAll('*')));
    var clone = root.cloneNode(true);
    var clones = [clone].concat([].slice.call(clone.querySelectorAll('*')));
    var count = Math.min(originals.length, clones.length, 8000);
    for (var i = 0; i < count; i++) inline(originals[i], clones[i]);
    for (var j = 0; j < count; j++) if (originals[j].nodeType === 1) syncState(originals[j], clones[j]);
    clone.querySelectorAll('script,noscript,template,iframe,object,embed,link,meta,base,[data-studio-comment-markers],[data-od-edit-guides-layer],[' + UI + ']').forEach(function (node) { node.remove(); });
    clone.querySelectorAll('style').forEach(function (node) { node.textContent = cleanCss(node.textContent); });
    var head = clone.querySelector('head') || clone;
    if (fontCss) { var fonts = document.createElement('style'); fonts.textContent = fontCss; head.appendChild(fonts); }
    var freeze = document.createElement('style');
    freeze.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
    head.appendChild(freeze);
    var body = clone.querySelector('body');
    var width = request.document.width, height = request.document.height;
    if (request.stage) {
      // Lay the deck out at its natural size: the stage unscaled at the origin,
      // every ancestor (the fixed viewport-sized shell included) as large as it.
      var stage = clone.querySelector('.deck-stage');
      if (stage) {
        ['transform:none', 'left:0', 'top:0', 'position:absolute', 'margin:0'].forEach(function (rule) { var pair = rule.split(':'); stage.style.setProperty(pair[0], pair[1], 'important'); });
        for (var node = stage.parentElement; node; node = node.parentElement) {
          ['width:' + width + 'px', 'height:' + height + 'px', 'max-width:none', 'max-height:none', 'overflow:hidden', 'margin:0', 'transform:none'].forEach(function (rule) { var pair = rule.split(':'); node.style.setProperty(pair[0], pair[1], 'important'); });
        }
      }
    } else if (bodyScrolls()) {
      [clone, body].forEach(function (node) { if (node) ['height:auto', 'max-height:none', 'overflow:visible'].forEach(function (rule) { var pair = rule.split(':'); node.style.setProperty(pair[0], pair[1], 'important'); }); });
    }
    var xml = new XMLSerializer().serializeToString(clone);
    return '<svg xmlns="' + SVG_NS + '" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">' +
      '<foreignObject x="0" y="0" width="' + width + '" height="' + height + '">' + xml + '</foreignObject></svg>';
  }
  function blank(canvas) {
    var probe = document.createElement('canvas'); probe.width = 64; probe.height = 64;
    var context = probe.getContext('2d'); context.drawImage(canvas, 0, 0, 64, 64);
    var data = context.getImageData(0, 0, 64, 64).data;
    for (var i = 3; i < data.length; i += 4) if (data[i] > 0) return false;
    return true;
  }
  function render(request) {
    var fonts = { css: '', missing: false, fetched: {} };
    return wait().then(function () {
      return fontInliner.embed(document, { cache: request.fonts, origin: request.fontOrigin }).then(function (value) { fonts = value; }, function () { fonts.missing = true; });
    }).then(function () {
      return new Promise(function (resolve, reject) {
        var image = new Image();
        var clip = request.clip, attempts = 0;
        function draw() {
          try {
            var canvas = document.createElement('canvas');
            canvas.width = request.width; canvas.height = request.height;
            var context = canvas.getContext('2d');
            if (!context) throw new Error('failed');
            context.drawImage(image, clip.x, clip.y, clip.width, clip.height, 0, 0, request.width, request.height);
            // Safari can paint an SVG image with embedded content only on a later frame.
            if (blank(canvas)) { if (attempts++ < 2) { setTimeout(draw, 300); return; } throw new Error('empty-render'); }
            context.globalCompositeOperation = 'destination-over';
            context.fillStyle = request.background || '#ffffff';
            context.fillRect(0, 0, request.width, request.height);
            canvas.toBlob(function (blob) { if (blob) resolve({ blob: blob, width: canvas.width, height: canvas.height, fontsMissing: fonts.missing, fonts: fonts.fetched }); else reject(new Error('empty-render')); }, 'image/png');
          } catch (error) { reject(error); }
        }
        image.onload = draw;
        image.onerror = function () { reject(new Error('empty-render')); };
        image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgFor(request, fonts.css));
      });
    });
  }
  function errorCode(error) {
    if (error && error.name === 'SecurityError') return 'tainted';
    return error && error.message === 'empty-render' ? 'empty-render' : 'failed';
  }

  function pageStyles() {
    var body = document.body, root = document.documentElement;
    var bodyStyle = body ? getComputedStyle(body) : null, rootStyle = getComputedStyle(root);
    post({ type: 'semurai:page-styles', backgroundColor: bodyStyle ? bodyStyle.backgroundColor : '', rootBackgroundColor: rootStyle.backgroundColor,
      fontFamily: (bodyStyle || rootStyle).fontFamily, fontSize: (bodyStyle || rootStyle).fontSize });
  }
  if (document.readyState === 'complete') pageStyles(); else window.addEventListener('load', pageStyles, { once: true });

  var picking = false, hovered = null, box = null, cursor = null;
  function pickable(event) {
    var element = event.target instanceof Element ? event.target.closest('[data-od-id],[data-od-source-path]') : null;
    return element && element !== document.body && element !== document.documentElement && !element.closest('[' + UI + ']') ? element : null;
  }
  function highlight() {
    if (!box) return;
    if (!picking || !hovered || !hovered.isConnected) { box.hidden = true; return; }
    var rect = hovered.getBoundingClientRect();
    box.hidden = false;
    box.style.left = rect.left + 'px'; box.style.top = rect.top + 'px'; box.style.width = rect.width + 'px'; box.style.height = rect.height + 'px';
  }
  function setPicking(enabled) {
    picking = enabled; hovered = null;
    if (enabled && !box) {
      box = document.createElement('div'); box.setAttribute(UI, ''); box.hidden = true;
      box.style.cssText = 'position:fixed;z-index:2147483647;box-sizing:border-box;pointer-events:none;border:2px solid ${STUDIO_PREVIEW_ACCENT};border-radius:2px;background:rgba(26,116,255,.08);box-shadow:0 0 0 1px rgba(255,255,255,.9)';
      document.documentElement.appendChild(box);
      cursor = document.createElement('style'); cursor.setAttribute(UI, ''); cursor.textContent = '*{cursor:crosshair!important}';
      document.head.appendChild(cursor);
    }
    if (!enabled) { if (box) box.remove(); if (cursor) cursor.remove(); box = null; cursor = null; }
  }
  function swallow(event) { if (!picking) return; event.preventDefault(); event.stopImmediatePropagation(); }
  window.addEventListener('pointermove', function (event) { if (!picking) return; hovered = pickable(event); highlight(); }, true);
  ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'dblclick', 'contextmenu'].forEach(function (type) { window.addEventListener(type, swallow, true); });
  window.addEventListener('click', function (event) {
    if (!picking) return;
    swallow(event);
    var element = pickable(event);
    if (!element) return;
    var id = '';
    for (var i = 0; !id && i < IDS.length; i++) id = element.getAttribute(IDS[i]) || '';
    setPicking(false);
    post({ type: 'semurai:capture-picked', elementId: id, label: labelOf(element) });
  }, true);
  window.addEventListener('keydown', function (event) {
    if (!picking || event.key !== 'Escape') return;
    swallow(event); setPicking(false); post({ type: 'semurai:capture-pick-cancel' });
  }, true);
  window.addEventListener('scroll', highlight, true);
  window.addEventListener('message', function (event) {
    if (event.source !== parent || !event.data || typeof event.data !== 'object') return;
    var data = event.data;
    if (data.type === 'semurai:capture-pick') setPicking(!!data.enabled);
    if (data.type === 'semurai:page-styles-request') { try { pageStyles(); } catch (_) {} }
    if (data.type === 'semurai:capture-measure' && typeof data.id === 'string') {
      var result;
      try { result = measure(data.target); } catch (_) { result = { error: 'failed' }; }
      result.type = 'semurai:capture-measure:result'; result.id = data.id; post(result);
    }
    if (data.type === 'semurai:capture-render' && typeof data.id === 'string') {
      render(data).then(function (value) { post({ type: 'semurai:capture-render:result', id: data.id, blob: value.blob, width: value.width, height: value.height, fontsMissing: value.fontsMissing, fonts: value.fonts }); },
        function (error) { post({ type: 'semurai:capture-render:result', id: data.id, error: errorCode(error) }); });
    }
  });
})();`;
