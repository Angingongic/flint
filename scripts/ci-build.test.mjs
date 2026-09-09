import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('./ci-build.mjs', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
function simulate(platform, env = {}, argv = []) {
  const files = {};
  let call;
  runInNewContext(source, {
    process: { platform, env, argv, execPath: 'node', exit: code => assert.equal(code, 0) },
    mkdirSync() {}, writeFileSync: (path, data) => { files[path] = data; },
    spawnSync: (command, args, options) => { call = { command, args, ...options }; return { status: 0 }; },
    console: { log() {} },
  });
  return { config: JSON.parse(files['work/ci-build.json']), status: files['ci-artifacts/BUILD-STATUS.txt'], call };
}
test('credential-free Mac build is universal, ad-hoc and not notarized', () => {
  const result = simulate('darwin');
  assert.equal(result.config.bundle.macOS.signingIdentity, '-');
  assert.equal(result.config.bundle.createUpdaterArtifacts, false);
  assert.ok(result.call.args.includes('universal-apple-darwin'));
  assert.ok(result.call.args.includes('app,dmg'));
  assert.match(result.status, /NOT NOTARIZED/);
});
test('production release requires signing but supports an empty password', () => {
  assert.throws(() => simulate('darwin', {}, ['--release']), /requires TAURI_SIGNING_PRIVATE_KEY/);
  assert.equal(simulate('darwin', {TAURI_SIGNING_PRIVATE_KEY:'secret', TAURI_SIGNING_PRIVATE_KEY_PASSWORD:''}, ['--release']).config.bundle.createUpdaterArtifacts, true);
});
test('Windows retains NSIS and MSI without Apple environment', () => {
  const result = simulate('win32', { APPLE_CERTIFICATE: 'secret', APPLE_ID: 'email' });
  assert.ok(result.call.args.includes('nsis,msi'));
  assert.equal(result.call.env.APPLE_CERTIFICATE, undefined);
  assert.equal(result.call.env.APPLE_ID, undefined);
});
test('updater signing is independent of Apple signing', () => {
  const result = simulate('darwin', { TAURI_SIGNING_PRIVATE_KEY: 'secret' });
  assert.equal(result.config.bundle.createUpdaterArtifacts, true);
  assert.equal(result.config.bundle.macOS.signingIdentity, '-');
  assert.equal(result.call.env.TAURI_SIGNING_PRIVATE_KEY, 'secret');
  assert.ok(!JSON.stringify(result.config).includes('secret'));
});
test('partial Apple credentials do not block an ad-hoc build', () => {
  const result = simulate('darwin', { APPLE_CERTIFICATE: 'secret', APPLE_ID: 'email', APPLE_PASSWORD: 'secret' });
  assert.equal(result.config.bundle.macOS.signingIdentity, '-');
  assert.equal(result.call.env.APPLE_CERTIFICATE, undefined);
  assert.equal(result.call.env.APPLE_PASSWORD, undefined);
});
test('complete Apple credentials enable signing and notarization', () => {
  const result = simulate('darwin', { APPLE_CERTIFICATE: 'secret', APPLE_SIGNING_IDENTITY: 'Developer ID Application: Flint', APPLE_ID: 'email', APPLE_PASSWORD: 'secret', APPLE_TEAM_ID: 'team' });
  assert.match(result.config.bundle.macOS.signingIdentity, /Developer ID/);
  assert.equal(result.call.env.APPLE_TEAM_ID, 'team');
  assert.match(result.status, /notarization requested/);
});
