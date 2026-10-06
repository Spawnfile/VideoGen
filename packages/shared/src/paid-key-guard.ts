const FORBIDDEN: RegExp[] = [
  // exact names
  /^ANTHROPIC_API_KEY$/, /^ANTHROPIC_AUTH_TOKEN$/, /^CLAUDE_API_KEY$/,
  /^OPENAI_API_KEY$/, /^ELEVENLABS_API_KEY$/, /^ELEVEN_API_KEY$/,
  /^GEMINI_API_KEY$/, /^GOOGLE_API_KEY$/, /^GOOGLE_GENERATIVE_AI_API_KEY$/,
  /^REPLICATE_API_TOKEN$/, /^FAL_KEY$/, /^AZURE_SPEECH_KEY$/, /^STABILITY_API_KEY$/, /^RUNWAYML_API_SECRET$/,
  // provider-prefixed credential names (deliberately no generic /_API_KEY$/: false positives would block startup)
  /^(ANTHROPIC|OPENAI|ELEVEN(_?LABS)?|XI|GEMINI|GOOGLE(_GENERATIVE)?_AI|MISTRAL|COHERE|GROQ|XAI|DEEPSEEK|OPENROUTER|TOGETHER|REPLICATE|STABILITY|RUNWAYML|FAL|AZURE_(OPENAI|SPEECH))_\w*(API_KEY|AUTH_TOKEN|SECRET|KEY|TOKEN)$/,
  // paid cloud routes for Claude
  /^AWS_BEARER_TOKEN_BEDROCK$/, /^ANTHROPIC_FOUNDRY_API_KEY$/,
  /^CLAUDE_CODE_USE_(BEDROCK|VERTEX|FOUNDRY)$/,
];

// API-routing variables: not paid keys (they don't block startup), but a child Claude CLI/SDK must never
// see them — they would send the subscription OAuth token to a third-party host or a paid cloud route.
const ROUTING = new Set([
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_BEDROCK_BASE_URL',
  'ANTHROPIC_VERTEX_BASE_URL',
  'ANTHROPIC_VERTEX_PROJECT_ID',
  'CLOUD_ML_REGION',
  'ANTHROPIC_FOUNDRY_BASE_URL',
]);

export class PaidKeyError extends Error {
  readonly keys: string[];
  constructor(keys: string[]) {
    super(`Ücretli API anahtarı bulundu, başlatma reddedildi: ${keys.join(', ')}`);
    this.name = 'PaidKeyError';
    this.keys = keys;
  }
}

export function findPaidKeys(env: NodeJS.ProcessEnv): string[] {
  return Object.keys(env)
    .filter((k) => Boolean(env[k]) && FORBIDDEN.some((r) => r.test(k)))
    .sort();
}

export function assertNoPaidKeys(env: NodeJS.ProcessEnv = process.env): void {
  const keys = findPaidKeys(env);
  if (keys.length) throw new PaidKeyError(keys);
}

export function cleanChildEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined || k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_')) continue;
    if (ROUTING.has(k) || FORBIDDEN.some((r) => r.test(k))) continue;
    out[k] = v;
  }
  out.ENABLE_TOOL_SEARCH = 'false';
  return out;
}
