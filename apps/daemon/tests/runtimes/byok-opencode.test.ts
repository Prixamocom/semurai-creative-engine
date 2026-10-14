import { describe, expect, it, vi } from 'vitest';

import { agentCapabilities } from '../../src/runtimes/capabilities.js';
import {
  BYOK_OPENCODE_API_KEY_ENV,
  BYOK_OPENCODE_PROVIDER_ID,
  buildOpenCodeByokProviderConfig,
  opencodeByokModelId,
} from '../../src/runtimes/byok-opencode.js';
import { byokOpenCodeAgentDef } from '../../src/runtimes/defs/byok-opencode.js';

describe('byok-opencode runtime config', () => {
  it('gates non-interactive permission bypass on the installed OpenCode capability', () => {
    agentCapabilities.delete('byok-opencode');
    expect(byokOpenCodeAgentDef.helpArgs).toEqual(['run', '--help']);
    expect(byokOpenCodeAgentDef.capabilityFlags).toEqual({
      '--dangerously-skip-permissions': 'skipPermissions',
    });
    expect(byokOpenCodeAgentDef.buildArgs('', [], [], {})).toEqual([
      'run',
      '--format',
      'json',
    ]);

    agentCapabilities.set('byok-opencode', { skipPermissions: true });
    try {
      expect(byokOpenCodeAgentDef.buildArgs('', [], [], { model: 'gpt-5.5' })).toEqual([
        'run',
        '--format',
        'json',
        '--dangerously-skip-permissions',
        '-m',
        'open-design-byok/gpt-5.5',
      ]);
    } finally {
      agentCapabilities.delete('byok-opencode');
    }
  });

  it('uses a qualified model with the native OpenCode provider without duplicating its namespace', () => {
    const result = buildOpenCodeByokProviderConfig({ protocol: 'openai', apiKey: 'test-secret', baseUrl: 'https://api.deepseek.com/v1' }, 'open-design-byok/deepseek-flash');
    expect(result?.modelId).toBe('open-design-byok/deepseek-flash');
    expect(JSON.stringify(result?.config)).toContain('deepseek-flash');
    expect(JSON.stringify(result?.config)).not.toContain('open-design-byok/deepseek-flash');
    expect(JSON.stringify(result?.config)).not.toContain('test-secret');
  });

  it('prefixes raw BYOK models with the run-scoped OpenCode provider id', () => {
    expect(opencodeByokModelId('gpt-4o-mini')).toBe('open-design-byok/gpt-4o-mini');
    expect(opencodeByokModelId('open-design-byok/gpt-4o-mini')).toBe('open-design-byok/gpt-4o-mini');
    expect(opencodeByokModelId('default')).toBeNull();
  });

  it('builds OpenAI-compatible provider config without embedding the secret in JSON', () => {
    const out = buildOpenCodeByokProviderConfig(
      {
        protocol: 'senseaudio',
        apiKey: 'sk-secret',
        baseUrl: 'https://api.senseaudio.cn',
      },
      'deepseek-v4-flash',
    );

    expect(out?.modelId).toBe('open-design-byok/deepseek-v4-flash');
    expect(out?.env).toEqual({ [BYOK_OPENCODE_API_KEY_ENV]: 'sk-secret' });
    expect(JSON.stringify(out?.config)).not.toContain('sk-secret');
    expect(out?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/openai-compatible',
          options: {
            baseURL: 'https://api.senseaudio.cn',
            apiKey: `{env:${BYOK_OPENCODE_API_KEY_ENV}}`,
          },
          models: {
            'deepseek-v4-flash': {
              name: 'deepseek-v4-flash',
              limit: {
                context: 128_000,
                output: 16_384,
              },
            },
          },
        },
      },
    });
  });

  it('maps native OpenAI BYOK to the OpenAI provider package', () => {
    const out = buildOpenCodeByokProviderConfig(
      { protocol: 'openai', apiKey: 'sk-openai', baseUrl: 'https://api.openai.com/v1' },
      'gpt-5.5',
    );

    expect(out?.modelId).toBe('open-design-byok/gpt-5.5');
    expect(out?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/openai',
          options: {
            baseURL: 'https://api.openai.com/v1',
            apiKey: `{env:${BYOK_OPENCODE_API_KEY_ENV}}`,
          },
          models: {
            'gpt-5.5': {
              name: 'gpt-5.5',
            },
          },
        },
      },
    });
  });

  it('routes OpenAI-protocol BYOK with a non-OpenAI base URL to the OpenAI-compatible provider package', () => {
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'openai', apiKey: 'sk-deepseek', baseUrl: 'https://api.deepseek.com' },
      'deepseek-v4-pro',
    )?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/openai-compatible',
          options: {
            baseURL: 'https://api.deepseek.com',
            apiKey: `{env:${BYOK_OPENCODE_API_KEY_ENV}}`,
          },
        },
      },
    });
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'openai', apiKey: 'sk-openai', baseUrl: 'https://api.openai.com' },
      'deepseek-v4-pro',
    )?.config).toMatchObject({
      provider: { [BYOK_OPENCODE_PROVIDER_ID]: { npm: '@ai-sdk/openai' } },
    });
  });

  it('normalizes origin-only native provider base URLs for OpenCode provider packages', () => {
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'anthropic', apiKey: 'sk-ant', baseUrl: 'https://api.anthropic.com' },
      'claude-sonnet-4-5',
    )?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/anthropic',
          options: { baseURL: 'https://api.anthropic.com/v1' },
        },
      },
    });
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'google', apiKey: 'AIza', baseUrl: 'https://generativelanguage.googleapis.com/' },
      'gemini-3.5-flash',
    )?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/google',
          options: { baseURL: 'https://generativelanguage.googleapis.com/v1beta' },
        },
      },
    });
  });

  it.each([
    {
      name: 'MiniMax',
      baseUrl: 'https://api.minimax.io/anthropic',
      expectedBaseUrl: 'https://api.minimax.io/anthropic/v1',
    },
    {
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/anthropic',
      expectedBaseUrl: 'https://api.deepseek.com/anthropic/v1',
    },
    {
      name: 'MiMo',
      baseUrl: 'https://token-plan-cn.xiaomimimo.com/anthropic',
      expectedBaseUrl: 'https://token-plan-cn.xiaomimimo.com/anthropic/v1',
    },
  ])(
    'adds the Anthropic API version to the $name compatibility base URL',
    ({ baseUrl, expectedBaseUrl }) => {
      expect(buildOpenCodeByokProviderConfig(
        {
          protocol: 'anthropic',
          apiKey: 'anthropic-compatible-key',
          baseUrl,
        },
        'anthropic-compatible-model',
      )?.config).toMatchObject({
        provider: {
          [BYOK_OPENCODE_PROVIDER_ID]: {
            npm: '@ai-sdk/anthropic',
            options: {
              baseURL: expectedBaseUrl,
            },
          },
        },
      });
    },
  );

  it('preserves an Anthropic compatibility base URL that already has a version segment', () => {
    expect(buildOpenCodeByokProviderConfig(
      {
        protocol: 'anthropic',
        apiKey: 'anthropic-compatible-key',
        baseUrl: 'https://gateway.example.com/anthropic/v2/proxy',
      },
      'anthropic-compatible-model',
    )?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/anthropic',
          options: {
            baseURL: 'https://gateway.example.com/anthropic/v2/proxy',
          },
        },
      },
    });
  });

  it.each([
    {
      name: 'query parameters',
      baseUrl: 'https://gateway.example.com/anthropic?tenant=x',
      expectedBaseUrl: 'https://gateway.example.com/anthropic/v1?tenant=x',
    },
    {
      name: 'a fragment',
      baseUrl: 'https://gateway.example.com/anthropic#route',
      expectedBaseUrl: 'https://gateway.example.com/anthropic/v1#route',
    },
  ])(
    'preserves $name when versioning an Anthropic compatibility base URL',
    ({ baseUrl, expectedBaseUrl }) => {
      expect(buildOpenCodeByokProviderConfig(
        {
          protocol: 'anthropic',
          apiKey: 'anthropic-compatible-key',
          baseUrl,
        },
        'anthropic-compatible-model',
      )?.config).toMatchObject({
        provider: {
          [BYOK_OPENCODE_PROVIDER_ID]: {
            options: {
              baseURL: expectedBaseUrl,
            },
          },
        },
      });
    },
  );

  it('maps other native BYOK protocols to provider packages', () => {
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'anthropic', apiKey: 'sk-ant', baseUrl: 'https://api.anthropic.com' },
      'claude-sonnet-4-5',
    )?.config).toMatchObject({
      provider: { [BYOK_OPENCODE_PROVIDER_ID]: { npm: '@ai-sdk/anthropic' } },
    });
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'google', apiKey: 'AIza', baseUrl: 'https://generativelanguage.googleapis.com' },
      'gemini-2.5-flash',
    )?.config).toMatchObject({
      provider: { [BYOK_OPENCODE_PROVIDER_ID]: { npm: '@ai-sdk/google' } },
    });
  });

  it('preserves Azure deployment-based URL mode for classic Azure OpenAI resources', () => {
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'azure', apiKey: 'azure-key', baseUrl: 'https://example.openai.azure.com', apiVersion: '2024-10-21' },
      'gpt-4o',
    )?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/azure',
          options: {
            baseURL: 'https://example.openai.azure.com',
            apiKey: `{env:${BYOK_OPENCODE_API_KEY_ENV}}`,
            apiVersion: '2024-10-21',
            useDeploymentBasedUrls: true,
          },
          models: {
            'gpt-4o': {
              name: 'gpt-4o',
            },
          },
        },
      },
    });
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'azure', apiKey: 'azure-key', baseUrl: 'https://example.openai.azure.com' },
      'deployment-one',
    )?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          options: {
            apiVersion: '2024-10-21',
            useDeploymentBasedUrls: true,
          },
        },
      },
    });
  });

  it('rejects Azure providers without a base URL', () => {
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'azure', apiKey: 'azure-key', baseUrl: '' },
      'gpt-4o',
    )).toBeNull();
  });

  it('keeps Azure OpenAI-compatible v1 paths in model-based URL mode', () => {
    expect(buildOpenCodeByokProviderConfig(
      {
        protocol: 'azure',
        apiKey: 'azure-key',
        baseUrl: 'https://resource.services.ai.azure.com/api/projects/project/openai/v1',
        apiVersion: '',
      },
      'prod',
    )?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/azure',
          options: {
            baseURL: 'https://resource.services.ai.azure.com/api/projects/project/openai/v1',
            apiKey: `{env:${BYOK_OPENCODE_API_KEY_ENV}}`,
          },
        },
      },
    });
    const provider = (buildOpenCodeByokProviderConfig(
      {
        protocol: 'azure',
        apiKey: 'azure-key',
        baseUrl: 'https://resource.services.ai.azure.com/api/projects/project/openai/v1',
        apiVersion: '',
      },
      'prod',
    )?.config.provider as Record<string, { options?: Record<string, unknown> }> | undefined)
      ?.[BYOK_OPENCODE_PROVIDER_ID];
    expect(provider?.options).not.toHaveProperty('useDeploymentBasedUrls');
    expect(provider?.options).not.toHaveProperty('apiVersion');
  });

  it('maps Ollama Cloud to OpenCode documented OpenAI-compatible v1 config', () => {
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'ollama', apiKey: 'ollama-key', baseUrl: 'https://ollama.com' },
      'gpt-oss:20b',
    )?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/openai-compatible',
          options: {
            baseURL: 'https://ollama.com/v1',
            apiKey: `{env:${BYOK_OPENCODE_API_KEY_ENV}}`,
          },
          models: {
            'gpt-oss:20b': {
              name: 'gpt-oss:20b',
            },
          },
        },
      },
    });
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'ollama', apiKey: 'ollama-key', baseUrl: 'https://ollama.example.com/api' },
      'llama3.1',
    )?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          options: {
            baseURL: 'https://ollama.example.com/v1',
          },
        },
      },
    });
  });

  it('allows keyless local Ollama and normalizes it to the OpenAI-compatible v1 endpoint', () => {
    const out = buildOpenCodeByokProviderConfig(
      { protocol: 'ollama', apiKey: '', baseUrl: 'http://localhost:11434' },
      'llama3.2',
    );

    expect(out?.modelId).toBe('open-design-byok/llama3.2');
    expect(out?.env).toEqual({});
    expect(out?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/openai-compatible',
          options: {
            baseURL: 'http://localhost:11434/v1',
          },
        },
      },
    });
    const provider = (out?.config.provider as Record<string, { options?: Record<string, unknown> }> | undefined)
      ?.[BYOK_OPENCODE_PROVIDER_ID];
    expect(provider?.options).not.toHaveProperty('apiKey');
  });

  it('still requires an API key for non-local Ollama providers', () => {
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'ollama', apiKey: '', baseUrl: 'https://ollama.com' },
      'gpt-oss:20b',
    )).toBeNull();
  });

  it('allows explicit keyless OpenAI-compatible presets such as vLLM', () => {
    const out = buildOpenCodeByokProviderConfig(
      {
        protocol: 'openai',
        apiKey: '',
        baseUrl: 'http://127.0.0.1:8000/v1',
        requiresApiKey: false,
      },
      'model',
    );

    expect(out?.modelId).toBe('open-design-byok/model');
    expect(out?.env).toEqual({});
    expect(out?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/openai-compatible',
          options: {
            baseURL: 'http://127.0.0.1:8000/v1',
          },
        },
      },
    });
    const provider = (out?.config.provider as Record<string, { options?: Record<string, unknown> }> | undefined)
      ?.[BYOK_OPENCODE_PROVIDER_ID];
    expect(provider?.options).not.toHaveProperty('apiKey');
  });
});

it('enables real image input for the documented DeepSeek Flash provider only', () => {
  const flash = buildOpenCodeByokProviderConfig({ protocol: 'openai', baseUrl: 'https://api.deepseek.com/v1', apiKey: 'test', model: 'deepseek-flash' }, 'deepseek-flash');
  expect(JSON.stringify(flash?.config)).toContain('"input":["text","image"]');
  const unknown = buildOpenCodeByokProviderConfig({ protocol: 'openai', baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'deepseek-flash' }, 'deepseek-flash');
  expect(JSON.stringify(unknown?.config)).not.toContain('modalities');
});

it('keeps image input behind the Semurai gateway only with the explicit imageInput hint', () => {
  const baseUrl = 'http://semurai-creative-service:8081/llm/v1';
  const gateway = buildOpenCodeByokProviderConfig({ protocol: 'openai', baseUrl, apiKey: 'run-token', model: 'deepseek-flash', imageInput: true }, 'open-design-byok/deepseek-flash');
  expect(JSON.stringify(gateway?.config)).toContain('"input":["text","image"]');
  const provider = (gateway?.config.provider as Record<string, { npm?: string; options?: Record<string, unknown> }>)[BYOK_OPENCODE_PROVIDER_ID];
  expect(provider?.npm).toBe('@ai-sdk/openai-compatible');
  expect(provider?.options?.baseURL).toBe(baseUrl);
  expect(gateway?.env).toEqual({ OPEN_DESIGN_BYOK_API_KEY: 'run-token' });
  const withoutHint = buildOpenCodeByokProviderConfig({ protocol: 'openai', baseUrl, apiKey: 'run-token', model: 'deepseek-flash' }, 'deepseek-flash');
  expect(JSON.stringify(withoutHint?.config)).not.toContain('modalities');
  const falseHint = buildOpenCodeByokProviderConfig({ protocol: 'openai', baseUrl, apiKey: 'run-token', model: 'deepseek-flash', imageInput: false }, 'deepseek-flash');
  expect(JSON.stringify(falseHint?.config)).not.toContain('modalities');
});

describe('Semurai gateway wire API', () => {
  const baseUrl = 'http://semurai-creative-service:8081/llm/v1';
  const providerEntry = (out: ReturnType<typeof buildOpenCodeByokProviderConfig>) =>
    (out?.config.provider as Record<string, { npm?: string; options?: Record<string, unknown> }>)[BYOK_OPENCODE_PROVIDER_ID];

  it('uses the OpenAI Responses package against the gateway base URL when the host asks for responses', () => {
    const out = buildOpenCodeByokProviderConfig(
      { protocol: 'openai', baseUrl, apiKey: 'run-token', model: 'gpt-6.1-sol', imageInput: true, wireApi: 'responses' },
      'open-design-byok/gpt-6.1-sol',
    );
    expect(out?.modelId).toBe('open-design-byok/gpt-6.1-sol');
    expect(providerEntry(out)).toEqual({
      name: 'Semurai Creative BYOK',
      npm: '@ai-sdk/openai',
      options: { apiKey: `{env:${BYOK_OPENCODE_API_KEY_ENV}}`, baseURL: baseUrl },
      models: {
        'gpt-6.1-sol': {
          name: 'gpt-6.1-sol',
          attachment: true,
          modalities: { input: ['text', 'image'], output: ['text'] },
          // Reasoning tokens share max_output_tokens on Responses: use the gateway clamp.
          limit: { context: 128_000, output: 32_768 },
        },
      },
    });
    expect(out?.env).toEqual({ [BYOK_OPENCODE_API_KEY_ENV]: 'run-token' });
    expect(JSON.stringify(out?.config)).not.toContain('run-token');
    // No provider-defined OpenAI tools (web_search etc.) or reasoning overrides are configured.
    expect(JSON.stringify(out?.config)).not.toMatch(/tools|web_search|reasoning|store/);
  });

  it('keeps Chat Completions behind the gateway for chat or an absent wire API', () => {
    for (const wireApi of ['chat', undefined] as const) {
      const out = buildOpenCodeByokProviderConfig(
        { protocol: 'openai', baseUrl, apiKey: 'run-token', model: 'deepseek-flash', ...(wireApi ? { wireApi } : {}) },
        'deepseek-flash',
      );
      expect(providerEntry(out)?.npm).toBe('@ai-sdk/openai-compatible');
      expect(providerEntry(out)?.options?.baseURL).toBe(baseUrl);
      expect((providerEntry(out) as { models?: Record<string, { limit?: unknown }> })?.models?.['deepseek-flash']?.limit)
        .toEqual({ context: 128_000, output: 16_384 });
    }
  });

  it('keeps real OpenAI on the Responses package whatever the wire API says', () => {
    const out = buildOpenCodeByokProviderConfig(
      { protocol: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-openai', wireApi: 'chat' },
      'gpt-6-luna',
    );
    expect(providerEntry(out)?.npm).toBe('@ai-sdk/openai');
  });

  it('ignores the wire API for non-OpenAI protocols', () => {
    const out = buildOpenCodeByokProviderConfig(
      { protocol: 'senseaudio', baseUrl: 'https://api.senseaudio.cn', apiKey: 'sk', wireApi: 'responses' },
      'deepseek-v4-flash',
    );
    expect(providerEntry(out)?.npm).toBe('@ai-sdk/openai-compatible');
  });

  it('rejects an unsupported wire API value and says why without logging the key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      for (const wireApi of ['completions', 'RESPONSES', '', 1, true]) {
        expect(buildOpenCodeByokProviderConfig(
          { protocol: 'openai', baseUrl, apiKey: 'run-token', wireApi } as unknown as Parameters<typeof buildOpenCodeByokProviderConfig>[0],
          'gpt-6-luna',
        )).toBeNull();
      }
      expect(warn).toHaveBeenCalledTimes(5);
      expect(String(warn.mock.calls[0]?.[0])).toContain('unsupported byokProvider.wireApi "completions"');
      expect(JSON.stringify(warn.mock.calls)).not.toContain('run-token');
    } finally {
      warn.mockRestore();
    }
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'openai', baseUrl, apiKey: 'run-token', wireApi: null } as unknown as Parameters<typeof buildOpenCodeByokProviderConfig>[0],
      'deepseek-flash',
    )).not.toBeNull();
  });
});
