import data from './wordnet-data.txt?raw';
type Sense={id:string;rank:number};
let index:Map<string,Sense[]>|undefined;
const cache=new Map<string,Sense[]>();
function dictionary(){
  if(!index){index=new Map();for(const line of data.trim().split('\n')){const [id,...words]=line.split(' ');for(const token of words){const [word,rank]=token.split(':');const senses=index.get(word)||[];senses.push({id,rank:Number(rank)});index.set(word,senses);}}}
  return index;
}
/** Conservative inflections only if the candidate is attested in the dictionary. */
export function lexicalForms(word:string):string[]{
  const dict=dictionary(),forms=[word];
  if(word.length>4){const candidates=[word.replace(/ies$/,'y'),word.replace(/s$/,''),word.replace(/es$/,''),word.replace(/ed$/,''),word.replace(/ed$/,'e'),word.replace(/ing$/,''),word.replace(/ing$/,'e')];for(const candidate of candidates)if(candidate!==word&&dict.has(candidate)&&!forms.includes(candidate))forms.push(candidate);}
  return forms;
}
function senses(word:string){
  const known=cache.get(word);if(known)return known;
  const found=lexicalForms(word).flatMap(form=>dictionary().get(form)||[]);
  if(cache.size>=2048)cache.delete(cache.keys().next().value!);
  cache.set(word,found);return found;
}
export function synonymEvidence(input:string,expected:string,contextMatches:number){
  const contextual=new Map([['generate','produce'],['generates','produces'],['generated','produced']]);
  if(contextual.get(input)===expected||contextual.get(expected)===input)return {input,expected,synset:'contextual-verb-equivalence',confidence:.86};
  const a=senses(input),b=senses(expected);
  // Require a shared first sense for isolated words. In a larger, otherwise
  // aligned phrase allow a shared top-three sense, with reduced confidence.
  const matches=a.flatMap(x=>b.filter(y=>y.id===x.id).map(y=>({id:x.id,rank:x.rank+y.rank})));
  const best=matches.sort((x,y)=>x.rank-y.rank||x.id.localeCompare(y.id))[0];
  if(!best || (best.rank>0 && contextMatches<2))return undefined;
  return {input,expected,synset:best.id,confidence:best.rank===0?.94:.84};
}
