import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const source = readFileSync(new URL('./release-version.mjs', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
function verify({tag='v0.1.1', cargoVersion='0.1.1', mode='check', notes='# Flint 0.1.1\n\nReliable updates.'} = {}) {
  const files = {
    'package.json': JSON.stringify({version:'0.1.1'}),
    'package-lock.json': JSON.stringify({version:'0.1.1',packages:{'':{version:'0.1.1'}}}),
    'src-tauri/tauri.conf.json': JSON.stringify({version:'0.1.1',bundle:{createUpdaterArtifacts:true},plugins:{updater:{pubkey:Buffer.from('minisign public key: test').toString('base64'),endpoints:['https://github.com/Angingongic/flint/releases/latest/download/latest.json']}}}),
    'src-tauri/Cargo.toml': `[package]\nversion = "${cargoVersion}"`,
    'src-tauri/Cargo.lock': '[[package]]\nname = "flint"\nversion = "0.1.1"',
    'RELEASE_NOTES.md': notes,
  };
  runInNewContext(source, {Buffer, process:{argv:['node','script',mode],env:{GITHUB_REF_NAME:tag}},readFileSync:p=>files[p],writeFileSync:(p,v)=>{files[p]=v;},console:{log(){}}});
  return files;
}
test('release validates exact tag, all version files and clean notes',()=>{ verify(); assert.throws(()=>verify({tag:'v0.1.2'}),/must equal/); assert.throws(()=>verify({cargoVersion:'0.1.0'}),/Version mismatch/); assert.throws(()=>verify({notes:'# Flint 0.1.1\n\nTODO'}),/clean RELEASE_NOTES/); });
test('patch preparation synchronizes locks and config without publishing',()=>{const files=verify({mode:'patch'}); for(const p of ['package.json','package-lock.json','src-tauri/tauri.conf.json']) assert.equal(JSON.parse(files[p]).version,'0.1.2'); assert.match(files['src-tauri/Cargo.lock'],/0.1.2/); assert.match(files['src-tauri/Cargo.toml'],/0.1.2/);});
