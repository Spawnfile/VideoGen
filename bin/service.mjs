#!/usr/bin/env node
// Runs VideoGen as a systemd user service so it comes back after a reboot (no login needed: lingering).
//   node bin/service.mjs install     writes ~/.config/systemd/user/videogen.service, enables and starts it
//   node bin/service.mjs uninstall   stops, disables and removes it
//   node bin/service.mjs status
// Machine-specific variables (VG_TAILNET_HOST, VG_TAILNET_USERS, VG_PORT, …) go in ~/.config/videogen/env;
// install creates it from `tailscale` once if it does not exist and never overwrites it.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const UNIT_DIR = join(homedir(), '.config/systemd/user');
const UNIT = join(UNIT_DIR, 'videogen.service');
const ENV_FILE = join(homedir(), '.config/videogen/env');
const sc = (...a) => spawnSync('systemctl', ['--user', ...a], { stdio: 'inherit' }).status;

function unit() {
  // nvm's node is not on systemd's PATH: pin the directory of the node running this script. ~/.local/bin holds the user's own
  // tools (ffmpeg, blender-gpu on this machine); without it every preview failed with a bare "Error" (ffmpeg ENOENT).
  const path = [dirname(process.execPath), join(homedir(), '.local/bin'), '/usr/local/sbin', '/usr/local/bin', '/usr/sbin', '/usr/bin', '/sbin', '/bin'].join(':');
  return `[Unit]
Description=VideoGen (Postgres container, migrations, API + worker)
After=network-online.target
Wants=network-online.target
# Keep retrying forever: at boot Docker or the network may not be ready on the first attempts.
StartLimitIntervalSec=0

[Service]
Type=simple
WorkingDirectory=${ROOT}
Environment=PATH=${path}
Environment=VG_NO_BROWSER=1
EnvironmentFile=-${ENV_FILE}
ExecStart=${process.execPath} bin/videogen.mjs
Restart=always
RestartSec=10
# SIGTERM only the launcher; it stops the API and worker within 10 s, then systemd kills what is left.
KillMode=mixed
TimeoutStopSec=30

[Install]
WantedBy=default.target
`;
}

function envFile() {
  if (existsSync(ENV_FILE)) return console.log(`${ENV_FILE} exists, left as is`);
  let lines = ['# VideoGen service environment (read by videogen.service)'];
  try {
    const out = execFileSync('node', [join(ROOT, 'bin/tailnet.mjs'), 'status'], { encoding: 'utf8' });
    const m = out.match(/VG_TAILNET_HOST=(\S+) VG_TAILNET_USERS=(\S+)/);
    if (m && !m[2].startsWith('<')) lines.push(`VG_TAILNET_HOST=${m[1]}`, `VG_TAILNET_USERS=${m[2]}`);
  } catch {}
  mkdirSync(dirname(ENV_FILE), { recursive: true });
  writeFileSync(ENV_FILE, lines.join('\n') + '\n', { mode: 0o600 });
  console.log(`wrote ${ENV_FILE}:\n${lines.slice(1).join('\n') || '(no tailnet variables: phone access off)'}`);
}

function linger() {
  const out = spawnSync('loginctl', ['show-user', userInfo().username, '-p', 'Linger'], { encoding: 'utf8' }).stdout ?? '';
  if (!out.includes('Linger=yes')) console.log(`Lingering is off: the service only starts after you log in. Turn it on: sudo loginctl enable-linger ${userInfo().username}`);
}

const cmd = process.argv[2] ?? 'status';
if (cmd === 'install') {
  mkdirSync(UNIT_DIR, { recursive: true });
  writeFileSync(UNIT, unit());
  console.log(`wrote ${UNIT}`);
  envFile();
  sc('daemon-reload');
  process.exitCode = sc('enable', '--now', 'videogen.service');
  linger();
  console.log('logs: journalctl --user -u videogen -f  (API/worker: ~/videogen-data/logs)');
} else if (cmd === 'uninstall') {
  sc('disable', '--now', 'videogen.service');
  rmSync(UNIT, { force: true });
  sc('daemon-reload');
  console.log(`removed ${UNIT} (${ENV_FILE} kept)`);
} else if (cmd === 'status') {
  process.exitCode = sc('status', '--no-pager', 'videogen.service');
} else {
  console.error('usage: node bin/service.mjs install|uninstall|status');
  process.exit(1);
}
