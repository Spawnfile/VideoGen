import { query } from '@anthropic-ai/claude-agent-sdk';
import { baseOptions, fail, FIXTURES } from './lib.mjs';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { redactFile } from './redact.mjs';

let release;
const gate = new Promise((r) => (release = r));
async function* noMessages() { await gate; }

const q = query({ prompt: noMessages(), options: baseOptions() });
const seen = [];
const drain = (async () => { for await (const m of q) seen.push(m); })();

const t0 = Date.now();
const usage = await q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true });
const account = await q.accountInfo();
const ms = Date.now() - t0;
release();
await drain;

const fixture = resolve(FIXTURES, 'usage-response.json');
writeFileSync(fixture, JSON.stringify({ usage, ms }) + '\n');
redactFile(fixture);
console.log(JSON.stringify({ ms, subscription_type: usage.subscription_type, rate_limits_available: usage.rate_limits_available, rate_limits: usage.rate_limits, accountKeys: Object.keys(account ?? {}), seenCount: seen.length, seenTypes: seen.map((m) => m.type) }, null, 2));

const errors = [];
if (!usage.rate_limits_available) errors.push('rate_limits_available is false');
if (seen.some((m) => m.type === 'assistant' || m.type === 'result')) errors.push('a model turn happened — not zero-token');
// zero-token: nothing yielded by the iterator, no cost, no model usage
if (seen.length !== 0) errors.push(`${seen.length} message(s) arrived: ${seen.map((m) => m.type)}`);
if (usage.session?.total_cost_usd !== 0) errors.push(`session.total_cost_usd = ${usage.session?.total_cost_usd}`);
if (Object.keys(usage.session?.model_usage ?? { x: 1 }).length !== 0) errors.push('session.model_usage is not empty');
// the fields M2's UsageSource depends on
for (const w of ['five_hour', 'seven_day']) {
  const win = usage.rate_limits?.[w];
  if (!win) errors.push(`rate_limits.${w} is missing`);
  else {
    if (typeof win.utilization !== 'number') errors.push(`rate_limits.${w}.utilization is not a number`);
    if (typeof win.resets_at !== 'string') errors.push(`rate_limits.${w}.resets_at is not a string`);
  }
}
fail(errors);
