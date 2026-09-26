/**
 * Google Fonts in the Studio preview, served through our own font proxy.
 * End-user browsers must never contact Google (GDPR), so the preview rewrites
 * a design's Google Fonts references to the creative-service proxy on the
 * Studio page origin: `https://fonts.googleapis.com/css2?...` becomes
 * `<origin>/gf/css2?...` (the v1 `/css` API likewise) and a direct
 * `https://fonts.gstatic.com/<path>` font source becomes `<origin>/gf/s/<path>`.
 * The proxy answers with CSS whose sources point at `/gf/s/...` too.
 *
 * The rewrite only exists in the derived preview document; the saved source
 * and the HTML download keep the original Google links. Every other author
 * <link> and @import stays stripped, and the preview CSP allows only the
 * proxy origin (studio-preview.ts). The origin is absolute because the srcdoc
 * preview has an opaque origin.
 */
const STYLE_HOST = 'fonts.googleapis.com';
const FONT_FILE = /^s\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)+\.(?:woff2|woff|ttf)$/;
const MAX_PROXY_QUERY = 512;

function validOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.origin === value ? value : null;
  } catch { return null; }
}

let originOverride: string | null = null;
/**
 * Serve fonts from another origin than the Studio page (the dev harness points
 * this at a locally running creative-service). Null restores the default.
 */
export function setStudioFontProxyOrigin(origin: string | null): void {
  originOverride = validOrigin(origin);
}
/** The font proxy origin: the Studio page origin at runtime, or null where there is none (no fonts then). */
export function studioFontProxyOrigin(): string | null {
  return originOverride ?? validOrigin(typeof window === 'undefined' ? null : window.location.origin);
}

/**
 * A Google Fonts stylesheet URL (https://fonts.googleapis.com/css or /css2,
 * no credentials or port), normalized, or null. Protocol-relative, http:,
 * data: and look-alike hosts (evil.example/fonts.googleapis.com) are rejected.
 */
export function studioFontStylesheetHref(href: string): string | null {
  const text = href.trim();
  if (!/^https:\/\//i.test(text)) return null;
  let url: URL;
  try { url = new URL(text); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hostname !== STYLE_HOST || !/^\/css2?$/.test(url.pathname)) return null;
  return url.href;
}

/** The proxy URL for a Google Fonts stylesheet, or null (not Google, no proxy origin, overlong query). */
export function studioFontProxyHref(href: string, origin: string | null): string | null {
  const google = studioFontStylesheetHref(href);
  if (!google || !origin) return null;
  const url = new URL(google);
  if (url.search.length > MAX_PROXY_QUERY + 1) return null;
  return origin + '/gf' + url.pathname + url.search;
}

/** The proxy URL for a fonts.gstatic.com font file, or null. */
export function studioFontFileProxyHref(href: string, origin: string | null): string | null {
  const match = /^https:\/\/fonts\.gstatic\.com\/([^?#]+)$/.exec(href.trim());
  const path = match?.[1];
  if (!path || !origin || !FONT_FILE.test(path) || path.split('/').some(segment => segment === '.' || segment === '..')) return null;
  // The proxy mirrors the fonts.gstatic.com path under /gf/s/ (so s/<family>/... becomes /gf/s/s/<family>/...).
  return origin + '/gf/s/' + path;
}

/**
 * The design's Google Fonts stylesheets, rewritten to the proxy, in document
 * order: rel=stylesheet links on fonts.googleapis.com. Preconnect hints,
 * alternate stylesheets and every other link are left out.
 */
export function studioFontLinks(doc: Document, origin: string | null): string[] {
  const links: string[] = [];
  for (const link of doc.querySelectorAll('link[href]')) {
    const rel = (link.getAttribute('rel') ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!rel.includes('stylesheet') || rel.includes('alternate')) continue;
    const href = studioFontProxyHref(link.getAttribute('href') ?? '', origin);
    if (href && !links.includes(href)) links.push(href);
  }
  return links;
}

/**
 * Comments and strings pass through untouched. An @import survives only when
 * it loads a Google Fonts stylesheet with a plain media list, rewritten to the
 * proxy; a url() on fonts.gstatic.com points at the proxy (or nowhere when the
 * path is not a font file). Google Fonts URLs contain semicolons
 * (`wght@400;700`), so URLs are read as url() or string tokens.
 */
const FONT_CSS_PATTERN = /(\/\*[\s\S]*?\*\/)|url\(\s*(["']?)(https:\/\/fonts\.gstatic\.com\/[^"'()\s]*)\2\s*\)|("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*')|@import\s*(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^'"()\s]*))\s*\)|"([^"]*)"|'([^']*)')?([^;{}]*);?/gi;

export function studioRewriteFontCss(css: string, origin: string | null): string {
  return css.replace(FONT_CSS_PATTERN, (match, comment: string | undefined, _quote: string | undefined, file: string | undefined, literal: string | undefined, ...groups: (string | undefined)[]) => {
    if (comment !== undefined || literal !== undefined) return match;
    if (file !== undefined) {
      const proxied = studioFontFileProxyHref(file, origin);
      return proxied ? 'url("' + proxied + '")' : 'url(about:invalid)';
    }
    const url = groups.slice(0, 5).find(value => value !== undefined);
    const media = (groups[5] ?? '').trim();
    const href = url === undefined ? null : studioFontProxyHref(url, origin);
    if (!href || /url\(|["'\\]/i.test(media)) return '';
    return '@import url("' + href + '")' + (media ? ' ' + media : '') + ';';
  });
}

/**
 * Font inlining for the PNG capture, as a JS expression evaluated inside the
 * sandboxed preview (the capture bridge embeds it; tests evaluate it with a
 * mocked fetch). `embed(doc, { origin, cache })` resolves to
 *   { css, missing, fetched }
 * where `css` holds @font-face rules with data: URLs for the proxied Google
 * Fonts faces the document actually uses, `missing` says some font could not
 * be embedded (the capture still succeeds with fallback fonts) and `fetched`
 * maps each newly downloaded proxy URL (stylesheet text or font data: URL) so
 * the host can cache it for the Studio session and hand it back next time.
 * Only URLs on `origin` (the font proxy) are ever fetched.
 *
 * Used faces are the entries of document.fonts with status "loaded", matched
 * to the @font-face rules of the proxied stylesheets (fetched again as text,
 * because cross-origin sheets do not expose cssRules) and of the document's
 * own <style> blocks. Without the Font Loading API every parsed face is a
 * candidate, capped by count.
 */
export const STUDIO_FONT_INLINER = String.raw`(function (win) {
  var MAX_FACES = 48, MAX_FONT_BYTES = 4000000, MAX_TOTAL_BYTES = 16000000;
  // A URL on the font proxy origin: a stylesheet (/gf/css, /gf/css2) or a font file (/gf/s/...).
  function proxied(href, origin, kind) {
    if (typeof href !== 'string' || !origin) return null;
    var url;
    try { url = new URL(href.trim()); } catch (_) { return null; }
    if (url.origin !== origin || url.username || url.password) return null;
    if (kind === 'css' ? !/^\/gf\/css2?$/.test(url.pathname) : url.pathname.indexOf('/gf/s/') !== 0) return null;
    return url.href;
  }
  function unquote(value) { return String(value || '').trim().replace(/^(['"])([\s\S]*)\1$/, '$2').trim(); }
  function descriptor(body, name) {
    var match = body.match(new RegExp('(?:^|[;\\s])' + name + '\\s*:\\s*([^;]*)', 'i'));
    return match ? match[1].trim() : '';
  }
  function weightKey(value) {
    return String(value || 'normal').trim().toLowerCase().split(/\s+/).map(function (part) { return part === 'normal' ? '400' : part === 'bold' ? '700' : part; }).join(' ');
  }
  function rangeKey(value) {
    var parts = String(value || '').toUpperCase().split(',').map(function (part) {
      var text = part.trim().replace(/^U\+/, ''), bounds;
      if (!text) return null;
      if (text.indexOf('?') >= 0) bounds = [text.replace(/\?/g, '0'), text.replace(/\?/g, 'F')];
      else bounds = text.split('-');
      var start = parseInt(bounds[0], 16), end = parseInt(bounds[1] === undefined ? bounds[0] : bounds[1], 16);
      return isFinite(start) && isFinite(end) ? start.toString(16) + '-' + end.toString(16) : null;
    }).filter(Boolean).sort();
    return parts.length ? parts.join(',') : '0-10ffff';
  }
  function faceKey(family, style, weight, range) {
    return [unquote(family).toLowerCase(), String(style || 'normal').trim().toLowerCase(), weightKey(weight), rangeKey(range)].join('|');
  }
  function parseFaces(css, base, origin) {
    var faces = [];
    var blocks = String(css || '').replace(/\/\*[\s\S]*?\*\//g, '').match(/@font-face\s*\{[^}]*\}/gi) || [];
    blocks.forEach(function (block) {
      var body = block.slice(block.indexOf('{') + 1, -1);
      var family = unquote(descriptor(body, 'font-family'));
      if (!family) return;
      var pattern = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^'"()\s]*))\s*\)\s*(?:format\(\s*['"]?([\w-]+)['"]?\s*\))?/gi, match, chosen = null;
      while ((match = pattern.exec(body))) {
        var raw = match[1] !== undefined ? match[1] : match[2] !== undefined ? match[2] : match[3], resolved;
        // Inline author rules have no base: only absolute font URLs count there.
        try { resolved = (base ? new URL(raw, base) : new URL(raw)).href; } catch (_) { continue; }
        var url = proxied(resolved, origin, 'font');
        if (!url) continue;
        var format = (match[4] || '').toLowerCase();
        if (!chosen || (format === 'woff2' && chosen.format !== 'woff2')) chosen = { url: url, format: format };
      }
      if (!chosen) return;
      var style = descriptor(body, 'font-style') || 'normal', weight = descriptor(body, 'font-weight') || 'normal';
      var stretch = descriptor(body, 'font-stretch'), range = descriptor(body, 'unicode-range');
      faces.push({ family: family, style: style, weight: weight, stretch: stretch, range: range, url: chosen.url, format: chosen.format, key: faceKey(family, style, weight, range) });
    });
    return faces;
  }
  function importUrls(css, origin) {
    var urls = [], pattern = /@import\s*(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^'"()\s]*))\s*\)|"([^"]*)"|'([^']*)')/gi, match;
    while ((match = pattern.exec(String(css || '')))) {
      var raw = [match[1], match[2], match[3], match[4], match[5]].filter(function (value) { return value !== undefined; })[0];
      var url = proxied(raw, origin, 'css');
      if (url) urls.push(url);
    }
    return urls;
  }
  function sources(doc, origin) {
    var sheets = [], inline = [];
    [].slice.call(doc.querySelectorAll('link[href]')).forEach(function (link) {
      var rel = String(link.getAttribute('rel') || '').toLowerCase().split(/\s+/);
      if (rel.indexOf('stylesheet') < 0 || rel.indexOf('alternate') >= 0) return;
      var url = proxied(link.getAttribute('href'), origin, 'css');
      if (url && sheets.indexOf(url) < 0) sheets.push(url);
    });
    [].slice.call(doc.querySelectorAll('style')).forEach(function (style) {
      var text = style.textContent || '';
      importUrls(text, origin).forEach(function (url) { if (sheets.indexOf(url) < 0) sheets.push(url); });
      inline.push(text);
    });
    return { sheets: sheets, inline: inline };
  }
  function loadedFaces(doc) {
    var set = doc.fonts;
    if (!set || typeof set.forEach !== 'function') return null;
    var loaded = [];
    try { set.forEach(function (face) { if (face && face.status === 'loaded') loaded.push({ family: unquote(face.family).toLowerCase(), key: faceKey(face.family, face.style, face.weight, face.unicodeRange) }); }); }
    catch (_) { return null; }
    return loaded;
  }
  function timed(promise, ms) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error('timeout')); }, ms);
      promise.then(function (value) { clearTimeout(timer); resolve(value); }, function (error) { clearTimeout(timer); reject(error); });
    });
  }
  function base64(buffer) {
    var bytes = new Uint8Array(buffer), chunks = [];
    for (var i = 0; i < bytes.length; i += 0x8000) chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)));
    return win.btoa(chunks.join(''));
  }
  function embed(doc, options) {
    options = options || {};
    var fetchFn = options.fetch || (win.fetch && win.fetch.bind(win));
    var cache = options.cache && typeof options.cache === 'object' ? options.cache : {};
    var timeout = options.timeout || 8000, total = options.total || 20000;
    var origin = typeof options.origin === 'string' && /^https?:\/\/[^\/?#]+$/.test(options.origin) ? options.origin : null;
    var fetched = {}, state = { missing: false, bytes: 0 };
    function cached(url) { return typeof cache[url] === 'string' ? cache[url] : typeof fetched[url] === 'string' ? fetched[url] : null; }
    function request(url) {
      if (!fetchFn) return Promise.reject(new Error('unavailable'));
      return timed(Promise.resolve(fetchFn(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' })), timeout)
        .then(function (response) { if (!response || !response.ok) throw new Error('http'); return response; });
    }
    function sheet(url) {
      var known = cached(url);
      if (known !== null) return Promise.resolve(known);
      return request(url).then(function (response) { return timed(response.text(), timeout); })
        .then(function (text) { fetched[url] = text; return text; }, function () { state.missing = true; return ''; });
    }
    function font(face) {
      var known = cached(face.url);
      if (known !== null) return Promise.resolve(known);
      return request(face.url).then(function (response) {
        var type = String(response.headers && response.headers.get ? response.headers.get('content-type') || '' : '').split(';')[0].trim().toLowerCase();
        if (face.format === 'woff2' || /\.woff2(?:$|\?)/.test(face.url) || !/^[\w.+-]+\/[\w.+-]+$/.test(type)) type = face.format === 'woff' ? 'font/woff' : face.format === 'truetype' ? 'font/ttf' : 'font/woff2';
        return timed(response.arrayBuffer(), timeout).then(function (buffer) {
          if (!buffer || !buffer.byteLength || buffer.byteLength > MAX_FONT_BYTES || state.bytes + buffer.byteLength > MAX_TOTAL_BYTES) throw new Error('size');
          state.bytes += buffer.byteLength;
          var data = 'data:' + type + ';base64,' + base64(buffer);
          fetched[face.url] = data; return data;
        });
      }).then(null, function () { state.missing = true; return null; });
    }
    var found = sources(doc, origin);
    var work = Promise.all(found.sheets.map(function (url) { return sheet(url).then(function (text) { return parseFaces(text, url, origin); }); }))
      .then(function (lists) {
        var faces = [].concat.apply([], lists).concat([].concat.apply([], found.inline.map(function (text) { return parseFaces(text, null, origin); })));
        var loaded = loadedFaces(doc), used = [], seen = {};
        if (loaded) {
          var keys = {}, families = {};
          loaded.forEach(function (face) { keys[face.key] = true; });
          faces.forEach(function (face) { families[unquote(face.family).toLowerCase()] = true; });
          used = faces.filter(function (face) { return keys[face.key]; });
          // A loaded web font from these sheets that no parsed rule matches cannot be embedded.
          var matched = {};
          used.forEach(function (face) { matched[face.key] = true; });
          if (loaded.some(function (face) { return families[face.family] && !matched[face.key]; })) state.missing = true;
        } else used = faces;
        used = used.filter(function (face) { var id = face.key + ' ' + face.url; if (seen[id]) return false; seen[id] = true; return true; });
        if (used.length > MAX_FACES) { state.missing = true; used = used.slice(0, MAX_FACES); }
        return Promise.all(used.map(function (face) { return font(face).then(function (data) { return data ? { face: face, data: data } : null; }); }));
      })
      .then(function (entries) {
        return entries.filter(Boolean).map(function (entry) {
          var face = entry.face;
          return '@font-face{font-family:"' + face.family.replace(/["\\]/g, '') + '";font-style:' + face.style + ';font-weight:' + face.weight
            + (face.stretch ? ';font-stretch:' + face.stretch : '') + (face.range ? ';unicode-range:' + face.range : '')
            + ';font-display:block;src:url("' + entry.data + '")}';
        }).join('\n');
      });
    return timed(work, total).then(function (css) { return { css: css, missing: state.missing, fetched: fetched }; },
      function () { return { css: '', missing: true, fetched: fetched }; });
  }
  return { embed: embed, parseFaces: parseFaces, faceKey: faceKey };
})`;
