import { createAutomaticProjectStrategyBinding, readVerifiedProjectStrategyBinding } from '../../src/plugins/strategy-binding.js';
import { describe, expect, it } from 'vitest';
import { canvasRenderRequestAllowed } from '../../src/artifacts/canvas-render.js';
import { isArtifactPath } from '../../src/runtimes/run-artifacts.js';

describe('Canvas rendering boundary', () => {
  const entry = 'https://semur.ai/canvas-render/';
  it('allows rendering and fonts but denies APIs, arbitrary servers and writes', () => {
    for (const url of [entry, 'https://semur.ai/_nuxt/component.js', 'https://fonts.gstatic.com/font.woff2']) expect(canvasRenderRequestAllowed(url, entry, 'GET')).toBe(true);
    for (const url of ['https://semur.ai/api/canvas/documents', 'http://169.254.169.254/', 'https://images.example.com/x.jpg', 'https://semur.ai.evil.test/_nuxt/x', 'file:///etc/passwd']) expect(canvasRenderRequestAllowed(url, entry, 'GET')).toBe(false);
    expect(canvasRenderRequestAllowed(entry, entry, 'POST')).toBe(false);
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
