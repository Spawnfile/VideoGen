import { describe, expect, it } from 'vitest';
import { parseServeStatus } from '../../../bin/tailnet-status.mjs';

// Shapes from `tailscale serve status --json` on Tailscale 1.102 (this machine: 443 → 8091).
const base = {
  TCP: { '443': { HTTPS: true }, '8443': { HTTPS: true } },
  Web: {
    'alper-pc.tailef7c0d.ts.net:443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:8091' } } },
    'alper-pc.tailef7c0d.ts.net:8443': { Handlers: { '/': { Proxy: 'http://127.0.0.1:5181' } } },
  },
};

describe('tailscale serve status', () => {
  it('finds the proxy target behind a port', () => {
    expect(parseServeStatus(base, 8443)).toEqual({ served: true, target: 'http://127.0.0.1:5181', funnel: false });
    expect(parseServeStatus(base, 443)).toEqual({ served: true, target: 'http://127.0.0.1:8091', funnel: false });
  });
  it('reports a port that is not served', () => {
    expect(parseServeStatus(base, 9443)).toEqual({ served: false, target: null, funnel: false });
    expect(parseServeStatus({}, 8443)).toEqual({ served: false, target: null, funnel: false });
  });
  it('flags Funnel on the port', () => {
    expect(parseServeStatus({ ...base, AllowFunnel: { 'alper-pc.tailef7c0d.ts.net:8443': true } }, 8443).funnel).toBe(true);
    expect(parseServeStatus({ ...base, AllowFunnel: { 'alper-pc.tailef7c0d.ts.net:443': true } }, 8443).funnel).toBe(false);
  });
});
