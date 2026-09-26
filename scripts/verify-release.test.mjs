import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMetadata } from './release-metadata.mjs';
const source = readFileSync(new URL('./verify-release.mjs', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
function verify(change = () => {}) {
  const names = ['latest.json','Flint_0.1.2_x64-setup.exe','Flint_0.1.2_x64-setup.exe.sig','Flint_universal.app.tar.gz','Flint_universal.app.tar.gz.sig','Flint_0.1.2_universal.dmg'];
  const release = {id:123,tag_name:'v0.1.2',draft:true,assets:names.map((name,id)=>({name,id,size:100}))};
  const win={url:'https://github.com/Angingongic/flint/releases/download/v0.1.2/'+names[1],signature:'signature'};
  const mac={url:'https://github.com/Angingongic/flint/releases/download/v0.1.2/'+names[3],signature:'signature'};
  const metadata={version:'0.1.2',notes:'Release notes',platforms:{'windows-x86_64':win,'darwin-aarch64':mac,'darwin-x86_64':mac,'extra':{...win}}};
  change(metadata,release);
  runInNewContext(source,{URL,process:{env:{RELEASE_TAG:'v0.1.2',GITHUB_REPOSITORY:'Angingongic/flint'}},console:{log(){}},execFileSync:(_cmd,args)=>{
    assert.ok(!args[1].includes('/tags/'), 'must resolve drafts through release list');
    if(args[1].includes('per_page')) return JSON.stringify([[release]]);
    return args[1].endsWith('/0') ? JSON.stringify(metadata) : 'signature\n';
  }});
}
test('validates a draft through release ID/list and all updater entries',()=>verify());
test('rejects empty notes and invalid additional platform URLs',()=>{
  assert.throws(()=>verify(m=>{m.notes='';}),/notes are empty/);
  assert.throws(()=>verify(m=>{m.platforms.extra.url='https://invalid.example/file';}),/Invalid extra/);
});
test('rejects missing assets and signatures differing from uploaded files',()=>{
  assert.throws(()=>verify((_m,r)=>{r.assets=r.assets.filter(a=>a.id!==1);}),/missing artifact/);
  assert.throws(()=>verify(m=>{m.platforms.extra.signature='wrong';}),/differs/);
});
test('requires the exact final tag even for drafts',()=>{
  for(const tag of ['untagged-123','v0.1.1']) assert.throws(()=>verify(m=>{m.platforms.extra.url=m.platforms.extra.url.replace('v0.1.2',tag);}),/Invalid extra/);
});
test('normalizes API asset IDs and temporary URLs without changing signatures',()=>{
  const repo='Angingongic/flint',tag='v2.0.0',asset={id:123,name:'Flint_2.0.0_universal.app.tar.gz',size:100};
  for(const url of [`https://api.github.com/repos/${repo}/releases/assets/123`,`https://github.com/${repo}/releases/download/untagged-123/${asset.name}`]) {
    const input={version:'2.0.0',notes:'notes',platforms:{'darwin-aarch64':{url,signature:'unchanged'}}};
    const result=normalizeMetadata(input,{assets:[asset]},repo,tag);
    assert.equal(result.platforms['darwin-aarch64'].url,`https://github.com/${repo}/releases/download/${tag}/${asset.name}`);
    assert.equal(result.platforms['darwin-aarch64'].signature,'unchanged');
    assert.equal(input.platforms['darwin-aarch64'].url,url);
  }
});
test('rejects foreign, stale or ambiguous asset references',()=>{
 const asset={id:123,name:'app.tar.gz',size:100},repo='Angingongic/flint';
 for(const url of ['https://api.github.com/repos/other/repo/releases/assets/123','https://api.github.com/repos/Angingongic/flint/releases/assets/999','https://github.com/Angingongic/flint/releases/download/v1/app.tar.gz']) {
   assert.throws(()=>normalizeMetadata({version:'2.0.0',platforms:{mac:{url,signature:'sig'}}},{assets:[asset]},repo,'v2.0.0'),/missing or ambiguous/);
 }
});
