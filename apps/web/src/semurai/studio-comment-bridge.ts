/**
 * The Studio accent (--blue in styles/tokens.css) for UI drawn inside the
 * preview iframe, which cannot read the host's CSS variables: comment markers,
 * the measurement tooltip and the edit selection guides.
 */
export const STUDIO_PREVIEW_ACCENT = '#1a74ff';
const ACCENT_STRONG = '#0f5fd6';
const RESOLVED = '#8a8a8a';

/** Trusted preview-only UI. The shadow tree never enters saved source or exports. */
export const STUDIO_COMMENT_BRIDGE = String.raw`(function () {
  var host = document.createElement('div');
  host.setAttribute('data-studio-comment-markers', '');
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none';
  document.documentElement.appendChild(host);
  var shadow = host.attachShadow({mode:'open'});
  var style = document.createElement('style');
  style.textContent = 'button{position:fixed;box-sizing:border-box;width:34px;height:34px;border:3px solid white;border-radius:50% 50% 50% 8px;background:${STUDIO_PREVIEW_ACCENT};color:white;font:600 13px/1 system-ui;box-shadow:0 2px 8px #0003;pointer-events:auto;cursor:pointer;padding:0}button:hover,button:focus-visible,button[aria-pressed=true]{background:${ACCENT_STRONG};outline:2px solid ${STUDIO_PREVIEW_ACCENT};outline-offset:2px}button[data-resolved=true]{background:${RESOLVED}}';
  shadow.appendChild(style);
  var tooltip = document.createElement('div');
  tooltip.dataset.studioMeasurement = '';
  tooltip.style.cssText = 'position:fixed;padding:5px 8px;border-radius:6px;background:${STUDIO_PREVIEW_ACCENT};color:white;font:600 11px/1.4 system-ui;box-shadow:0 2px 8px #0002;pointer-events:none';
  tooltip.hidden = true; shadow.appendChild(tooltip);
  var editing = false;
  window.addEventListener('pointermove', function(event) {
    if (!editing) { tooltip.hidden = true; return; }
    var element = event.target instanceof Element ? event.target.closest('[data-od-id]') : null;
    if (!element || element === host) { tooltip.hidden = true; return; }
    var box = element.getBoundingClientRect(), computed = getComputedStyle(element);
    tooltip.textContent = Math.round(box.width)+' × '+Math.round(box.height)+'px'+(element.textContent.trim() ? ' · '+computed.fontSize : '');
    tooltip.hidden = false;
    tooltip.style.left = Math.max(4, Math.min(innerWidth-tooltip.offsetWidth-4, box.left))+'px';
    tooltip.style.top = Math.max(4, box.top-30)+'px';
  }, true);
  window.addEventListener('pointerleave', function() { tooltip.hidden = true; });
  window.addEventListener('scroll', function() { tooltip.hidden = true; }, true);
  var items = [], enabled = true, selected = null, pending = false;
  function elementFor(target) {
    var element = null;
    try { if (target.elementId) element = document.querySelector('[data-od-id="'+CSS.escape(target.elementId)+'"]'); } catch (_) {}
    try { if (!element && target.selector) element = document.querySelector(target.selector); } catch (_) {}
    return element && element !== host ? element : null;
  }
  function render() {
    pending = false;
    var used = new Map();
    items.forEach(function(item) {
      var button = shadow.querySelector('[data-id="'+CSS.escape(item.id)+'"]');
      var element = elementFor(item.target);
      var rect = element && element.getBoundingClientRect();
      var visible = enabled && rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
      if (!button) {
        button = document.createElement('button'); button.type = 'button'; button.dataset.id = item.id;
        shadow.appendChild(button);
      }
      button.hidden = !visible;
      button.textContent = String(item.number);
      button.title = item.label + ' ' + item.number + ': ' + item.text;
      button.setAttribute('aria-label', button.title);
      button.setAttribute('aria-pressed', String(selected === item.id));
      button.dataset.resolved = String(item.resolved);
      if (!visible) { if (selected === item.id) parent.postMessage({type:'semurai:comment-position',id:item.id,x:0,y:0,visible:false},'*'); return; }
      var x = Math.max(3, Math.min(innerWidth-37, rect.left-14));
      var y = rect.top-14;
      if (y < -17 || y > innerHeight-8) { button.hidden = true; if (selected === item.id) parent.postMessage({type:'semurai:comment-position',id:item.id,x:0,y:0,visible:false},'*'); return; }
      y = Math.max(3, Math.min(innerHeight-37, y));
      var slot = Math.round(x/34)+':'+Math.round(y/34), offset = used.get(slot) || 0;
      used.set(slot, offset+1);
      button.style.left = Math.min(innerWidth-37, x+offset*37)+'px'; button.style.top = y+'px';
      if (selected === item.id) parent.postMessage({type:'semurai:comment-position',id:item.id,x:x+offset*37,y:y,visible:true},'*');
    });
    shadow.querySelectorAll('button').forEach(function(button) { if (!items.some(function(item) { return item.id === button.dataset.id; })) button.remove(); });
  }
  function schedule() { if (!pending) { pending = true; requestAnimationFrame(render); } }
  window.addEventListener('click', function(event) {
    var button = event.composedPath().find(function(node) { return node instanceof HTMLButtonElement && node.getRootNode() === shadow; });
    if (!button) return;
    event.preventDefault(); event.stopImmediatePropagation();
    parent.postMessage({type:'semurai:comment-open',id:button.dataset.id},'*');
  }, true);
  window.addEventListener('message', function(event) {
    if (event.source !== parent || !event.data) return;
    var data = event.data;
    if (data.type === 'od-edit-mode') { editing = !!data.enabled; tooltip.hidden = true; }
    if (data.type === 'semurai:comment-markers' && Array.isArray(data.items)) {
      items = data.items.slice(0,200).filter(function(item) { return item && typeof item.id === 'string' && item.target && typeof item.target.selector === 'string'; });
      enabled = !!data.enabled; selected = data.selected || null; schedule();
    }
    if (data.type === 'semurai:comment-focus') {
      var item = items.find(function(value) { return value.id === data.id; });
      var element = item && elementFor(item.target);
      if (element) { element.scrollIntoView({block:'center',inline:'nearest'}); selected = data.id; schedule(); }
    }
  });
  window.addEventListener('scroll', schedule, true);
  window.addEventListener('resize', schedule);
  document.addEventListener('load', schedule, true);
  new ResizeObserver(schedule).observe(document.documentElement);
  new MutationObserver(schedule).observe(document.body, {subtree:true,attributes:true,childList:true,characterData:true});
  parent.postMessage({type:'semurai:comment-markers-ready'},'*');
})();`;
