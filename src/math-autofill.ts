import nerdamer from "nerdamer/all";
import { expression, type MathNode } from "./math";

type Symbolic = {toString():string;toTeX():string;variables():string[];sub(variable:string,value:string):Symbolic;text(mode:"decimals"):string;evaluate():Symbolic;denominator():Symbolic;numerator():Symbolic};
const cas=nerdamer as unknown as ((source:string)=>Symbolic) & {solveEquations(source:string,variable:string):Symbolic[]};
export type MathSolution={source:string;latex:string;kind:"simplify"|"solve";domain:"real"; exclusions?:{variable:string;values:string[]}[]};
/** Only input intent/domain bounds live here; Nerdamer performs every calculation. */
function casSource(node:MathNode,variables:Set<string>,depth=0,denominators?:string[]):string {
  if(depth>24)throw Error("Expression too deep");
  const child=(n:MathNode)=>casSource(n,variables,depth+1,denominators);
  if(node.kind==="atom"){
    if(!node.value)return "0";
    if(/^[-+]?\d+(\.\d+)?$/.test(node.value)){if(node.value.length>16)throw Error("Number too large");return node.value;}
    if(!/^[a-zA-Z]$/.test(node.value)||node.value==="i"||node.value==="e")throw Error("Not a supported variable");
    variables.add(node.value);return node.value;
  }
  if(node.kind==="group")return "("+child(node.child)+")";
  if(node.kind==="root"||node.kind==="abs"){
    const arg=child(node.child);
    if(cas(arg).variables().length && node.kind==="root") {
      // Under the declared real domain, Nerdamer retains abs for even squares.
      // Only accept roots that it eliminates exactly; arbitrary radical domains remain unsupported.
      const exact=cas("sqrt("+arg+")").toString();
      if(exact.includes("sqrt") || exact.includes("^(1/2)") || /(^|[^a-zA-Z])i([^a-zA-Z]|$)/.test(exact))throw Error("Unresolved radical domain");
      return exact;
    }
    if(node.kind==="root"&&Number(cas(arg).text("decimals"))<0)throw Error("Outside real domain");
    return (node.kind==="root"?"sqrt":"abs")+"("+arg+")";
  }
  if(node.kind!=="binary"||!["+","-","*","implicit","/","^","="].includes(node.op))throw Error("Unsupported intent");
  const left=child(node.left),right=child(node.right);
  if(node.op==="/"){
    if(cas(right).toString()==="0")throw Error("Denominator domain");
    if(cas(right).variables().length){if(!denominators)throw Error("Denominator domain");denominators.push(right);}
  }
  if(node.op==="^"){
    const exponent=cas(right).toString();
    if(!/^[-+]?\d+$/.test(exponent)||Math.abs(Number(exponent))>10)throw Error("Power bound");
    if(Number(exponent)<=0&&(cas(left).variables().length||cas(left).toString()==="0"))throw Error("Power domain");
  }
  return "("+left+")"+(node.op==="implicit"?"*":node.op)+"("+right+")";
}
const simplified=(source:string)=>cas("simplify("+source+")");
const decimal=(source:string)=>Number(cas(source).evaluate().text("decimals"));
function display(source:string):string {
  return source
    .replace(/\((-?\d+)\/(\d+)\)\*sqrt\(([^()]*)\)/g,(_,a,b,c)=>`${a==="1"?"":a==="-1"?"-":a}sqrt(${c})/${b}`)
    .replace(/\*(?=[a-zA-Z])/g,"")
    .replace(/abs\(([^()]*)\)/g,(_,inner)=>"|"+orderedPolynomial(inner)+"|");
}
/** Presentation order only: all coefficients and arithmetic still come from Nerdamer. */
function orderedPolynomial(source:string):string {
  try {
    const variables=cas(source).variables();if(variables.length!==1)return source;
    const variable=variables[0], degree=Number(cas(`deg(${source},${variable})`).toString());
    if(!Number.isInteger(degree)||degree<0||degree>10)return source;
    const coefficients=cas(`coeffs(${source},${variable})`).toString().slice(1,-1).split(",");
    if(coefficients.some(c=>!/^[-+]?\d+(\/\d+)?$/.test(c)))return source;
    const terms=coefficients.map((coefficient,power)=>{
      if(coefficient==="0")return "";
      if(!power)return coefficient;
      const scalar=coefficient==="1"?"":coefficient==="-1"?"-":coefficient.includes("/")?`(${coefficient})*`:coefficient+"*";
      return scalar+variable+(power===1?"":"^"+power);
    }).reverse().filter(Boolean);
    return terms.join("+").replace(/\+-/g,"-") || "0";
  }catch{return source;}
}
function operations(node:MathNode):number {
  if(node.kind==="binary")return 1+operations(node.left)+operations(node.right);
  if(node.kind==="group")return operations(node.child);
  if(node.kind==="root"||node.kind==="abs")return 1+operations(node.child);
  return 0;
}
function needsExpansion(node:MathNode):boolean {
  if(node.kind==="group")return needsExpansion(node.child);
  if(node.kind!=="binary")return false;
  const sum=(n:MathNode):boolean=>n.kind==="group"?sum(n.child):n.kind==="binary"&&(n.op==="+"||n.op==="-");
  return (["implicit","*","^"].includes(node.op)&&(sum(node.left)||sum(node.right)))||needsExpansion(node.left)||needsExpansion(node.right);
}
function solutionText(roots:string[]):string {
  const pending=[...new Set(roots)].sort((a,b)=>decimal(a)-decimal(b)),out:string[]=[];
  if(pending.length%2)return pending.map(display).join(", ");
  while(pending.length){
    const first=pending.shift()!;
    const opposite=pending.findIndex(other=>simplified("("+first+")+("+other+")").toString()==="0");
    if(opposite>=0){const positive=pending.splice(opposite,1)[0];out.push("±"+display(positive));}
    else out.push(display(first));
  }
  return out.every(s=>s.startsWith("±"))?out.sort((a,b)=>decimal(a.slice(1))-decimal(b.slice(1))).join(", "):out.join(", ");
}
export function symbolicMath(source:string):MathSolution|null {
  const input=source.trim();if(!input||input.length>300)return null;
  try {
    const parsed=expression(input,0);if(!parsed||input.slice(parsed.end).trim())return null;
    const equation=parsed.node.kind==="binary"&&parsed.node.op==="=";
    const denominators:string[]=[],vars=new Set<string>(),normalized=casSource(parsed.node,vars,0,equation?undefined:denominators);
    if(vars.size>1)return null;
    if(parsed.node.kind==="binary"&&parsed.node.op==="="){
      if(vars.size!==1)return null;const variable=[...vars][0];
      const left=casSource(parsed.node.left,new Set()),right=casSource(parsed.node.right,new Set());
      const polynomial=cas("expand(("+left+")-("+right+"))").toString();
      const degree=Number(cas("deg("+polynomial+","+variable+")").toString());
      if(!Number.isInteger(degree)||degree<1||degree>4)return null;
      let roots:string[];
      if(degree===4){
        // Stable Nerdamer quartics can be numerical. Delegate an exact quadratic
        // substitution only for biquadratics; never report numerical guesses.
        const coefficients=JSON.parse(cas("coeffs("+polynomial+","+variable+")").toString()) as number[];
        if(coefficients.length!==5||coefficients[1]!==0||coefficients[3]!==0)return null;
        const ys=cas.solveEquations(`${coefficients[4]}*z^2+${coefficients[2]}*z+${coefficients[0]}=0`,"z").map(r=>r.toString());
        if(ys.some(y=>decimal(y)<0))return null;
        roots=ys.flatMap(y=>{
          // sqrt(p/q) = sqrt(p*q)/q, delegated entirely to the CAS.
          const denominator=cas(y).denominator().toString();
          const root=simplified("sqrt(("+y+")*("+denominator+")^2)/("+denominator+")").toString();
          return [root,cas("-("+root+")").toString()];
        });
      }else roots=cas.solveEquations(normalized,variable).map(r=>r.toString());
      if(!roots.length||roots.some(r=>!Number.isFinite(decimal(r))||simplified(cas(polynomial).sub(variable,r).toString()).toString()!=="0"))return null;
      let answer=solutionText(roots);
      // Present a quadratic conjugate pair compactly without computing roots ourselves.
      if(roots.length===2&&!answer.includes("±")&&roots.some(r=>r.includes("sqrt"))){
        const sorted=[...roots].sort((a,b)=>decimal(a)-decimal(b));
        const center=simplified("(("+sorted[0]+")+("+sorted[1]+"))/2").toString();
        const amplitude=simplified("(("+sorted[1]+")-("+sorted[0]+"))/2").toString();
        answer=display(center)+" ± "+display(amplitude);
      }
      return {source:variable+" = "+answer,latex:variable+" \\in \\left\\{"+roots.map(r=>cas(r).toTeX()).join(", ")+"\\right\\}",kind:"solve",domain:"real"};
    }
    const exclusions:MathSolution["exclusions"]=[];
    if(denominators.length){
      const variable=[...vars][0], roots:string[]=[];
      for(const denominator of denominators){
        const degree=Number(cas(`deg(${denominator},${variable})`).toString());
        if(!Number.isInteger(degree)||degree<1||degree>2)return null;
        const zeroes=cas.solveEquations(denominator+"=0",variable).map(r=>r.toString());
        if(zeroes.some(r=>!Number.isFinite(decimal(r))))return null;
        roots.push(...zeroes);
      }
      exclusions.push({variable,values:[...new Set(roots)].sort((a,b)=>decimal(a)-decimal(b))});
    }
    const expanded=needsExpansion(parsed.node);
    const result=expanded?cas("expand("+normalized+")"):simplified(normalized);
    // Preserve a reduced common fraction instead of expanding it into inverse-power sums.
    // Domain exclusions remain those of the original, unsimplified input.
    const fraction=cas("rationalize("+result.toString()+")"), denominator=fraction.denominator();
    const canonical=denominator.variables().length
      ? `(${orderedPolynomial(fraction.numerator().toString())})/(${orderedPolynomial(denominator.toString())})`
      : orderedPolynomial(cas("expand("+result.toString()+")").toString());
    const answer=display(canonical);
    const outputNode=expression(answer,0);
    if(vars.size && !expanded && !exclusions.length && outputNode && operations(outputNode.node)>=operations(parsed.node))return null;
    if(answer.replace(/\s/g,"")===input.replace(/\s/g,""))return null;
    const restriction=exclusions.filter(e=>e.values.length).map(e=>`, ${e.variable} ≠ ${e.values.map(display).join(", ")}`).join("");
    return {source:answer+restriction,latex:result.toTeX()+exclusions.filter(e=>e.values.length).map(e=>`,\\quad ${e.variable} \\notin \\{${e.values.map(v=>cas(v).toTeX()).join(",")}\\}`).join(""),kind:"simplify",domain:"real",...(exclusions.length?{exclusions}:{})};
  }catch{return null;}
}
export function mathSuggestion(source:string):string|null{return symbolicMath(source)?.source??null;}
