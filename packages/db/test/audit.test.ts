import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appendAudit, findSecretKeys, redactSecretKeys, verifyAudit } from '../src/index.ts';
import { createTestDb } from './helpers.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t?.drop(); });

describe('audit chain', () => {
  it('chains concurrent appends in seq order and verifies', async () => {
    const results = await Promise.all([1, 2, 3, 4, 5].map((n) => appendAudit(t.pool, { actorType: 'user', action: `test.${n}`, data: { n, tr: 'şğıİ' } })));
    expect(results.map((r) => r.seq).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(await verifyAudit(t.pool)).toEqual({ ok: true, checked: 5, firstBadSeq: null });
  });

  it('app role cannot update or delete audit rows', async () => {
    await expect(t.pool.query("UPDATE audit_log SET action = 'x' WHERE seq = 1")).rejects.toMatchObject({ code: '42501' });
    await expect(t.pool.query('DELETE FROM audit_log WHERE seq = 1')).rejects.toMatchObject({ code: '42501' });
  });

  it('owner update is blocked by trigger', async () => {
    const admin = new pg.Client({ connectionString: t.adminUrl });
    await admin.connect();
    await expect(admin.query("UPDATE audit_log SET action = 'x' WHERE seq = 1")).rejects.toThrow('append-only');
    await admin.end();
  });

  it('detects tampering even when triggers are bypassed', async () => {
    const admin = new pg.Client({ connectionString: t.adminUrl });
    await admin.connect();
    await admin.query('ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_update');
    await admin.query("UPDATE audit_log SET action = 'tampered' WHERE seq = 3");
    await admin.query('ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_update');
    await admin.end();
    expect(await verifyAudit(t.pool)).toEqual({ ok: false, checked: 3, firstBadSeq: 3 });
  });

  it('rejects secret-like keys in data', async () => {
    await expect(appendAudit(t.pool, { actorType: 'system', action: 'x', data: { nested: { refresh_token: 'abc' } } })).rejects.toThrow('$.nested.refresh_token');
    await expect(appendAudit(t.pool, { actorType: 'system', action: 'usage', data: { input_tokens: 5 } })).resolves.toBeTruthy();
  });

  it('canonical row text is unambiguous (no field-boundary or NULL/empty collisions)', async () => {
    const text = async (row: Record<string, unknown>) => {
      const { rows } = await t.pool.query(
        'SELECT audit_row_text(jsonb_populate_record(NULL::audit_log, $1::jsonb)) AS t',
        [JSON.stringify({ seq: 1, ts: '2026-01-01T00:00:00.000000Z', actor_type: 'user', action: 'x', ...row })],
      );
      return rows[0].t as string;
    };
    expect(await text({ actor_id: 'a|b', action: 'c' })).not.toBe(await text({ actor_id: 'a', action: 'b|c' }));
    expect(await text({ actor_id: null })).not.toBe(await text({ actor_id: '' }));
    expect(await text({ run_id: 'r' })).not.toBe(await text({ step_id: 'r' }));
  });

  it('app role cannot backdate ts', async () => {
    const before = Date.now();
    await t.pool.query("INSERT INTO audit_log (ts, actor_type, action) VALUES ('1999-01-01T00:00:00Z', 'system', 'backdate')");
    const { rows } = await t.pool.query("SELECT ts FROM audit_log WHERE action = 'backdate'");
    expect(new Date(rows[0].ts).getTime()).toBeGreaterThanOrEqual(before - 5_000);
  });

  it('flags secret-like key spellings and allows usage keys', () => {
    const bad = ['access_token', 'accessToken', 'refreshToken', 'clientSecret', 'x-api-key', 'api-key', 'apiKey', 'ANTHROPIC_API_KEY',
      'CLAUDE_CODE_OAUTH_TOKEN', 'oauth_token', 'session_token', 'proxy-authorization', 'Authorization', 'private_key', 'Set-Cookie', 'password', 'passwd'];
    for (const k of bad) expect(findSecretKeys({ [k]: 'v' }), k).toEqual([`$.${k}`]);
    expect(findSecretKeys([{ deep: { 'x-api-key': 'v' } }])).toEqual(['$[0].deep.x-api-key']);
    const ok = ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens', 'max_tokens', 'thinking_tokens', 'tokenCount', 'num_turns'];
    expect(findSecretKeys(Object.fromEntries(ok.map((k) => [k, 1])))).toEqual([]);
  });
  it('flags *_key suffixes and plural secret names, still allows token counters', () => {
    for (const k of ['secret_key', 'access_key', 'signing_key', 'AWS_SECRET_ACCESS_KEY', 'cookies', 'secrets', 'credentials', 'passwords', 'client_credential']) {
      expect(findSecretKeys({ [k]: 'v' }), k).toEqual([`$.${k}`]);
    }
    expect(findSecretKeys({ input_tokens: 1, outputTokens: 2, cache_key: 'x', sort_key: 'y', tokens: 3 })).toEqual([]);
  });

  it('redactSecretKeys returns a redacted deep copy that appendAudit accepts', async () => {
    const input = { tool: 'mcp__x', args: { api_key: 'sk-123', nested: [{ cookies: 'c' }], keep: 'ok' } };
    const red = redactSecretKeys(input);
    expect(red).toEqual({ tool: 'mcp__x', args: { redacted_1: '[redacted]', nested: [{ redacted_2: '[redacted]' }], keep: 'ok' } });
    expect(input.args.api_key).toBe('sk-123');
    expect(JSON.stringify(red)).not.toContain('sk-123');
    await expect(appendAudit(t.pool, { actorType: 'agent', action: 'agent.tool', data: red })).resolves.toBeTruthy();
  });
});
