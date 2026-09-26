import type { Metadata } from 'next';
import { SEMURAI_PRODUCT_NAME } from '../../src/semurai/branding';
import { SemuraiShareViewer } from '../../src/semurai/ShareViewer';

// Static shell of the public share viewer, served by creative-service at /s/<token>.
// The client reads the token from the URL, loads the shared project and sets the title.
export const metadata: Metadata = {
  title: SEMURAI_PRODUCT_NAME,
  applicationName: SEMURAI_PRODUCT_NAME,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: 'no-referrer',
};

export default function SemuraiSharePage() {
  return <SemuraiShareViewer />;
}
