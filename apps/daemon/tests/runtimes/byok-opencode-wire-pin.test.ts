import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

const RUNTIME_DOCKERFILE = fileURLToPath(new URL('../../../../deploy/Dockerfile.semurai-runtime', import.meta.url));

// Semurai: gateway runs with `wireApi: 'responses'` reach `<gateway>/llm/v1/responses`
// only because OpenCode 1.18.30 bundles @ai-sdk/openai 3.0.88, has no custom loader
// for the `open-design-byok` provider id and calls `sdk.languageModel()`, which that
// SDK maps to the Responses API. A different OpenCode could silently fall back to
// /chat/completions, where gpt-6-luna (with reasoning) and gpt-6.1-sol return 400.
it('pins the OpenCode release the gateway Responses wiring was verified against', () => {
  const pins = readFileSync(RUNTIME_DOCKERFILE, 'utf8').match(/opencode-ai@[^\s]+/g) ?? [];
  expect(
    pins,
    'Before changing the OpenCode pin, re-verify that its bundled @ai-sdk/openai languageModel() still maps to '
      + 'the Responses API and that OpenCode has no custom loader for provider id "open-design-byok" '
      + '(see the openai case in src/runtimes/byok-opencode.ts), then update this test.',
  ).toEqual(['opencode-ai@1.18.30']);
});
