export function normalizeMetadata(metadata, release, repo, tag) {
  if (metadata.version !== tag.slice(1)) throw Error('Updater version does not match release tag');
  const result = structuredClone(metadata);
  for (const [platform, item] of Object.entries(result.platforms || {})) {
    if (!item?.url || !item.signature) throw Error(`Invalid ${platform} metadata`);
    const url = new URL(item.url);
    if (url.protocol !== 'https:' || url.search || url.hash) throw Error(`Invalid ${platform} URL`);
    let matches = [];
    const apiPrefix = `/repos/${repo}/releases/assets/`;
    const downloadPrefix = `/${repo}/releases/download/`;
    if (url.hostname === 'api.github.com' && url.pathname.startsWith(apiPrefix)) {
      const id = url.pathname.slice(apiPrefix.length);
      if (/^\d+$/.test(id)) matches = release.assets.filter(a => String(a.id) === id);
    } else if (url.hostname === 'github.com' && url.pathname.startsWith(downloadPrefix)) {
      const parts = url.pathname.slice(downloadPrefix.length).split('/');
      if (parts.length === 2 && (decodeURIComponent(parts[0]) === tag || parts[0].startsWith('untagged-'))) {
        const name = decodeURIComponent(parts[1]);
        matches = release.assets.filter(a => a.name === name);
      }
    }
    if (matches.length !== 1 || !matches[0].size) throw Error(`${platform} references missing or ambiguous artifact: ${item.url}`);
    item.url = `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(matches[0].name)}`;
  }
  return result;
}
