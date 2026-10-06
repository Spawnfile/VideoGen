import { assertNoPaidKeys, loadConfig } from '@videogen/shared';
import { appendAudit, createPool } from '@videogen/db';
import { buildApp } from './app.ts';
import { EventHub } from './event-hub.ts';

assertNoPaidKeys();
const config = loadConfig();
const pool = createPool(config.databaseUrl);
const hub = new EventHub(pool, config.databaseUrl);
await hub.start();
const app = await buildApp({ pool, hub, config });
await app.listen({ host: config.host, port: config.port });
await appendAudit(pool, { actorType: 'system', action: 'api.started', data: { pid: process.pid, port: config.port } });

// Terminal Ctrl-C delivers SIGINT to the whole group and the launcher then sends SIGTERM: shut down once.
let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  await appendAudit(pool, { actorType: 'system', action: 'api.stopping', data: { pid: process.pid } }).catch(() => {});
  await app.close();
  await hub.stop();
  await pool.end().catch(() => {});
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
