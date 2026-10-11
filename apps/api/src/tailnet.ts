/** Phone access through Tailscale Serve: the exact `host:port` the browser uses and the Tailscale logins allowed in. Both or nothing. */
export interface TailnetConfig { host: string | null; users: string[] }

export function tailnetConfig(env: NodeJS.ProcessEnv = process.env): TailnetConfig {
  const host = env.VG_TAILNET_HOST?.trim() || null;
  const users = (env.VG_TAILNET_USERS ?? '').split(',').map((u) => u.trim()).filter(Boolean);
  return host && users.length ? { host, users } : { host: null, users: [] };
}
