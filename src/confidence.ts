import { gradeAnswer } from "./lib";

export type AnswerEvidence = { accuracy:number; result:"strong_correct"|"accepted"|"borderline"|"incorrect"; needsReview:boolean };
const articles = new Set(["a","an","the","el","la","los","las","un","una","unos","unas"]);
const critical = new Set(["not","no","never","without","except","non"]);
function distance(a:string,b:string) {
  let row=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=0;i<a.length;i++){const next=[i+1];for(let j=0;j<b.length;j++)next.push(Math.min(next[j]+1,row[j+1]+1,row[j]+Number(a[i]!==b[j])));row=next;}
  return row[b.length];
}
/** Lexical evidence, not a claim to understand synonyms or meaning. */
export function confidenceGrade(input:string,expected:string,strict=false,accents=false):AnswerEvidence {
  const result=(score:number):AnswerEvidence=>{const accuracy=Math.max(0,Math.min(100,Math.round(score)))/100;return {accuracy,result:accuracy>=.9?"strong_correct":accuracy>=.7?"accepted":accuracy>=.6?"borderline":"incorrect",needsReview:accuracy<.9};};
  if(!input.trim()||!expected.trim())return result(0);
  if(strict)return result(gradeAnswer(input,expected,"strict",accents)==="CORRECT"?100:0);
  const clean=(s:string)=>{const n=s.normalize("NFC").toLowerCase().replace(/[’‘]/g,"'").replace(/[“”]/g,'"');return (accents?n.normalize("NFD").replace(/\p{M}/gu,""):n).match(/[\p{L}\p{M}]+(?:'[\p{L}]+)?|\d+(?:\.\d+)?|[^\s\p{L}\p{M}\d.,!?;:"']/gu)||[];};
  const a:string[]=clean(input),b:string[]=clean(expected);
  if(a.join(" ")===b.join(" "))return result(100);
  const acronyms=expected.match(/\b[A-Z]{2,}\b/g)||[];
  if(acronyms.some(token=>!a.includes(token.toLowerCase())))return result(0);
  if(a.length===1&&b.length===1&&(Math.min(a[0].length,b[0].length)<7||distance(a[0],b[0])>Math.max(1,Math.floor(b[0].length*.08))))return result(0);
  const important=(tokens:string[])=>tokens.filter(t=>critical.has(t)||/[^\p{L}\p{M}']/u.test(t));
  if(important(a).join(" ")!==important(b).join(" "))return result(0);
  // Only a peripheral leading article is discounted. A changed article (gender,
  // number), article-only answer, or title-cased name remains significant.
  const proper=/^(?:The|El|La|Los|Las)\s+[A-Z][a-z]+(?:\s|$)/.test(expected.trim());
  const peripheral=!proper&&a.length!==b.length&&Math.min(a.length,b.length)>0;
  const weight=(tokens:string[],i:number)=>peripheral&&tokens.length>1&&i===0&&articles.has(tokens[i])?.08:1;
  const used=new Set<number>();let matched=0,last=-1,ordered=0,matchedCount=0;
  for(let i=0;i<b.length;i++){
    let best=-1,similarity=0;
    for(let j=0;j<a.length;j++)if(!used.has(j)){
      const exact=a[j]===b[i];
      const stem=(s:string)=>s.length>6?s.replace(/(?:ular|ation|ing)$/u,""):s;
      const score=exact?1:stem(a[j])===stem(b[i])?.7:Math.min(a[j].length,b[i].length)>=5?1-distance(a[j],b[i])/Math.max(a[j].length,b[i].length):0;
      if(score>=.65&&score>similarity){best=j;similarity=score;}
    }
    if(best>=0){used.add(best);matched+=similarity*Math.min(weight(b,i),weight(a,best));matchedCount++;if(best>last)ordered++;last=best;}
  }
  const totalA=a.reduce((n,_,i)=>n+weight(a,i),0),totalB=b.reduce((n,_,i)=>n+weight(b,i),0);
  const coverage=matched/Math.max(totalA,totalB,1);
  const edits=1-distance(a.join(" "),b.join(" "))/Math.max(a.join(" ").length,b.join(" ").length,1);
  let score=100*(.75*coverage+.1*edits+.15*(matchedCount?ordered/matchedCount:0));
  if(proper&&a[0]!==b[0] || a[0]!==b[0]&&articles.has(a[0]||"")&&articles.has(b[0]||""))score=Math.min(score,59);
  if(!accents&&input.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase()===expected.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase())score=Math.min(score,59);
  return result(score);
}
