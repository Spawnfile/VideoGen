import { expect, test } from '@playwright/test';
import pg from 'pg';
import { produceVia } from './helpers.ts';

const APP_SMOKE = 'postgres://videogen_app:videogen_app@127.0.0.1:5433/videogen_smoke';
async function sql<T = Record<string, unknown>>(q: string, args: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: APP_SMOKE });
  await c.connect();
  try { return (await c.query(q, args)).rows as T[]; } finally { await c.end(); }
}
const seqs = async (rows: import('@playwright/test').Locator) => (await rows.evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-seq'))))).sort((a, b) => b - a);

/** Plan M7 Y12 (spec §16.2 S7). A Fake-driver run up to research gives the run's rows, an artifact and the researcher's tool rows. */
test('S7: the audit explorer filters a run, shows a valid chain and opens the raw tool input and the artifact', async ({ page, request }) => {
  test.setTimeout(90_000);
  const { videoId, runId } = await produceVia(request, 'Smoke denetim kalemi', 'silent', 'research');
  await expect.poll(async () => (await sql<{ status: string }>('SELECT status FROM runs WHERE id = $1', [runId]))[0]?.status, { timeout: 60_000 }).toBe('done');
  const runRows = (await sql<{ seq: string }>('SELECT seq FROM audit_log WHERE run_id = $1 ORDER BY seq DESC LIMIT 50', [runId])).map((r) => Number(r.seq));
  expect(runRows.length).toBeGreaterThan(0);

  await page.goto('/audit');
  const audit = page.getByTestId('audit-page');
  await expect(audit.getByTestId('chain-status')).toHaveAttribute('data-tone', 'ok', { timeout: 15_000 });
  await expect(audit.getByTestId('chain-status')).toContainText('Zincir geçerli');
  const rows = audit.getByTestId('audit-row');
  await expect(rows.first()).toBeVisible();
  const box = audit.getByRole('textbox', { name: 'Run' });
  await box.fill(runId);
  await box.press('Enter');
  await expect(page).toHaveURL(new RegExp(`[?&]run=${runId}`));
  // Only this run's rows, all of them (one page): the newest 50 by seq.
  await expect.poll(() => seqs(rows)).toEqual(runRows);

  // The research artifact: its row opens to the artifact, whose content the link serves.
  const created = rows.filter({ hasText: 'artifact.created' }).first();
  await created.click();
  const detail = audit.getByTestId('audit-detail');
  await expect(detail.getByRole('heading', { name: 'Artefakt' })).toBeVisible();
  await expect(detail).toContainText('research');
  const href = (await detail.getByRole('link', { name: 'İçeriği aç' }).getAttribute('href'))!;
  const art = await request.get(href);
  expect(art.status()).toBe(200);
  expect(JSON.stringify(await art.json())).toContain('claims');

  // The library detail's Audit tab: the video filter shows the same run rows and the researcher's tool rows.
  await page.goto(`/library/${videoId}`);
  await expect(page.getByTestId('library-detail')).toBeVisible();
  await page.getByRole('tab', { name: 'Audit' }).click();
  const lib = page.getByTestId('audit-page');
  const libRows = lib.getByTestId('audit-row');
  await expect(libRows.first()).toBeVisible();
  await expect(lib.getByRole('combobox', { name: 'Video' })).toHaveCount(0); // fixed by the page, not offered
  const [{ n }] = await sql<{ n: string }>(
    `SELECT count(*) AS n FROM audit_log WHERE (subject_type = 'video' AND subject_id = $1::text) OR run_id IN (SELECT id::text FROM runs WHERE video_id = $1::uuid)
       OR session_id IN (SELECT s.id::text FROM agent_sessions s JOIN runs r ON r.id::text = s.run_id::text WHERE r.video_id = $1::uuid)`, [videoId],
  );
  await expect(libRows).toHaveCount(Math.min(Number(n), 50));
  const shown = new Set(await seqs(libRows));
  const runInView = runRows.filter((s) => s >= Math.min(...shown));
  expect(runInView.every((s) => shown.has(s))).toBe(true);

  // A tool row of the run's researcher: the raw tool input is shown.
  const [tool] = await sql<{ seq: string; tool: string }>(
    `SELECT a.seq, a.subject_id AS tool FROM audit_log a JOIN agent_sessions s ON s.id::text = a.session_id
      WHERE s.run_id::text = $1 AND a.action = 'agent.tool' AND a.subject_id = 'WebSearch' ORDER BY a.seq DESC LIMIT 1`, [runId],
  );
  expect(tool).toBeDefined();
  await lib.getByRole('combobox', { name: 'Eylem' }).selectOption('agent.tool');
  const toolRow = lib.locator(`[data-testid="audit-row"][data-seq="${tool!.seq}"]`);
  await toolRow.click();
  const toolDetail = lib.getByTestId('audit-detail');
  await expect(toolDetail.getByRole('heading', { name: 'Araç girdisi · WebSearch' })).toBeVisible();
  await expect(toolDetail.locator('pre').first()).toContainText('"query"');
});
