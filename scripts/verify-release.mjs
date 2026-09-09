import { execFileSync } from 'node:child_process';
const tag = process.env.RELEASE_TAG, repo = process.env.GITHUB_REPOSITORY;
if (!tag || !repo) throw Error('RELEASE_TAG and GITHUB_REPOSITORY required');
const gh = args => execFileSync('gh',args,{encoding:'utf8'});
const release = JSON.parse(gh(['api',`repos/${repo}/releases/tags/${tag}`]));
const asset = release.assets.find(a=>a.name==='latest.json');
if (!asset) throw Error('Missing latest.json');
const download = id => gh(['api',`repos/${repo}/releases/assets/${id}`,'-H','Accept: application/octet-stream']);
const metadata = JSON.parse(download(asset.id));
if (metadata.version !== tag.slice(1)) throw Error('Updater version does not match release tag');
for (const platform of ['windows-x86_64','darwin-aarch64','darwin-x86_64']) {
  const item = metadata.platforms?.[platform];
  if (!item?.signature || !item.url?.startsWith(`https://github.com/${repo}/releases/download/${tag}/`)) throw Error(`Invalid ${platform} metadata`);
  const name = decodeURIComponent(new URL(item.url).pathname.split('/').pop());
  const binary = release.assets.find(a=>a.name===name), signature = release.assets.find(a=>a.name===`${name}.sig`);
  if (!binary?.size || !signature?.size) throw Error(`${platform} references missing artifact/signature: ${name}`);
  if (download(signature.id).trim() !== item.signature.trim()) throw Error(`${platform} signature differs from uploaded .sig`);
}
for (const suffix of ['.dmg','.app.tar.gz','-setup.exe']) if (!release.assets.some(a=>a.name.endsWith(suffix))) throw Error(`Missing ${suffix} asset`);
console.log('Validated version, Windows x64 and both Mac architectures, artifact URLs and matching detached signatures.');
