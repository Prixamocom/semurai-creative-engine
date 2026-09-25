'use client';

import dynamic from 'next/dynamic';

// Development-only Studio harness (see src/semurai/dev). NODE_ENV is inlined at
// build time, so production builds drop the import and export an empty page.
const StudioDevHarness = process.env.NODE_ENV === 'development'
  ? dynamic(() => import('../../src/semurai/dev/StudioDevHarness').then(module => module.StudioDevHarness), { ssr: false })
  : null;

export default function SemuraiStudioDevPage() {
  return StudioDevHarness ? <StudioDevHarness /> : null;
}
