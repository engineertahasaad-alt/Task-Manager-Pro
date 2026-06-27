#!/usr/bin/env node
/**
 * Taskaya APK Builder
 * Usage: node scripts/build-apk.js
 * Requires: EXPO_TOKEN env var
 */

const { execSync, spawn } = require('child_process');
const path = require('path');

const POLL_INTERVAL_MS = 15000;
const MAX_WAIT_MS = 30 * 60 * 1000; // 30 minutes

function log(msg) {
  console.log(`[build-apk] ${msg}`);
}

function runJson(cmd, cwd) {
  try {
    const output = execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return JSON.parse(output.trim());
  } catch (e) {
    const stderr = e.stderr ? e.stderr.toString() : '';
    const stdout = e.stdout ? e.stdout.toString() : '';
    throw new Error(`Command failed: ${cmd}\nstdout: ${stdout}\nstderr: ${stderr}`);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const token = process.env.EXPO_TOKEN;
  if (!token) {
    console.error('\nERROR: EXPO_TOKEN is not set.');
    console.error('Please add your Expo token as a secret named EXPO_TOKEN.');
    console.error('Get it from: https://expo.dev/settings/access-tokens\n');
    process.exit(1);
  }

  const appDir = path.resolve(__dirname, '..');
  log(`Working directory: ${appDir}`);

  log('Starting EAS build for Android (profile: preview)...');
  log('This will build a .apk file for internal distribution.');
  log('');

  let buildId;
  try {
    const result = runJson(
      'eas build --platform android --profile preview --non-interactive --json --no-wait',
      appDir
    );
    buildId = Array.isArray(result) ? result[0]?.id : result?.id;
    if (!buildId) {
      console.error('Could not extract build ID from EAS response:', JSON.stringify(result));
      process.exit(1);
    }
  } catch (e) {
    console.error('Failed to start build:', e.message);
    process.exit(1);
  }

  log(`Build started! ID: ${buildId}`);
  log(`Track at: https://expo.dev/builds/${buildId}`);
  log('');
  log('Polling for completion...');

  const started = Date.now();
  while (Date.now() - started < MAX_WAIT_MS) {
    await sleep(POLL_INTERVAL_MS);

    let build;
    try {
      const builds = runJson(`eas build:view ${buildId} --json`, appDir);
      build = Array.isArray(builds) ? builds[0] : builds;
    } catch (e) {
      log(`Poll error (will retry): ${e.message.split('\n')[0]}`);
      continue;
    }

    const status = build?.status;
    const elapsed = Math.round((Date.now() - started) / 1000);
    log(`Status: ${status} (${elapsed}s elapsed)`);

    if (status === 'FINISHED') {
      const url = build?.artifacts?.buildUrl || build?.artifactUrl;
      if (url) {
        log('');
        log('='.repeat(60));
        log('BUILD COMPLETE!');
        log('');
        log(`APK Download URL:`);
        log(url);
        log('='.repeat(60));
        log('');
        log('Install on Android: download the APK and open it on your device.');
        log('You may need to enable "Install from unknown sources" in Settings.');
      } else {
        log('Build finished but no download URL found.');
        log('Check your build at: https://expo.dev/builds/' + buildId);
      }
      process.exit(0);
    }

    if (status === 'ERRORED' || status === 'CANCELED') {
      console.error('');
      console.error(`Build ${status.toLowerCase()}.`);
      console.error(`See logs at: https://expo.dev/builds/${buildId}`);
      process.exit(1);
    }
  }

  console.error('Timed out waiting for build (30 min). Check status at:');
  console.error(`https://expo.dev/builds/${buildId}`);
  process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
