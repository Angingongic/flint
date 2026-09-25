import { forwardRef, useState, type ReactNode, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { hasMath } from "./math";
import { MathText } from "./MathText";
import { usePreference } from "./preferences";

/** Native editing owns canonical text, selection, IME and clipboard. Math occupies
 * the same field, never a second preview. Navigating into an expression exposes
 * its source for precise editing; typing at its end formats it again. */
function useMathEdit(value:string,formatted=false) {
  const [liveMath]=usePreference<boolean>("live-math",true);
  const [literal,setLiteral]=useState<string|null>(null);
  const [composing,setComposing]=useState(false);
  return {
    preview:!composing&&(formatted||(liveMath&&hasMath(value)))&&literal!==value,
    compose:setComposing,
    change:(next:string,caret:number|null)=>setLiteral(old=>old!==null || caret!==next.length ? next : null),
    edit:()=>{if(formatted||hasMath(value))setLiteral(value);},
    blur:()=>setLiteral(null),
    reject:(event:React.KeyboardEvent<HTMLInputElement|HTMLTextAreaElement>)=>{
      // Formatting is presentation-only. Never consume a native deletion: doing
      // so introduced the two-Backspace bug and broke selection/undo semantics.
      // Keep an explicitly exposed source in source-editing mode through edits.
      // Untouched live-formatted fields still use ordinary native deletion.
      if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End"].includes(event.key)) setLiteral(value);
      return false;
    },
  };
}
export const SmartMathInput=forwardRef<HTMLInputElement,InputHTMLAttributes<HTMLInputElement>&{formattedContent?:ReactNode}>(function SmartMathInput({formattedContent,...props},ref){
  const [spellcheck]=usePreference<boolean>("spellcheck",true);
  const value=String(props.value??"");const state=useMathEdit(value,!!formattedContent);
  return <span className={"smart-math-field"+(state.preview?" math-inline-formatted":"")}><input {...props} ref={ref}
    spellCheck={props.spellCheck ?? spellcheck}
    style={state.preview ? {...props.style,color:"transparent",caretColor:"transparent"} : props.style}
    onCompositionStart={event=>{state.compose(true);props.onCompositionStart?.(event);}}
    onCompositionEnd={event=>{state.compose(false);props.onCompositionEnd?.(event);}}
    onChange={event=>{state.change(event.currentTarget.value,event.currentTarget.selectionStart);props.onChange?.(event);}}
    onKeyDown={event=>{if(!state.reject(event))props.onKeyDown?.(event);}}
    onPointerDown={event=>{state.edit();props.onPointerDown?.(event);}}
    onBlur={event=>{state.blur();props.onBlur?.(event);}}
    onSelect={event=>{if(event.currentTarget.selectionStart!==event.currentTarget.selectionEnd)state.edit();props.onSelect?.(event);}} />
    {state.preview&&<span className="math-inline-surface" aria-hidden="true">{formattedContent||<MathText text={value}/>}<i className="math-inline-caret"/></span>}
  </span>;
});
type MathTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { suggestion?: string | null; onAcceptSuggestion?: (value: string) => void };
export const SmartMathTextarea=forwardRef<HTMLTextAreaElement,MathTextareaProps>(function SmartMathTextarea({suggestion,onAcceptSuggestion,...props},ref){
  const [suggestions]=usePreference<boolean>("math-suggestions",true),[spellcheck]=usePreference<boolean>("spellcheck",true);
  const value=String(props.value??"");const state=useMathEdit(value);
  const [dismissed,setDismissed]=useState<string|null>(null);
  const ghost=suggestions && !value && suggestion && dismissed!==suggestion ? suggestion : null;
  return <span className={"smart-math-field math-multiline"+(state.preview?" math-inline-formatted":"")+(ghost?" has-math-suggestion":"")}><textarea {...props} ref={ref}
    spellCheck={props.spellCheck ?? spellcheck}
    style={state.preview ? {...props.style,color:"transparent",caretColor:"transparent"} : props.style}
    onCompositionStart={event=>{state.compose(true);props.onCompositionStart?.(event);}}
    onCompositionEnd={event=>{state.compose(false);props.onCompositionEnd?.(event);}}
    onChange={event=>{state.change(event.currentTarget.value,event.currentTarget.selectionStart);props.onChange?.(event);}}
    onKeyDown={event=>{if(ghost && !event.nativeEvent.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey && (event.key==="Escape" || (event.key==="Tab" && !event.shiftKey))){event.preventDefault();event.stopPropagation();if(event.key==="Tab")onAcceptSuggestion?.(ghost);else setDismissed(ghost);return;}if(!state.reject(event))props.onKeyDown?.(event);}}
    onPointerDown={event=>{state.edit();props.onPointerDown?.(event);}}
    onBlur={event=>{state.blur();props.onBlur?.(event);}}
    onSelect={event=>{if(event.currentTarget.selectionStart!==event.currentTarget.selectionEnd)state.edit();props.onSelect?.(event);}} />
    {ghost&&<span className="math-autofill-ghost" aria-hidden="true"><MathText text={ghost}/><small>Tab to accept</small></span>}
    {state.preview&&<span className="math-inline-surface" aria-hidden="true"><MathText text={value}/><i className="math-inline-caret"/></span>}
  </span>;
});
