import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
// Reproducible extraction from official WNdb-3.0.tar.gz. No runtime wrapper,
// relation traversal, glosses, names, or network dependency is shipped.
const root=process.argv[2] || 'work/wordnet/dict';
const rows=[];
for(const pos of ['noun','verb','adj','adv']) {
  const ranks=new Map();
  for(const line of readFileSync(join(root,`index.${pos}`),'utf8').split('\n')) {
    if(!/^[a-z]/.test(line))continue;
    const f=line.trim().split(/\s+/),word=f[0];if(!/^[a-z]+$/.test(word))continue;
    const offsets=f.slice(6+Number(f[3]));
    offsets.slice(0,3).forEach((id,rank)=>ranks.set(`${word}:${id}`,rank));
  }
  for(const line of readFileSync(join(root,`data.${pos}`),'utf8').split('\n')) {
    if(!/^\d/.test(line))continue;
    const f=line.split('|')[0].trim().split(/\s+/),words=[];
    for(let i=0;i<parseInt(f[3],16);i++) {
      const word=f[4+i*2].replace(/\([a-z]+\)$/,'');
      const rank=ranks.get(`${word}:${f[0]}`);
      if(/^[a-z]+$/.test(word)&&rank!==undefined)words.push(`${word}:${rank}`);
    }
    if(words.length>1)rows.push(`${f[2]==='s'?'a':f[2]}${f[0]} ${words.join(' ')}`);
  }
}
const text=rows.join('\n')+'\n';
writeFileSync('src/wordnet-data.txt',text);
console.log(JSON.stringify({synsets:rows.length,bytes:Buffer.byteLength(text),sha256:createHash('sha256').update(text).digest('hex')}));
