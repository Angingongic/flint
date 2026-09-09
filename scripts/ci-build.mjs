import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Keep signing material in process environment, never in generated config files.
const env = { ...process.env };
const mac = process.platform === 'darwin';
const updater = Boolean(env.TAURI_SIGNING_PRIVATE_KEY);
if (process.argv.includes('--release') && !updater) throw new Error('Production release requires TAURI_SIGNING_PRIVATE_KEY. Password may be empty.');
const developerId = mac && Boolean(env.APPLE_CERTIFICATE && env.APPLE_SIGNING_IDENTITY);
const notarize = developerId && Boolean(env.APPLE_ID && env.APPLE_PASSWORD && env.APPLE_TEAM_ID);
if (!developerId) {
  delete env.APPLE_CERTIFICATE;
  delete env.APPLE_CERTIFICATE_PASSWORD;
  delete env.APPLE_SIGNING_IDENTITY;
}
if (!notarize) {
  delete env.APPLE_ID;
  delete env.APPLE_PASSWORD;
  delete env.APPLE_TEAM_ID;
}
if (!updater) {
  delete env.TAURI_SIGNING_PRIVATE_KEY;
  delete env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD;
}
const config = {
  // Frontend was explicitly built and tested in the preceding workflow steps.
  build: { beforeBuildCommand: '' },
  bundle: {
    createUpdaterArtifacts: updater,
    ...(mac ? { macOS: { signingIdentity: developerId ? env.APPLE_SIGNING_IDENTITY : '-' } } : {}),
  },
};
mkdirSync('work', { recursive: true });
mkdirSync('ci-artifacts', { recursive: true });
writeFileSync('work/ci-build.json', JSON.stringify(config));
const status = mac
  ? notarize ? 'Developer ID signing and notarization requested; build must succeed before distribution.'
    : 'NOT NOTARIZED FOR PUBLIC DISTRIBUTION. ' + (developerId ? 'Developer ID signed.' : 'Ad-hoc signed testing build; Gatekeeper may block downloaded copies.')
  : 'Windows installer; Authenticode signing is not configured by this workflow.';
writeFileSync('ci-artifacts/BUILD-STATUS.txt', `${status}\nUpdater signatures: ${updater ? 'enabled' : 'disabled (no signing key)'}\nCommit: ${env.GITHUB_SHA || 'local'}\n`);
console.log(status);
const args = ['node_modules/@tauri-apps/cli/tauri.js', 'build', '--config', 'work/ci-build.json'];
if (mac) args.push('--target', 'universal-apple-darwin', '--bundles', 'app,dmg');
else args.push('--bundles', 'nsis,msi');
const result = spawnSync(process.execPath, args, { env, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
