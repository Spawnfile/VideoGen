#!/usr/bin/env node
// Phone access through Tailscale Serve (tailnet only, never Funnel).
//   node bin/tailnet.mjs status  [--port 8443]
//   node bin/tailnet.mjs enable  [--port 8443] [--target 5180]   (runs `sudo tailscale serve --bg …`)
//   node bin/tailnet.mjs disable [--port 8443]
import { execFileSync } from 'node:child_process';
import { parseServeStatus } from './tailnet-status.mjs';

const args = process.argv.slice(2);
const cmd = args[0] ?? 'status';
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const port = Number(opt('port', 8443));
const target = Number(opt('target', process.env.VG_PORT ?? 5180));
const ts = (...a) => execFileSync('tailscale', a, { encoding: 'utf8' });
const sudoTs = (...a) => execFileSync('sudo', ['-n', 'tailscale', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

function identity() {
  const s = JSON.parse(ts('status', '--json'));
  const host = `${s.Self.DNSName.replace(/\.$/, '')}:${port}`;
  const login = s.User?.[String(s.Self.UserID)]?.LoginName ?? null;
  return { host, login };
}
function status() {
  const raw = ts('serve', 'status', '--json').trim();
  return parseServeStatus(raw ? JSON.parse(raw) : {}, port);
}
function report() {
  const st = status();
  const { host, login } = identity();
  if (st.funnel) {
    console.error(`Funnel is ON for port ${port}: VideoGen would be on the public internet. Turn it off: sudo tailscale funnel --https=${port} off`);
    process.exit(2);
  }
  console.log(st.served ? `https://${host} → ${st.target} (tailnet only)` : `Port ${port} is not served.`);
  console.log(`API env: VG_TAILNET_HOST=${host} VG_TAILNET_USERS=${login ?? '<your tailscale login>'}`);
}

if (cmd === 'status') report();
else if (cmd === 'enable') {
  const st = status();
  if (st.served && st.target !== `http://127.0.0.1:${target}`) {
    console.error(`Port ${port} already serves ${st.target}. Pick another --port or disable it first.`);
    process.exit(1);
  }
  sudoTs('serve', '--bg', `--https=${port}`, `http://127.0.0.1:${target}`);
  report();
} else if (cmd === 'disable') {
  sudoTs('serve', `--https=${port}`, 'off');
  console.log(`Port ${port} no longer served.`);
} else {
  console.error('usage: node bin/tailnet.mjs status|enable|disable [--port 8443] [--target 5180]');
  process.exit(1);
}
