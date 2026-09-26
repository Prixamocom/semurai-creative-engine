// Development-only fixtures for StudioDevHarness. Never imported by production code.
import { DECK_SKELETON_HTML } from '@open-design/contracts';
import type { StudioContext } from '../studio-context';
import type { PublicComment, ShareItem } from '../studio-share';

export const DEV_PROJECT_ID = '00000000-0000-4000-8000-00000000de70';
export const DEV_SESSION_PATH = '/semurai-studio-dev/session/';

const block = (color: string, label: string) => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" fill="${color}"/><text x="320" y="214" font-family="Arial" font-size="28" fill="#ffffff" text-anchor="middle">${label}</text></svg>`);

/** A realistic landing page, taller than the viewport, used as the harness document. */
export const DEV_LANDING_HTML = `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><title>Lumen Coffee Roasters</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#1d1d1f;background:#fbfaf7}
.nav{display:flex;align-items:center;justify-content:space-between;padding:20px 64px;border-bottom:1px solid #ece8e1}
.logo{font-weight:700;font-size:20px;letter-spacing:-.3px}.links{display:flex;gap:28px}.links a{color:#4a4a4a;text-decoration:none;font-size:15px}
.hero{padding:120px 64px 96px;max-width:980px}.hero h1{font-size:64px;line-height:1.05;letter-spacing:-1.5px;margin:0 0 24px}
.hero p{font-size:20px;line-height:1.6;color:#5b5b5b;max-width:620px;margin:0 0 36px}.ctas{display:flex;gap:14px}
.button{display:inline-block;padding:14px 22px;border-radius:10px;background:#1d1d1f;color:#fff;text-decoration:none;font-weight:600}
.button.secondary{background:transparent;color:#1d1d1f;border:1px solid #cfc9bf}
.features{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;padding:64px}
.card{background:#fff;border:1px solid #ece8e1;border-radius:16px;overflow:hidden}.card img{display:block;width:100%;height:180px;object-fit:cover}
.card h3{font-size:22px;margin:20px 20px 8px}.card p{margin:0 20px 24px;line-height:1.6;color:#5b5b5b}
.quote{padding:96px 64px;text-align:center;background:#f1ede6}.quote blockquote{font-size:32px;line-height:1.4;max-width:820px;margin:0 auto 20px}
.quote cite{color:#6b6b6b;font-style:normal}
.pricing{padding:96px 64px}.pricing h2{font-size:40px;margin:0 0 32px}.plans{display:flex;gap:24px}
.plan{flex:1;padding:32px;border-radius:16px;border:1px solid #ece8e1;background:#fff}.plan strong{display:block;font-size:36px;margin:12px 0}
.footer{display:flex;justify-content:space-between;align-items:center;padding:32px 64px;border-top:1px solid #ece8e1;color:#6b6b6b;font-size:14px}
.footer nav{display:flex;gap:20px}.footer a{color:inherit}
</style></head>
<body>
<nav class="nav"><div class="logo">Lumen</div><div class="links"><a href="#features">Oferta</a><a href="#pricing">Cennik</a><a href="#contact">Kontakt</a></div></nav>
<header class="hero"><h1>Kawa palona w małych partiach, prosto do Twoich drzwi</h1>
<p>Wybieramy ziarno od sprawdzonych farm, palimy je co tydzień i wysyłamy w ciągu 48 godzin. Bez półek sklepowych i bez starej kawy.</p>
<div class="ctas"><a class="button" href="https://example.com/sklep">Zamów pierwszą paczkę</a><a class="button secondary" href="https://example.com/o-nas">Poznaj palarnię</a></div></header>
<section class="features" id="features">
<article class="card"><img src="${block('#c26a3d', 'Ziarno')}" alt="Świeże ziarno kawy"><h3>Świeże ziarno</h3><p>Palimy w poniedziałek, wysyłamy we wtorek. Na każdej paczce data palenia.</p></article>
<article class="card"><img src="${block('#3d6ec2', 'Subskrypcja')}" alt="Paczka subskrypcji"><h3>Elastyczna subskrypcja</h3><p>Zmieniasz częstotliwość i wstrzymujesz dostawy jednym kliknięciem.</p></article>
<article class="card"><img src="${block('#3da57a', 'Farmy')}" alt="Plantacja kawy"><h3>Uczciwe farmy</h3><p>Płacimy powyżej ceny giełdowej i znamy każdego producenta z nazwiska.</p></article>
</section>
<section class="quote"><blockquote>Najlepsza kawa, jaką piłam w domu. Poranki zaczynają się teraz o wiele lepiej.</blockquote><cite>Anna, klientka od 2024 roku</cite></section>
<section class="pricing" id="pricing"><h2>Cennik</h2><div class="plans">
<div class="plan"><span>Solo</span><strong>49 zł</strong><p>250 g co dwa tygodnie</p></div>
<div class="plan"><span>Duet</span><strong>89 zł</strong><p>500 g co dwa tygodnie</p></div>
<div class="plan"><span>Biuro</span><strong>229 zł</strong><p>1,5 kg co tydzień</p></div>
</div></section>
<footer class="footer" id="contact"><span>© 2026 Lumen Coffee Roasters</span><nav><a href="https://example.com/regulamin">Regulamin</a><a href="https://example.com/prywatnosc">Prywatność</a></nav></footer>
</body></html>`;

/**
 * A second project file, so the harness exercises the file switcher and the
 * Tweaks tab (its styles use :root variables). Its headings use a Google Font
 * (Playfair Display) to check the font proxy rewrite in the preview and PNG
 * capture (open the harness with ?fontProxy=<creative-service origin>).
 */
export const DEV_ABOUT_HTML = `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><title>O nas</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&amp;display=swap">
<style>
:root {
  --color-ink: #1d1d1f;
  --color-muted: #5b5b5b;
  --color-paper: #fbfaf7;
  --color-accent: #c26a3d;
  --font-body: Arial, Helvetica, sans-serif;
  --font-heading: 'Playfair Display', Georgia, serif;
  --font-size-title: 48px;
  --line-height-body: 1.7;
  --space-page: 96px;
  --radius-card: 16px;
  --measure: 760px;
  --title-color: var(--color-ink);
}
body{margin:0;font-family:var(--font-body);color:var(--color-ink);background:var(--color-paper)}main{max-width:var(--measure);margin:0 auto;padding:var(--space-page) 32px}h1{font-family:var(--font-heading);font-size:var(--font-size-title);margin:0 0 20px;color:var(--title-color)}p{font-size:18px;line-height:var(--line-height-body);color:var(--color-muted)}.note{padding:20px 24px;border-radius:var(--radius-card);background:#fff;border-left:4px solid var(--color-accent)}
</style></head>
<body><main><h1>O palarni Lumen</h1><p>Zaczęliśmy w 2019 roku od jednego pieca i trzech odmian ziarna. Dziś palimy dwanaście kaw z ośmiu krajów, ale każdą partię nadal sprawdzamy ręcznie.</p><p class="note">Odwiedź nas w każdą sobotę na degustacji w Krakowie.</p></main></body></html>`;

/** A three-slide deck built on the upstream deck skeleton (open with ?fixture=deck). */
export const DEV_DECK_HTML = DECK_SKELETON_HTML
  .replace(/<section class="slide active"[\s\S]*<\/section>/, [
    '<style>.slide{padding:120px 160px;background:#fbfaf7;color:#1d1d1f;font-family:Arial,Helvetica,sans-serif}.slide h1{font-size:120px;margin:0 0 40px}.slide h2{font-size:80px;margin:0 0 32px}.slide p{font-size:40px;line-height:1.5;color:#5b5b5b}</style>',
    '<section class="slide active" data-screen-label="01 Tytuł"><h1>Lumen 2027</h1><p>Plan rozwoju palarni na kolejny rok</p></section>',
    '<section class="slide" data-screen-label="02 Wyniki"><h2>Wyniki 2026</h2><p>1 240 aktywnych subskrypcji, 18 ton kawy, 4,8 w opiniach klientów.</p></section>',
    '<section class="slide" data-screen-label="03 Plan"><h2>Co dalej</h2><p>Nowa linia kaw z Etiopii, sklep stacjonarny w Krakowie i subskrypcje dla biur.</p></section>',
  ].join('\n'));

const pixel ='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
export const DEV_MEDIA = [
  { id: 'dev-media-1', title: 'Ziarno (próbka)', description: 'Obraz testowy', dataUrl: pixel },
  { id: 'dev-media-2', title: 'Paczka (próbka)', description: 'Obraz testowy', dataUrl: pixel },
];

export type DevFixture = 'page' | 'deck';

export const DEV_FIRST_PROMPT = 'Stwórz stronę główną palarni kawy Lumen w stylu ciepłego minimalizmu, z sekcją oferty, opinią klientki, cennikiem trzech planów i stopką; zdjęcia produktów weź z https://example.com/media/lumen-coffee-roasters/katalog-produktow-2026/zdjecia-w-wysokiej-rozdzielczosci/paczki-kawy-250g-500g-1500g i dopasuj kolory do marki.';

/** The harness document for a fixture: a two-file landing page or a deck. */
export function devDocument(fixture: DevFixture) {
  return fixture === 'deck'
    ? { version: 1, kind: 'presentation', name: 'Lumen 2027', html: DEV_DECK_HTML, notes: ['Przywitaj się i przedstaw cel spotkania.', 'Podkreśl wzrost subskrypcji.', ''] }
    : { version: 1, kind: 'page', name: 'Lumen', html: DEV_LANDING_HTML, files: [{ path: 'o-nas.html', content: DEV_ABOUT_HTML }], notes: [] };
}

/**
 * Seed comments: one open and one resolved, so the counts can be checked. The
 * deck gets share-link guest comments on slides 1 and 2, so each slide shows
 * only its own pin.
 */
export function devComments(fixture: DevFixture) {
  const created_at = new Date().toISOString();
  const target = (label: string, selector: string) => ({ file: 'index.html', version: 1, label, selector, text: '' });
  const slideTarget = (slideIndex: number) => ({ file: 'index.html', version: 1, label: 'Slajd ' + (slideIndex + 1), selector: 'body', text: '', slideIndex });
  return fixture === 'deck' ? [
    { id: 'dev-comment-deck-1', text: 'Czy możemy dodać zdjęcie zespołu?', target: slideTarget(0), resolved: false, revision: 1, author: 'Marta (klient)', author_kind: 'guest' as const, created_at, replies: [] },
    { id: 'dev-comment-deck-2', text: 'Te liczby warto pokazać na wykresie.', target: slideTarget(1), resolved: false, revision: 1, author: 'Marta (klient)', author_kind: 'guest' as const, created_at, replies: [] },
  ] : [
    { id: 'dev-comment-1', text: 'Nagłówek jest za długi, skróćmy go do jednej linii.', target: target('h1', '.hero h1'), resolved: false, revision: 1, author: 'Anna', created_at, replies: [] },
    { id: 'dev-comment-2', text: 'Cennik wygląda dobrze.', target: target('h2', '.pricing h2'), resolved: true, revision: 1, author: 'Anna', created_at, replies: [] },
  ];
}

export function devStudioContext(locale: StudioContext['project']['uiLocale'], origin: string, fixture: DevFixture = 'page'): StudioContext {
  return {
    projectId: DEV_PROJECT_ID, workspaceId: 'dev-workspace', returnUrl: origin + '/app/creative/' + DEV_PROJECT_ID, expiresAt: Date.now() + 24 * 3_600_000,
    project: { title: fixture === 'deck' ? 'Lumen 2027 (dev)' : 'Lumen Coffee Roasters (dev)', artifactType: fixture === 'deck' ? 'presentation' : 'page', locale, sourceLocale: locale, uiLocale: locale, direction: 'ltr', currentVersion: 1, coreOrigin: origin },
  };
}

/** A share token of the right shape for the harness viewer (?share=comment|view|gone|limited). */
export const DEV_SHARE_TOKEN = 'DevShareToken0123456789_abcdefghijklmnopqrs';

/** Two links for the Studio share dialog: an active comment link and an expired view link. */
export function devShares(): ShareItem[] {
  const day = 86_400_000;
  return [
    { id: '00000000-0000-4000-8000-0000000051a1', permission: 'comment', label: 'Dla klienta', status: 'active', url: 'https://creative.semur.ai/s/' + DEV_SHARE_TOKEN,
      created_at: new Date(Date.now() - 3 * day).toISOString(), expires_at: new Date(Date.now() + 27 * day).toISOString(), last_viewed_at: new Date(Date.now() - 3_600_000).toISOString(), view_count: 12, guest_comment_count: 3 },
    { id: '00000000-0000-4000-8000-0000000051a2', permission: 'view', label: null, status: 'expired', url: 'https://creative.semur.ai/s/' + DEV_SHARE_TOKEN.split('').reverse().join(''),
      created_at: new Date(Date.now() - 20 * day).toISOString(), expires_at: new Date(Date.now() - 13 * day).toISOString(), last_viewed_at: null, view_count: 1, guest_comment_count: 0 },
  ];
}

/** An in-memory stand-in for creative-service's /s/<token>/api/* proxy. */
export function devShareFetch(fixture: DevFixture, mode: 'comment' | 'view' | 'gone' | 'limited'): typeof fetch {
  const document = devDocument(fixture);
  const created_at = new Date(Date.now() - 7_200_000).toISOString();
  // As the public API answers: open threads only, member names withheld (author null).
  let comments: PublicComment[] = [
    { id: 'dev-share-1', text: 'Czy możemy dodać zdjęcie zespołu?', target: { file: 'index.html', version: 1, label: fixture === 'deck' ? 'Slajd 1' : 'Cała strona', selector: 'body', text: '', ...(fixture === 'deck' ? { slideIndex: 0 } : {}) },
      resolved: false, revision: 2, created_at, author: 'Marta (klient)', author_kind: 'guest',
      replies: [{ id: 'dev-share-1-r', text: 'Tak, dodamy w kolejnej wersji.', author: null, author_kind: 'member', created_at }] },
    { id: 'dev-share-2', text: 'Nagłówek jest za długi.', target: { file: 'index.html', version: 1, label: 'h1', selector: fixture === 'deck' ? '.slide h1' : '.hero h1', text: '' },
      resolved: false, revision: 1, created_at, author: null, author_kind: 'member', replies: [] },
  ];
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(status === 404 ? { error: 'creative.share_not_found' } : { data }), { status, headers: { 'Content-Type': 'application/json' } });
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const endpoint = new URL(url, window.location.href).pathname.split('/api/')[1];
    await new Promise(resolve => setTimeout(resolve, 250));
    if (mode === 'gone') return json(null, 404);
    if (endpoint === 'share') return json({ share: { permission: mode === 'view' ? 'view' : 'comment', expires_at: null },
      project: { title: fixture === 'deck' ? 'Lumen 2027' : 'Lumen Coffee Roasters', artifact_type: fixture === 'deck' ? 'presentation' : 'page', locale: 'pl', direction: 'ltr' },
      document: { version: 1, document_hash: 'dev-hash-1', name: document.name, html: document.html, files: 'files' in document ? document.files : [] } });
    if (endpoint !== 'comments' || mode === 'view') return json(null, 404);
    if (init?.method !== 'POST') return json(comments);
    if (mode === 'limited') return new Response(JSON.stringify({ error: { code: 'rate_limited', retryable: true } }), { status: 429 });
    const body = JSON.parse(String(init.body));
    const now = new Date().toISOString();
    if (body.action === 'create') comments = [...comments, { id: body.id, text: body.text, target: body.target, resolved: false, revision: 1, created_at: now, author: body.guest_name, author_kind: 'guest', replies: [] }];
    else comments = comments.map(item => item.id !== body.id ? item : { ...item, revision: item.revision + 1, replies: [...item.replies, { id: body.reply_id, text: body.text, author: body.guest_name, author_kind: 'guest', created_at: now }] });
    return json(comments);
  };
}
