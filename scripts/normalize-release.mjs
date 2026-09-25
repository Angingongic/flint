import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, unlinkSync, openSync, closeSync } from 'node:fs';

const tag = process.env.RELEASE_TAG;
const repo = process.env.GITHUB_REPOSITORY;
if (!tag || !repo) throw Error('RELEASE_TAG and GITHUB_REPOSITORY required');

const gh = (args, options = {}) =>
  execFileSync('gh', args, { encoding: 'utf8', ...options });

const pages = JSON.parse(
  gh(['api', `repos/${repo}/releases?per_page=100`, '--paginate', '--slurp']),
);
const release = pages.flat().find((r) => r.tag_name === tag);
if (!release) throw Error(`Release ${tag} not found`);

const latest = release.assets.find((a) => a.name === 'latest.json');
if (!latest) throw Error('Missing latest.json');

const tmp = 'latest.normalized.json';
const output = openSync(tmp, 'w');
try {
  execFileSync(
    'gh',
    [
      'api',
      `repos/${repo}/releases/assets/${latest.id}`,
      '-H',
      'Accept: application/octet-stream',
    ],
    { stdio: ['ignore', output, 'inherit'] },
  );
} finally {
  closeSync(output);
}
const metadata = JSON.parse(readFileSync(tmp, 'utf8'));

for (const [platform, item] of Object.entries(metadata.platforms || {})) {
  if (!item?.url) continue;
  const name = decodeURIComponent(new URL(item.url).pathname.split('/').pop());
  const asset = release.assets.find((a) => a.name === name);
  if (!asset) throw Error(`${platform} references missing artifact: ${name}`);
  item.url = `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(name)}`;
}

writeFileSync(tmp, JSON.stringify(metadata, null, 2) + '\n');
gh([
  'release',
  'upload',
  tag,
  tmp,
  '--clobber',
]);
unlinkSync(tmp);
console.log('Normalized updater URLs to the final release tag.');
