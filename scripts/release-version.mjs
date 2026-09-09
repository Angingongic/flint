import { readFileSync, writeFileSync } from 'node:fs';
const json = p => JSON.parse(readFileSync(p, 'utf8'));
const pkg = json('package.json'), lock = json('package-lock.json'), config = json('src-tauri/tauri.conf.json');
let cargo = readFileSync('src-tauri/Cargo.toml', 'utf8'), cargoLock = readFileSync('src-tauri/Cargo.lock', 'utf8');
const mode = process.argv[2];
const cargoVersion = cargo.match(/\[package\][\s\S]*?\nversion = "([^"]+)"/)?.[1];
const lockVersion = cargoLock.match(/\[\[package\]\]\r?\nname = "flint"\r?\nversion = "([^"]+)"/)?.[1];
if (![config.version, lock.version, lock.packages[''].version, cargoVersion, lockVersion].every(v => v === pkg.version)) throw Error('Version mismatch: package.json, npm lock, Tauri, Cargo.toml and Cargo.lock must agree.');
if (mode === 'check') {
  const tag = process.env.GITHUB_REF_NAME || process.argv[3] || `v${pkg.version}`;
  if (tag !== `v${pkg.version}` || !/^v\d+\.\d+\.\d+$/.test(tag)) throw Error(`Release tag ${tag} must equal v${pkg.version} (stable semver).`);
  if (config.bundle.createUpdaterArtifacts !== true) throw Error('Production updater artifacts must be enabled.');
  if (!Buffer.from(config.plugins.updater.pubkey, 'base64').toString().includes('minisign public key:')) throw Error('Missing or invalid updater public key.');
  if (config.plugins.updater.endpoints[0] !== 'https://github.com/Angingongic/flint/releases/latest/download/latest.json') throw Error('Incorrect production endpoint.');
  const notes = readFileSync('RELEASE_NOTES.md', 'utf8').replace(/\r\n/g, '\n').trim();
  if (!notes.startsWith(`# Flint ${pkg.version}\n`) || notes.includes('TODO')) throw Error('Write clean RELEASE_NOTES.md for this version before tagging.');
  console.log(`Release ${tag}: all versions and updater configuration agree.`);
} else {
  if (!['patch', 'minor', 'major'].includes(mode)) throw Error('Usage: node scripts/release-version.mjs check|patch|minor|major');
  const parts = pkg.version.split('.').map(Number), index = {major:0,minor:1,patch:2}[mode];
  parts[index]++; for (let i=index+1;i<3;i++) parts[i]=0;
  const version = parts.join('.');
  pkg.version = lock.version = lock.packages[''].version = config.version = version;
  cargo = cargo.replace(/(\[package\][\s\S]*?\nversion = ")[^"]+/, `$1${version}`);
  cargoLock = cargoLock.replace(/(\[\[package\]\]\r?\nname = "flint"\r?\nversion = ")[^"]+/, `$1${version}`);
  for (const [path, value] of [['package.json',pkg],['package-lock.json',lock],['src-tauri/tauri.conf.json',config]]) writeFileSync(path, JSON.stringify(value,null,2)+'\n');
  writeFileSync('src-tauri/Cargo.toml', cargo); writeFileSync('src-tauri/Cargo.lock', cargoLock);
  writeFileSync('RELEASE_NOTES.md', `# Flint ${version}\n\nTODO: Describe the user-facing changes before tagging this release.\n`);
  console.log(`Prepared ${version}. Edit RELEASE_NOTES.md, run checks, commit, then push v${version}. Nothing was pushed.`);
}
