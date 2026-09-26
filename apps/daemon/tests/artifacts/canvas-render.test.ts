import { createAutomaticProjectStrategyBinding, readVerifiedProjectStrategyBinding } from '../../src/plugins/strategy-binding.js';
import { describe, expect, it } from 'vitest';
import { canvasRenderGatewayFontUrl, canvasRenderRequestAllowed, canvasRenderViaGateway } from '../../src/artifacts/canvas-render.js';
import { isArtifactPath } from '../../src/runtimes/run-artifacts.js';

describe('Canvas rendering boundary', () => {
  const entry = 'https://semur.ai/canvas-render/';
  it('allows rendering and fonts but denies APIs, arbitrary servers and writes', () => {
    for (const url of [entry, 'https://semur.ai/_nuxt/component.js', 'https://fonts.gstatic.com/font.woff2']) expect(canvasRenderRequestAllowed(url, entry, 'GET')).toBe(true);
    for (const url of ['https://semur.ai/api/canvas/documents', 'http://169.254.169.254/', 'https://images.example.com/x.jpg', 'https://semur.ai.evil.test/_nuxt/x', 'file:///etc/passwd']) expect(canvasRenderRequestAllowed(url, entry, 'GET')).toBe(false);
    expect(canvasRenderRequestAllowed(entry, entry, 'POST')).toBe(false);
    // The public origin never exposes the gateway font paths.
    expect(canvasRenderRequestAllowed('https://semur.ai/gf/css2?family=Inter', entry, 'GET')).toBe(false);
    expect(canvasRenderGatewayFontUrl('https://fonts.googleapis.com/css2?family=Inter', new URL(entry))).toBeNull();
  });
  it('renders through the Semurai gateway over plain http with fonts served by the gateway', () => {
    const gateway = 'http://semurai-creative-service:8081/canvas-render/';
    const entryUrl = new URL(gateway);
    expect(canvasRenderViaGateway(entryUrl)).toBe(true);
    for (const local of ['http://localhost:3000/canvas-render/', 'http://127.0.0.1/canvas-render/', 'http://semur.ai/canvas-render/', 'https://semur.ai/canvas-render/']) {
      expect(canvasRenderViaGateway(new URL(local))).toBe(false);
    }
    for (const url of [gateway, 'http://semurai-creative-service:8081/_nuxt/app.js', 'http://semurai-creative-service:8081/gf/css2?family=Inter',
      'http://semurai-creative-service:8081/gf/s/inter/v1/a.woff2', 'https://fonts.googleapis.com/css2?family=Inter', 'https://fonts.gstatic.com/s/inter/v1/a.woff2']) {
      expect(canvasRenderRequestAllowed(url, gateway, 'GET')).toBe(true);
    }
    for (const url of ['http://semurai-creative-service:8081/llm/v1/chat/completions', 'http://semurai-creative-service:8081/api/x', 'http://semurai-creative-service:8081/gf/other',
      'http://semurai-creative-service:9999/_nuxt/app.js', 'http://other-container:8081/_nuxt/app.js', 'https://semurai-creative-service:8081/_nuxt/app.js', 'http://fonts.googleapis.com/css2?family=Inter']) {
      expect(canvasRenderRequestAllowed(url, gateway, 'GET')).toBe(false);
    }
    expect(canvasRenderGatewayFontUrl('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap', entryUrl))
      .toBe('http://semurai-creative-service:8081/gf/css2?family=Inter:wght@400;700&display=swap');
    expect(canvasRenderGatewayFontUrl('https://fonts.gstatic.com/s/inter/v1/a.woff2', entryUrl)).toBe('http://semurai-creative-service:8081/gf/s/inter/v1/a.woff2');
    expect(canvasRenderGatewayFontUrl('https://fonts.googleapis.com/icon?family=Material+Icons', entryUrl)).toBeNull();
    expect(canvasRenderGatewayFontUrl('http://semurai-creative-service:8081/_nuxt/app.js', entryUrl)).toBeNull();
  });
  it('counts native JSON writes without accepting every configuration file', () => {
    expect(isArtifactPath('/workspace/design.json')).toBe(true);
    expect(isArtifactPath('C:\\workspace\\design.json')).toBe(true);
    expect(isArtifactPath('/workspace/semurai-context.json')).toBe(false);
    expect(isArtifactPath('/workspace/notes.json')).toBe(false);
  });
});

it('preserves the automatic Canvas binding through verification and rollout admission', () => {
  const metadata = { kind: 'other' as const, intent: 'canvas' as const };
  const strategyBinding = createAutomaticProjectStrategyBinding({ metadata, taskProfile: 'canvas' })!;
  expect(strategyBinding).not.toBeNull();
  expect(readVerifiedProjectStrategyBinding({ ...metadata, strategyBinding })).toEqual(strategyBinding);
  expect(readVerifiedProjectStrategyBinding({ kind: 'prototype', strategyBinding })).toBeNull();
});
