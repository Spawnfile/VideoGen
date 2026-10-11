/** `tailscale serve status --json` → what is behind one HTTPS port, and whether Funnel (public internet) is on for it. */
export function parseServeStatus(status, port) {
  const suffix = `:${port}`;
  const web = Object.entries(status?.Web ?? {}).find(([hostPort]) => hostPort.endsWith(suffix));
  const funnel = Object.entries(status?.AllowFunnel ?? {}).some(([hostPort, on]) => on === true && hostPort.endsWith(suffix));
  const target = web?.[1]?.Handlers?.['/']?.Proxy ?? null;
  return { served: target !== null, target, funnel };
}
