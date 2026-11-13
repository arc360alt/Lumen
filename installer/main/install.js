// Runs the installer back end (backend/lumen-install, a root shell script) and turns what it prints into
// events for the UI. The settings, passwords included, go to it on stdin — never on a command line or in a file.
//
// The back end prints ordinary log lines plus a few control lines:
//   @@PROGRESS <0-100> <what it's doing>     @@STEP <id>     @@ERROR <message>     @@DONE
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const BACKEND = path.join(__dirname, '..', 'backend', 'lumen-install');
let child = null;

function validate(c) {
  const s = c.storage || {};
  if (!['erase', 'manual'].includes(s.mode)) throw new Error('Choose where to install Lumen.');
  if (s.mode === 'erase' && !/^\/dev\/[\w/-]+$/.test(s.disk || '')) throw new Error('Choose a disk.');
  if (s.mode === 'manual' && !/^\/dev\/[\w/-]+$/.test(s.root || '')) throw new Error('Choose a partition for Lumen.');
  if (!['ext4', 'btrfs', 'xfs'].includes(s.filesystem)) throw new Error('Unknown file system.');
  if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(c.user?.username || '')) throw new Error('The account name isn’t valid.');
  if (!c.user?.password) throw new Error('Choose a password.');
  if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(c.hostname || '')) throw new Error('The computer name isn’t valid.');
}

function start(config, emit) {
  if (child) throw new Error('Lumen is already being installed.');
  validate(config);
  const test = !!config.test;
  const cmd = test ? 'bash' : 'sudo';
  const args = test ? [BACKEND, '--dry-run'] : ['-n', BACKEND];
  if (!fs.existsSync(BACKEND)) throw new Error('The installer’s back end is missing (' + BACKEND + ').');
  child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, LC_ALL: 'C.UTF-8' } });
  let failed = null, done = false, buf = '';
  const onLine = (line) => {
    const m = /^@@(\w+)\s?(.*)$/.exec(line);
    if (!m) return emit({ type: 'log', text: line });
    const [, kind, rest] = m;
    if (kind === 'PROGRESS') { const [pct, ...t] = rest.split(' '); emit({ type: 'progress', value: +pct, text: t.join(' ') }); }
    else if (kind === 'STEP') emit({ type: 'step', id: rest.trim() });
    else if (kind === 'ERROR') { failed = rest; emit({ type: 'log', text: 'ERROR: ' + rest }); }
    else if (kind === 'DONE') done = true;
  };
  const reader = (stream) => stream.on('data', (d) => {
    buf += d.toString('utf8');
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { onLine(buf.slice(0, i).replace(/\r/g, '')); buf = buf.slice(i + 1); }
  });
  reader(child.stdout);
  child.stderr.on('data', (d) => String(d).split('\n').filter(Boolean).forEach((l) => emit({ type: 'log', text: l })));
  child.on('error', (e) => { failed = e.message; });
  child.on('close', (code) => {
    child = null;
    if (done && code === 0) emit({ type: 'done' });
    else emit({ type: 'failed', error: failed || (code === 1 && !test ? 'The installer stopped unexpectedly (exit code 1). Is passwordless sudo available?' : `The installer stopped (exit code ${code}).`) });
  });
  // the settings, including passwords, go over stdin only
  const { test: _t, ...payload } = config;
  child.stdin.end(JSON.stringify(payload));
  return { ok: true };
}

function cancel() {
  if (!child) return { ok: false };
  child.kill('SIGTERM');
  return { ok: true };
}

module.exports = { start, cancel, running: () => !!child };
