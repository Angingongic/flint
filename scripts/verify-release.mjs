import { execFileSync } from 'node:child_process';
const tag = process.env.RELEASE_TAG, repo = process.env.GITHUB_REPOSITORY;
if (!tag || !repo) throw Error('RELEASE_TAG and GITHUB_REPOSITORY required');
const gh = args => execFileSync('gh',args,{encoding:'utf8'});
// GitHub's by-tag REST lookup can return 404 for drafts. Resolve the draft
// through the authenticated release list, then use its stable numeric ID.
const pages = JSON.parse(gh(['api',`repos/${repo}/releases?per_page=100`,'--paginate','--slurp']));
const release = pages.flat().find(r => r.tag_name === tag);
if (!release) throw Error(`Release ${tag} not found`);
const asset = release.assets.find(a=>a.name==='latest.json');
if (!asset) throw Error('Missing latest.json');
const download = id => gh(['api',`repos/${repo}/releases/assets/${id}`,'-H','Accept: application/octet-stream']);
const metadata = JSON.parse(download(asset.id));
if (metadata.version !== tag.slice(1)) throw Error('Updater version does not match release tag');
for (const required of ['windows-x86_64','darwin-aarch64','darwin-x86_64']) if (!metadata.platforms?.[required]) throw Error(`Missing ${required}`);
if (!metadata.notes?.trim()) throw Error('Updater release notes are empty');
for (const platform of Object.keys(metadata.platforms)) {
  const item = metadata.platforms?.[platform];
  if (!item?.signature || !item?.url) throw Error(`Invalid ${platform} metadata`);
  const itemUrl = new URL(item.url);
  const releasePrefix = `/${repo}/releases/download/${tag}/`;
  if (itemUrl.protocol !== 'https:' || itemUrl.hostname !== 'github.com' || itemUrl.search || itemUrl.hash || !itemUrl.pathname.startsWith(releasePrefix) || itemUrl.pathname.slice(releasePrefix.length).includes('/')) throw Error(`Invalid ${platform} metadata URL`);
  // Normalization must have replaced all temporary/API URLs before verification.
  const name = decodeURIComponent(itemUrl.pathname.split('/').pop());
  const binary = release.assets.find(a=>a.name===name), signature = release.assets.find(a=>a.name===`${name}.sig`);
  if (platform === 'windows-x86_64' && !name.endsWith('-setup.exe')) throw Error('Windows updater must use NSIS installer');
  if (platform.startsWith('darwin-') && !name.endsWith('.app.tar.gz')) throw Error('Mac updater must use app archive');
  if (!binary?.size || !signature?.size) throw Error(`${platform} references missing artifact/signature: ${name}`);
  if (download(signature.id).trim() !== item.signature.trim()) throw Error(`${platform} signature differs from uploaded .sig`);
}
for (const suffix of ['.dmg','.app.tar.gz','-setup.exe']) if (!release.assets.some(a=>a.name.endsWith(suffix))) throw Error(`Missing ${suffix} asset`);
console.log('Validated version, Windows x64 and both Mac architectures, artifact URLs and matching detached signatures.');
