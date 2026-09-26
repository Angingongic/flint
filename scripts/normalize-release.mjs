import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeMetadata } from './release-metadata.mjs';

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
if (!release.draft) throw Error('Refusing to modify a published release');

const latest = release.assets.find((a) => a.name === 'latest.json');
if (!latest) throw Error('Missing latest.json');

const metadata = JSON.parse(gh(['api',`repos/${repo}/releases/assets/${latest.id}`,'-H','Accept: application/octet-stream']));
const normalized = normalizeMetadata(metadata, release, repo, tag);
const dir = mkdtempSync(join(tmpdir(), 'flint-release-'));
try {
  const file = join(dir, 'latest.json');
  writeFileSync(file, JSON.stringify(normalized,null,2)+'\n');
  gh(['release','upload',tag,file,'--repo',repo,'--clobber']);
} finally { rmSync(dir,{recursive:true,force:true}); }
console.log('Normalized updater URLs to the final release tag.');
