import {canonicalMath,hasMath,expression,type MathNode} from './math';
import {normalizeAnswer,answerTokens,editDistance} from './answer-normalization';
import {synonymEvidence,lexicalForms} from './synonyms';
export type AnswerEvidence={accuracy:number;result:'strong_correct'|'accepted'|'borderline'|'incorrect';needsReview:boolean;signals?:{exact?:boolean;equivalent?:boolean;trivialTypo?:boolean;protectedFactsPassed?:boolean;contradiction?:boolean;conceptCoverage?:number;lexicalSimilarity?:number;orderSimilarity?:number;synonymMatches?:NonNullable<ReturnType<typeof synonymEvidence>>[]}};
const articles=new Set(['the','a','an','el','la','los','las','un','una','unos','unas']);
const oppositions=[['left','right'],['increase','decrease'],['higher','lower'],['before','after'],['positive','negative'],['true','false'],['with','without']];
const negative=new Set(['not','no','never','without','except','non']);
const oppositionForm=(s:string)=>s.replace(/^(increas|decreas)(?:es|ed|ing)$/,'$1e');
function numeric(source:string):number|undefined {
  const s=source.trim(),percent=s.endsWith('%'),body=percent?s.slice(0,-1):s;
  if(!/^[\d\s.+*/^()√⁰¹²³⁴⁵⁶⁷⁸⁹-]+$/.test(body)&&!/^sqrt\([\d.]+\)$/.test(body))return;
  const parsed=expression(body,0);if(!parsed||parsed.end!==body.length)return;
  const evaluate=(n:MathNode):number=>{
    if(n.kind==='atom')return n.value===''?0:Number(n.value);
    if(n.kind==='root')return Math.sqrt(evaluate(n.child));
    if(n.kind==='abs')return Math.abs(evaluate(n.child));
    if(n.kind==='group')return evaluate(n.child);
    if(n.kind!=='binary')return NaN;
    const a=evaluate(n.left),b=evaluate(n.right);return n.op==='+'?a+b:n.op==='-'?a-b:n.op==='*'||n.op==='implicit'?a*b:n.op==='/'?a/b:n.op==='^'?a**b:NaN;
  };
  const n=evaluate(parsed.node)/(percent?100:1);return Number.isFinite(n)&&Math.abs(n)<=Number.MAX_SAFE_INTEGER?n:undefined;
}
/** Ordered, explainable rules. Similarity supports evidence; it never overrides facts. */
export function confidenceGrade(input:string,expected:string,strict=false,accents=false):AnswerEvidence {
  const signals:NonNullable<AnswerEvidence['signals']>={};
  const result=(score:number):AnswerEvidence=>{const accuracy=Math.max(0,Math.min(100,Math.round(score)))/100;return {accuracy,result:accuracy>=.9?'strong_correct':accuracy>=.7?'accepted':accuracy>=.6?'borderline':'incorrect',needsReview:accuracy<.9,signals};};
  if(!input.trim()||!expected.trim())return result(0);
  const a=normalizeAnswer(input,accents,strict),b=normalizeAnswer(expected,accents,strict);
  if(a===b){signals.exact=true;return result(100);}
  const na=numeric(input),nb=numeric(expected);
  if(na!==undefined&&nb!==undefined){signals.equivalent=Math.abs(na-nb)<=Number.EPSILON*4*Math.max(1,Math.abs(na),Math.abs(nb));return result(signals.equivalent?100:0);}
  if(hasMath(input)||hasMath(expected)){signals.equivalent=canonicalMath(input)===canonicalMath(expected);return result(signals.equivalent?100:0);}
  if(strict)return result(0);
  const x:string[]=answerTokens(a),y:string[]=answerTokens(b);
  const mismatch=(predicate:(s:string)=>boolean)=>x.filter(predicate).map(oppositionForm).sort().join('|')!==y.filter(predicate).map(oppositionForm).sort().join('|');
  const protectedWord=(s:string)=>negative.has(s)||s.endsWith("n't")||oppositions.flat().includes(oppositionForm(s));
  const numericOrSymbol=(s:string)=>/[^\p{L}\p{M}']/u.test(s);
  const names=expected.match(/\b[A-Z][a-z]+\b/g)||[];
  const namesReversed=names.length>=2&&names.every(n=>x.includes(n.toLowerCase()))&&names.some((n,i)=>i>0&&x.indexOf(names[i-1].toLowerCase())>x.indexOf(n.toLowerCase()));
  signals.contradiction=mismatch(protectedWord)||namesReversed;
  const acronymMissing=(expected.match(/\b[A-Z]{2,}\b/g)||[]).some(n=>!x.includes(n.toLowerCase()));
  const accentChanged=!accents&&x.some((token,i)=>token!==y[i]&&normalizeAnswer(token,true)===normalizeAnswer(y[i]||'',true));
  const properArticle=/^(The|El|La|Los|Las)\s+[A-Z][a-z]+/.test(expected.trim())&&x[0]!==y[0];
  const changedArticle=articles.has(x[0])&&articles.has(y[0])&&x[0]!==y[0];
  signals.protectedFactsPassed=!signals.contradiction&&!mismatch(numericOrSymbol)&&!acronymMissing&&!accentChanged&&!properArticle&&!changedArticle;
  if(!signals.protectedFactsPassed)return result(0);
  const distance=editDistance(a,b,Math.max(2,Math.floor(b.length*.05)));
  const aligned=x.length===y.length&&x.every((word,i)=>word===y[i]||editDistance(word,y[i],1)<=1);
  if(b.length>=5 && aligned && distance<=Math.max(1,Math.floor(b.length*.05))){signals.trivialTypo=true;return result(97);}
  if(a.length>4096||b.length>4096||x.length>256||y.length>256)return result(0);
  const weight=(tokens:string[],i:number)=>tokens.length>1&&i===0&&articles.has(tokens[i])?.08:1;
  const context=x.filter(t=>y.includes(t)&&!articles.has(t)).length,used=new Set<number>();
  let matched=0,ordered=0,last=-1,matches=0;signals.synonymMatches=[];
  for(let i=0;i<y.length;i++){
    let best=-1,score=0,syn:ReturnType<typeof synonymEvidence>;
    for(let j=0;j<x.length;j++)if(!used.has(j)){
      const synonym=x[j]!==y[i]?synonymEvidence(x[j],y[i],context):undefined;
      const forms=lexicalForms(x[j]),morph=x[j]!==y[i]&&lexicalForms(y[i]).some(f=>forms.includes(f));
      const similarity=x[j]===y[i]?1:morph?.92:synonym?.confidence ?? (Math.min(x[j].length,y[i].length)>=4?Math.max(0,1-editDistance(x[j],y[i],2)/Math.max(x[j].length,y[i].length)):0);
      if(similarity>score&&similarity>=.65){best=j;score=similarity;syn=synonym;}
    }
    if(best>=0){used.add(best);matched+=score*Math.min(weight(x,best),weight(y,i));matches++;if(best>last)ordered++;last=best;if(syn)signals.synonymMatches.push(syn);}
  }
  const coverage=matched/Math.max(x.reduce((n,_,i)=>n+weight(x,i),0),y.reduce((n,_,i)=>n+weight(y,i),0),1);
  signals.conceptCoverage=coverage;signals.orderSimilarity=matches?ordered/matches:0;
  signals.lexicalSimilarity=Math.max(0,1-editDistance(a,b,128)/Math.max(a.length,b.length));
  // Every concept must align for strong evidence; order only lowers confidence
  // when the answer's relationship is uncertain, never as a fixed score bonus.
  let score=coverage*100;
  if(signals.orderSimilarity<1)score=Math.min(score,85);
  if(coverage<.7)score=Math.min(score,59);
  return result(score);
}
