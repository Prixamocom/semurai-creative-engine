// Development-only fixtures for StudioDevHarness. Never imported by production code.
import type { StudioContext } from '../studio-context';

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

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
export const DEV_MEDIA = [
  { id: 'dev-media-1', title: 'Ziarno (próbka)', description: 'Obraz testowy', dataUrl: pixel },
  { id: 'dev-media-2', title: 'Paczka (próbka)', description: 'Obraz testowy', dataUrl: pixel },
];

export function devStudioContext(locale: StudioContext['project']['uiLocale'], origin: string): StudioContext {
  return {
    projectId: DEV_PROJECT_ID, workspaceId: 'dev-workspace', returnUrl: origin + '/app/creative/' + DEV_PROJECT_ID, expiresAt: Date.now() + 24 * 3_600_000,
    project: { title: 'Lumen Coffee Roasters (dev)', artifactType: 'page', locale, sourceLocale: locale, uiLocale: locale, direction: 'ltr', currentVersion: 1, coreOrigin: origin },
  };
}
