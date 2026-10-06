import { describe, expect, it } from 'vitest';
import { assertNoPaidKeys, cleanChildEnv, findPaidKeys, PaidKeyError } from '../src/index.ts';

describe('paid key guard', () => {
  it('finds known paid-provider keys that have a value', () => {
    expect(findPaidKeys({ ANTHROPIC_API_KEY: 'sk-x', OPENAI_API_KEY: 'y', PATH: '/bin', ELEVENLABS_API_KEY: '' })).toEqual([
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY',
    ]);
    // provider-prefixed patterns and paid cloud routes
    expect(
      findPaidKeys({
        MISTRAL_API_KEY: 'a',
        XI_API_KEY: 'b',
        OPENAI_ORG_API_KEY: 'c',
        AZURE_OPENAI_API_KEY: 'd',
        GOOGLE_API_KEY: 'e',
        FAL_KEY: 'f',
        ANTHROPIC_AUTH_TOKEN: 'g',
        AWS_BEARER_TOKEN_BEDROCK: 'h',
        ANTHROPIC_FOUNDRY_API_KEY: 'i',
        CLAUDE_CODE_USE_BEDROCK: '1',
        CLAUDE_CODE_USE_VERTEX: '1',
        CLAUDE_CODE_USE_FOUNDRY: '1',
      }),
    ).toEqual([
      'ANTHROPIC_AUTH_TOKEN',
      'ANTHROPIC_FOUNDRY_API_KEY',
      'AWS_BEARER_TOKEN_BEDROCK',
      'AZURE_OPENAI_API_KEY',
      'CLAUDE_CODE_USE_BEDROCK',
      'CLAUDE_CODE_USE_FOUNDRY',
      'CLAUDE_CODE_USE_VERTEX',
      'FAL_KEY',
      'GOOGLE_API_KEY',
      'MISTRAL_API_KEY',
      'OPENAI_ORG_API_KEY',
      'XI_API_KEY',
    ]);
    // no false positives: no generic /_API_KEY$/, real-env names stay clean
    expect(
      findPaidKeys({
        CLAUDE_CODE_MESSAGING_TOKEN: 't',
        GNOME_KEYRING_CONTROL: '/run/x',
        SOME_OTHER_API_KEY: 'z',
        PATH: '/bin',
        HOME: '/h',
      }),
    ).toEqual([]);
  });

  it('throws with names but never values', () => {
    try {
      assertNoPaidKeys({ ANTHROPIC_API_KEY: 'sk-ant-secret-value' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(PaidKeyError);
      expect((e as Error).message).toContain('ANTHROPIC_API_KEY');
      expect((e as Error).message).not.toContain('sk-ant-secret-value');
    }
  });

  it('passes a clean env', () => {
    expect(() => assertNoPaidKeys({ PATH: '/bin', HOME: '/home/x' })).not.toThrow();
  });

  it('cleanChildEnv strips Claude nesting vars, paid keys and API-routing vars', () => {
    const env = cleanChildEnv({
      CLAUDECODE: '1',
      CLAUDE_CODE_ENTRYPOINT: 'cli',
      OPENAI_API_KEY: 'k',
      MISTRAL_API_KEY: 'm',
      AWS_BEARER_TOKEN_BEDROCK: 'b',
      // routing: the subscription OAuth token must never be sent to a third-party host
      ANTHROPIC_BASE_URL: 'https://proxy.example',
      ANTHROPIC_BEDROCK_BASE_URL: 'https://b.example',
      ANTHROPIC_VERTEX_BASE_URL: 'https://v.example',
      ANTHROPIC_VERTEX_PROJECT_ID: 'proj',
      CLOUD_ML_REGION: 'us-east5',
      ANTHROPIC_FOUNDRY_BASE_URL: 'https://f.example',
      HOME: '/h',
    });
    expect(env).toEqual({ HOME: '/h', ENABLE_TOOL_SEARCH: 'false' });
    // routing vars are stripped from children but do not block startup
    expect(findPaidKeys({ ANTHROPIC_BASE_URL: 'https://proxy.example', CLOUD_ML_REGION: 'us-east5' })).toEqual([]);
  });
});
