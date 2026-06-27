#!/usr/bin/env node
/**
 * Taskaya OTA Update Pusher
 * Usage: node scripts/push-update.js
 * Requires: EXPO_TOKEN env var
 * 
 * Pushes JS bundle changes to all installed APKs instantly.
 * No rebuild needed — users get the update on next app launch.
 */

const { execSync } = require('child_process');
const path = require('path');

const EAS_BIN = (() => {
  const candidates = [
    '/home/runner/workspace/.config/npm/node_global/bin/eas',
    '/nix/store/spvnxml8f61qy1jrnlfz9p1yhjyh0f4j-eas-cli-14.7.1/bin/eas',
  ];
  for (const c of candidates) {
    try { execSync(`test -x ${c}`); return c; } catch (_) {}
  }
  return 'eas';
})();

const appDir = path.resolve(__dirname, '..');

function log(msg) { console.log(`[push-update] ${msg}`); }

function run(cmd) {
  return execSync(cmd, {
    cwd: appDir,
    encoding: 'utf8',
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    stdio: ['pipe', 'pipe', 'pipe']
  });
}

async function main() {
  if (!process.env.EXPO_TOKEN) {
    console.error('ERROR: EXPO_TOKEN is not set.');
    process.exit(1);
  }

  const message = process.argv[2] || `Update ${new Date().toISOString().slice(0, 16)}`;
  log(`Pushing OTA update to "preview" channel...`);
  log(`Message: ${message}`);
  log('');

  try {
    const output = run(
      `${EAS_BIN} update --channel preview --message "${message}" --non-interactive --json`
    );
    const result = JSON.parse(output.trim());
    const updateId = Array.isArray(result) ? result[0]?.id : result?.id;
    log('');
    log('='.repeat(60));
    log('OTA UPDATE PUBLISHED!');
    log(`Update ID: ${updateId}`);
    log('Users will receive this update on next app launch.');
    log('No reinstall required.');
    log('='.repeat(60));
  } catch (e) {
    console.error('Failed to push update:', e.message);
    process.exit(1);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
