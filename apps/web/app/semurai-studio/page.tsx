import type { Metadata } from 'next';
import { SEMURAI_PRODUCT_NAME } from '../../src/semurai/branding';
import { SemuraiStudio } from '../../src/semurai/Studio';

// Static shell title; the client replaces it with "<project name> | Semurai Creative".
export const metadata: Metadata = {
  title: SEMURAI_PRODUCT_NAME,
  applicationName: SEMURAI_PRODUCT_NAME,
};

export default function SemuraiStudioPage() {
  return <SemuraiStudio />;
}
