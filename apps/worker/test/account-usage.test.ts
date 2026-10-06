import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readEventsAfter } from '@videogen/db';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { CliAuthStatus, FixtureAuthStatus, refreshAuth } from '../src/claude-account.ts';
import { listenCommands } from '../src/commands.ts';
import { FixtureUsageSource, recordUsage, withTimeout } from '../src/usage.ts';

const root = resolve(import.meta.dirname, '../../..');
let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
const fake = join(tmpdir(), `fake-claude-${process.pid}.sh`);
afterAll(async () => { rmSync(fake, { force: true }); await t.drop(); });

describe('claude account', () => {
  it('stores fixture auth without identifying fields and publishes an event', async () => {
    const a = await refreshAuth(t.pool, new FixtureAuthStatus(resolve(root, 'tests/fixtures/claude-auth-status.json')));
    expect(a).toMatchObject({ loggedIn: true, authMethod: 'claude.ai', subscriptionType: 'max' });
    const { rows } = await t.pool.query("SELECT value FROM settings WHERE key = 'claude.auth'");
    expect(JSON.stringify(rows[0].value)).not.toMatch(/email|org/i);
    const events = await readEventsAfter(t.pool, 0);
    expect(events.at(-1)).toMatchObject({ topic: 'system', type: 'claude.auth' });
  });

  it('reports a failing CLI as not logged in with an error, without throwing or echoing CLI output', async () => {
    writeFileSync(fake, '#!/bin/sh\necho boom >&2\nexit 3\n', { mode: 0o755 });
    const a = await new CliAuthStatus(fake).read();
    expect(a.loggedIn).toBe(false);
    expect(a.error).toBeTruthy();
    expect(a.error).not.toContain('boom');
  });
});

describe('usage', () => {
  it('records a snapshot from the sample fixture', async () => {
    const snap = await new FixtureUsageSource(resolve(root, 'tests/fixtures/usage-response.sample.json')).read();
    await recordUsage(t.pool, snap!);
    const { rows } = await t.pool.query('SELECT five_hour_util, seven_day_util, subscription_type FROM usage_snapshots ORDER BY id DESC LIMIT 1');
    expect(rows[0]).toEqual({ five_hour_util: 0.35, seven_day_util: 0.12, subscription_type: 'max' });
  });
});

describe('usage timeout', () => {
  it('rejects a call that never settles with a fixed message, and passes through a settled one', async () => {
    await expect(withTimeout(new Promise<never>(() => {}), 20, 'usage read timed out')).rejects.toThrow('usage read timed out');
    await expect(withTimeout(Promise.resolve(7), 1000, 'x')).resolves.toBe(7);
  });
});

describe('vg_commands listener', () => {
  it('survives malformed, unknown and prototype-named commands and still runs a valid one', async () => {
    const calls: string[] = [];
    const failures: string[] = [];
    let lost = 0;
    const stop = await listenCommands(
      t.appUrl,
      { x: async () => { calls.push('x'); }, boom: async () => { throw new Error('secret stderr text'); } },
      { onFailure: (f) => failures.push(`${f.reason}:${f.type ?? ''}`), onConnectionLost: () => { lost++; } },
    );
    for (const p of ['not json', 'null', '{}', '{"type":"constructor"}', '{"type":"toString"}', '{"type":"nope"}', '{"type":"boom"}', '{"type":"x"}']) {
      await t.pool.query("SELECT pg_notify('vg_commands', $1)", [p]);
    }
    await vi.waitFor(() => { expect(calls).toEqual(['x']); expect(failures.length).toBe(7); });
    expect(failures).toEqual(['malformed:', 'malformed:', 'malformed:', 'unknown:', 'unknown:', 'unknown:', 'handler:boom']);
    await stop();
    expect(lost).toBe(0); // a deliberate stop is not a lost connection
  });
});

describe('vg_commands connection loss', () => {
  it('reports an unexpected disconnect so the worker can crash for the supervisor', async () => {
    let lost = 0;
    const stop = await listenCommands(t.appUrl, {}, { onConnectionLost: () => { lost++; } });
    await t.pool.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE query LIKE 'LISTEN vg_commands%' AND pid <> pg_backend_pid()");
    await vi.waitFor(() => expect(lost).toBeGreaterThan(0));
    await stop().catch(() => {});
  });
});
