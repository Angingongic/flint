import { createElement, useMemo, type ReactNode } from "react";
import { mathRuns, mathOperators, mathSymbols, type MathNode } from "./math";

function layout(node:MathNode):ReactNode {
  const element=(tag:string,...children:ReactNode[])=>createElement(tag,null,...children);
  if(node.kind==="atom")return element(/^\d/.test(node.value)?"mn":"mi",mathSymbols[node.value]||node.value);
  if(node.kind==="group")return element("mrow",element("mo","("),layout(node.child),element("mo",")"));
  if(node.kind==="root")return element("msqrt",layout(node.child));
  if(node.kind==="abs")return element("mrow",element("mo","|"),layout(node.child),element("mo","|"));
  if(node.kind!=="binary")return null;
  const ungroup=(n:MathNode)=>layout(n.kind==="group"?n.child:n);
  if(node.op==="/")return element("mfrac",ungroup(node.left),ungroup(node.right));
  if(node.op==="^"||node.op==="_")return element(node.op==="^"?"msup":"msub",layout(node.left),ungroup(node.right));
  if(node.op==="implicit")return element("mrow",layout(node.left),layout(node.right));
  return element("mrow",layout(node.left),element("mo",mathOperators[node.op]||node.op),layout(node.right));
}
export function MathText({text}:{text:string}) {
  const runs=useMemo(()=>mathRuns(text),[text]);
  return <span className="math-text" onCopy={event=>{
    const selection=window.getSelection();
    if(!selection?.rangeCount || !event.currentTarget.contains(selection.anchorNode) || !event.currentTarget.contains(selection.focusNode))return;
    const fragment=selection.getRangeAt(0).cloneContents();
    fragment.querySelectorAll<HTMLElement>("[data-math-source]").forEach(node=>node.replaceWith(document.createTextNode(node.dataset.mathSource || "")));
    const enclosing=selection.anchorNode?.parentElement?.closest<HTMLElement>("[data-math-source]");
    event.preventDefault(); event.clipboardData.setData("text/plain",enclosing?.contains(selection.focusNode) ? enclosing.dataset.mathSource || "" : fragment.textContent || "");
  }}>{runs.map((run,index)=>run.node ? <span key={index} data-math-source={run.source}>
    {createElement("math",{xmlns:"http://www.w3.org/1998/Math/MathML","aria-label":run.source},layout(run.node))}
  </span>:run.source)}</span>;
}
