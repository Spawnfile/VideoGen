export interface ClaudeAuth {
  loggedIn: boolean;
  authMethod: string | null;
  subscriptionType: string | null;
  checkedAt: string;
  error?: string;
}

/** Keeps only non-identifying fields; e-mail and org ids are dropped on purpose. */
export function parseAuthStatus(stdout: string, at: Date = new Date()): ClaudeAuth {
  const j = JSON.parse(stdout) as Record<string, unknown>;
  return {
    loggedIn: j.loggedIn === true,
    authMethod: typeof j.authMethod === 'string' ? j.authMethod : null,
    subscriptionType: typeof j.subscriptionType === 'string' ? j.subscriptionType : null,
    checkedAt: at.toISOString(),
  };
}
