import {useRef,useState,type ReactNode} from "react";
import {Copy,Scissors,Trash2,Maximize2} from "lucide-react";
import {mediaUrl} from "./native";
import {Modal} from "./ui";

/** Shared image-only keyboard target: text/cell selection is never deleted here. */
export function SelectableImage({name,label,children,onRemove}:{name:string;label:string;children:ReactNode;onRemove:()=>void}) {
  const current=useRef({name,onRemove});current.current={name,onRemove};
  const [error,setError]=useState(""),[large,setLarge]=useState(false),[busy,setBusy]=useState(false);
  async function copy(cut=false){
    if(busy)return;setBusy(true);setError("");const original=name;
    try{
      const url=await mediaUrl(original),response=await fetch(url),blob=await response.blob();
      if(!response.ok||!blob.type.startsWith("image/"))throw Error("Image unavailable");
      // Preserve original bytes, including transparency/animation. Never silently re-encode.
      await navigator.clipboard.write([new ClipboardItem({[blob.type]:blob})]);
      if(cut&&current.current.name===original)current.current.onRemove();
    }catch{setError("This image could not be copied to the system clipboard. The original is unchanged.");}
    finally{setBusy(false);}
  }
  return <div className="selectable-image" tabIndex={0} role="group" aria-label={`Select ${label}`}
    onClick={event=>{if(event.target instanceof HTMLImageElement)event.currentTarget.focus();}}
    onKeyDown={event=>{
      if(event.target!==event.currentTarget||event.nativeEvent.isComposing)return;
      const key=event.key.toLowerCase();
      if(key==="delete"||key==="backspace"){event.preventDefault();event.stopPropagation();onRemove();}
      else if((event.ctrlKey||event.metaKey)&&(key==="c"||key==="x")){event.preventDefault();event.stopPropagation();void copy(key==="x");}
      else if(key==="enter"){event.preventDefault();event.stopPropagation();setLarge(true);}
    }}>
    {children}
    <div className="selected-image-actions">
      <button type="button" className="icon" title="Copy image" aria-label="Copy image" disabled={busy} onClick={()=>void copy()}><Copy size={14}/></button>
      <button type="button" className="icon" title="Cut image" aria-label="Cut image" disabled={busy} onClick={()=>void copy(true)}><Scissors size={14}/></button>
      <button type="button" className="icon" title="View image" aria-label="View image" onClick={()=>setLarge(true)}><Maximize2 size={14}/></button>
      <button type="button" className="icon" title="Remove image" aria-label="Remove image" onClick={onRemove}><Trash2 size={14}/></button>
    </div>
    {error&&<small role="alert">{error}</small>}
    {large&&<Modal title={label} dismissOutside onClose={()=>setLarge(false)}><div className="selected-image-preview">{children}</div></Modal>}
  </div>;
}
