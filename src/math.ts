/** Small recursive expression grammar. Source text, never generated markup, is stored. */
export type MathNode = { kind: "atom"; value: string } | { kind: "group" | "root" | "abs"; child: MathNode } | { kind: "binary"; op: string; left: MathNode; right: MathNode };
export type MathRun = { source: string; node?: MathNode };
/** Intent recognition is separate from expression parsing and symbolic solving. */
function mathematicalIntent(node:MathNode):boolean {
  if(node.kind==="atom")return !node.value || /^\d/.test(node.value) || /^[a-zA-Z]$/.test(node.value) || /^(?:[abckxyz]{2})$/.test(node.value) || Object.hasOwn(mathSymbols,node.value);
  if(node.kind!=="binary")return mathematicalIntent(node.child);
  return mathematicalIntent(node.left)&&mathematicalIntent(node.right);
}
export const mathSymbols: Record<string,string> = { pi:"π",theta:"θ",alpha:"α",beta:"β",gamma:"γ",delta:"δ",infinity:"∞" };
export const mathOperators: Record<string,string> = { "<=":"≤",">=":"≥","!=":"≠","+-":"±","->":"→","<->":"↔","*":"×" };
const ascii = (text:string) => Object.entries({...mathSymbols,...mathOperators}).reduce((s,[key,value]) => s.split(value).join(key),text);

export function expression(source:string, start:number): { node:MathNode; end:number; formatted:boolean } | null {
  let at=start, depth=0, formatted=false;
  const space=()=>{while(/\s/.test(source[at]||"")&&at<source.length)at++;};
  function atom():MathNode {
    if(++depth>64)throw Error("Math nesting limit");
    space();let node:MathNode;
    if(source.startsWith("sqrt(",at)) { at+=4; const child=atom(); node={kind:"root",child:child.kind==="group"?child.child:child};formatted=true; }
    else if(source[at]==="√") {at++;const child=atom();node={kind:"root",child:child.kind==="group"?child.child:child};formatted=true;}
    else if(source[at]==="(") {at++;const child=parse(0);space();if(source[at++]!==")")throw Error("Incomplete group");node={kind:"group",child};}
    else if(source[at]==="|") {at++;const child=parse(0);space();if(source[at++]!=="|")throw Error("Incomplete absolute value");node={kind:"abs",child};formatted=true;}
    else if(source[at]==="±" || source.startsWith("+-",at)) {at+=source[at]==="±"?1:2;node={kind:"binary",op:"+-",left:{kind:"atom",value:""},right:parse(40)};formatted=true;}
    else if(source[at]==="-"||source[at]==="+") {const op=source[at++];node={kind:"binary",op,left:{kind:"atom",value:""},right:parse(40)};}
    else {const match=source.slice(at).match(/^(?:\d+(?:\.\d+)?|[\p{L}]+|∞)/u);if(!match)throw Error("Expected atom");at+=match[0].length;node={kind:"atom",value:ascii(match[0])}; if(mathSymbols[node.value])formatted=true;}
    depth--;return node;
  }
  function parse(min:number):MathNode {
    let left=atom();
    while(at<source.length) {
      const raised=source.slice(at).match(/^[⁻⁺]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+/);
      if(raised && min<=40){const digits:Record<string,string>={"⁰":"0","¹":"1","²":"2","³":"3","⁴":"4","⁵":"5","⁶":"6","⁷":"7","⁸":"8","⁹":"9","⁻":"-","⁺":"+"};const exponent=[...raised[0]].map(c=>digits[c]).join("");at+=raised[0].length;left={kind:"binary",op:"^",left,right:{kind:"atom",value:exponent}};formatted=true;continue;}
      const before=at;space();const spaced=at!==before;
      const op=(depth>0 && source[at]===",") ? "," : source.slice(at).match(/^(?:<->|<=|>=|!=|\+-|->|[+\-*/^_=<>]|[≤≥≠±→↔×])/u)?.[0];
      let normalized=op?ascii(op):"";
      // Juxtaposition only without whitespace: 2x, 4ac, and 2(x+1).
      const implicit=!op&&!spaced&&/^[\p{L}\d(]/u.test(source.slice(at));
      if(implicit)normalized="implicit";
      const precedence=normalized===","?5:normalized==="^"||normalized==="_"?40:normalized==="*"||normalized==="/"||implicit?30:normalized==="+"||normalized==="-"||normalized==="+-"?20:normalized?10:-1;
      if(precedence<min) {at=before;break;}
      if(!implicit)at+=op!.length;
      const after=at;
      try {const right=parse(precedence+(normalized==="^"||normalized==="_"?0:1)); left={kind:"binary",op:normalized,left,right}; if(["^","_","/"].includes(normalized)||mathOperators[normalized])formatted=true;}
      catch {at=before;if(after===start)throw Error("Incomplete");break;}
    }
    return left;
  }
  try { const node=parse(0); return {node,end:at,formatted}; } catch { return null; }
}

/** Scan independent math islands, retaining all surrounding prose verbatim. */
export function mathRuns(text:string):MathRun[] {
  if(text.length>100000)return [{source:text}];
  const runs:MathRun[]=[];let plain=0,at=0;
  while(at<text.length) {
    if((at===0||!/[\p{L}\d_]/u.test(text[at-1]))&&/[\p{L}\d(|√±+]/u.test(text[at])) {
      const parsed=expression(text,at);
      if(parsed?.formatted && parsed.end>at && mathematicalIntent(parsed.node)) {
        if(at>plain)runs.push({source:text.slice(plain,at)});
        runs.push({source:text.slice(at,parsed.end),node:parsed.node});at=parsed.end;plain=at;continue;
      }
      // Do not reinterpret a suffix of a rejected word/units expression.
      if(parsed && parsed.end>at){at=parsed.end;continue;}
    }
    at++;
  }
  if(plain<text.length)runs.push({source:text.slice(plain)});
  return runs.length?runs:[{source:text}];
}
export function canonicalNode(node:MathNode):string {
  if(node.kind==="atom")return node.value;
  if(node.kind==="group")return canonicalNode(node.child);
  if(node.kind==="root"||node.kind==="abs")return `${node.kind}(${canonicalNode(node.child)})`;
  if(node.kind==="binary") return `(${canonicalNode(node.left)}${node.op}${canonicalNode(node.right)})`;
  return "";
}
export function canonicalMath(text:string):string {
  return mathRuns(text.normalize("NFC")).map(run=>run.node?canonicalNode(run.node):run.source).join("").trim();
}
export function hasMath(text:string) { return mathRuns(text).some(run=>run.node); }
