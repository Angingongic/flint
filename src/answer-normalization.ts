export function normalizeAnswer(text:string,accents=false,caseSensitive=false){
  let value=text.normalize('NFC').replace(/[’‘]/g,"'").replace(/[“”]/g,'"').replace(/[–—]/g,'-').replace(/(?<=\p{L})-(?=\p{L})/gu,' ').replace(/[.,!?;:](?=\s|$)/g,'').replace(/["“”]/g,'').trim().replace(/\s+/g,' ');
  if(accents)value=value.normalize('NFD').replace(/\p{M}/gu,'');
  return caseSensitive?value:value.toLowerCase();
}
export const answerTokens=(value:string)=>value.match(/[\p{L}\p{M}]+(?:'[\p{L}]+)?|\d+(?:\.\d+)?|[^\s\p{L}\p{M}\d]/gu)||[];
export function editDistance(a:string,b:string,limit=256){
  if(a===b)return 0;if(a.length>4096||b.length>4096||Math.abs(a.length-b.length)>limit)return Infinity;
  let row=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=0;i<a.length;i++){const next=Array<number>(b.length+1).fill(Infinity);next[0]=i+1;for(let j=Math.max(0,i-limit);j<Math.min(b.length,i+limit+1);j++)next[j+1]=Math.min(next[j]+1,row[j+1]+1,row[j]+Number(a[i]!==b[j]));row=next;}
  return row[b.length];
}
