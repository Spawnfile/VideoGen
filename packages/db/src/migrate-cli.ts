import { loadConfig } from '@videogen/shared';
import { runMigrations } from './migrate.ts';

await runMigrations(loadConfig().adminDatabaseUrl);
console.log('migrations applied');
