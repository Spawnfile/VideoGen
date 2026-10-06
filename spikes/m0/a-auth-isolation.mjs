import { record, fail, FIXTURES } from './lib.mjs';
import { redactFile } from './redact.mjs';
import { resolve } from 'node:path';

const msgs = await record('basic', 'Reply with exactly: OK');
const init = msgs.find((m) => m.type === 'system' && m.subtype === 'init');
const result = msgs.find((m) => m.type === 'result');
const hookEvents = msgs.filter((m) => m.type === 'system' && String(m.subtype).startsWith('hook'));
const rate = msgs.filter((m) => m.type === 'rate_limit_event');

console.log(JSON.stringify({
  claude_code_version: init?.claude_code_version,
  apiKeySource: init?.apiKeySource,
  model: init?.model,
  skills: init?.skills,
  plugins: init?.plugins?.map((p) => p.name),
  mcp_servers: init?.mcp_servers,
  agents: init?.agents,
  hookEvents: hookEvents.map((h) => h.hook_name),
  rateLimitEvents: rate.map((r) => r.rate_limit_info),
  result: { subtype: result?.subtype, is_error: result?.is_error, usage: result?.usage, total_cost_usd: result?.total_cost_usd },
}, null, 2));

redactFile(resolve(FIXTURES, 'basic.ndjson'));

const errors = [];
if (!init) errors.push('no system/init message');
if (init?.apiKeySource !== 'none') errors.push(`apiKeySource is ${init?.apiKeySource}, expected none (subscription OAuth)`);
if (init?.claude_code_version !== '2.1.290') errors.push(`bundled CLI version ${init?.claude_code_version} != 2.1.290`);
if (hookEvents.length) errors.push(`user hooks leaked into session: ${hookEvents.map((h) => h.hook_name).join(', ')}`);
if (!init?.skills?.some((s) => s.includes('remotion-render'))) errors.push('plugin skills (symlinked) not loaded');
if (init?.mcp_servers?.length) errors.push(`unexpected MCP servers: ${JSON.stringify(init.mcp_servers)}`);
if (result?.is_error) errors.push(`result is_error: ${result.subtype}`);
fail(errors);
