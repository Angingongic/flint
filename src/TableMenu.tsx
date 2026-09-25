import {useEffect,useLayoutEffect,useRef,useState} from "react";
import {ChevronLeft,ChevronRight} from "lucide-react";
import {menuPosition} from "./ItemMenu";
export type TableAction={label:string; run?:()=>void; disabled?:boolean; danger?:boolean; children?:TableAction[]; separator?:boolean};
export function TableMenu({x,y,actions,onClose}:{x:number;y:number;actions:TableAction[];onClose:()=>void}){
  const ref=useRef<HTMLDivElement>(null),origin=useRef(document.activeElement as HTMLElement|null);
  const [submenu,setSubmenu]=useState<TableAction|null>(null);
  const items=submenu?.children||actions;
  useLayoutEffect(()=>{const el=ref.current!;if(el.showPopover&&!el.matches(":popover-open"))el.showPopover();
    const rect=el.getBoundingClientRect(),position=menuPosition(x,y,rect.width,rect.height,innerWidth,innerHeight);
    Object.assign(el.style,{left:position.left+"px",top:position.top+"px"});
    el.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  },[x,y,submenu]);
  useEffect(()=>{const outside=(event:PointerEvent)=>{if(!ref.current?.contains(event.target as Node))onClose();};
    document.addEventListener("pointerdown",outside);window.addEventListener("resize",onClose);
    return()=>{document.removeEventListener("pointerdown",outside);window.removeEventListener("resize",onClose);origin.current?.focus({preventScroll:true});};
  },[onClose]);
  return <div ref={ref} popover={typeof HTMLElement.prototype.showPopover==="function"?"manual":undefined} role="menu" aria-label={submenu?.label||"Table actions"} className="table-context-menu" style={{position:"fixed",left:x,top:y}} onContextMenu={e=>e.preventDefault()} onKeyDown={e=>{
    const buttons=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")),index=buttons.indexOf(document.activeElement as HTMLButtonElement);
    if(["ArrowDown","ArrowUp","Home","End"].includes(e.key)){e.preventDefault();e.stopPropagation();buttons[e.key==="Home"?0:e.key==="End"?buttons.length-1:(index+(e.key==="ArrowDown"?1:-1)+buttons.length)%buttons.length]?.focus();}
    else if(e.key==="Escape"||e.key==="Tab"){e.preventDefault();e.stopPropagation();onClose();}
    else if(e.key==="ArrowLeft"&&submenu){e.preventDefault();setSubmenu(null);}
    else if(e.key==="ArrowRight"){const item=items.find(a=>a.label===document.activeElement?.getAttribute("data-action"));if(item?.children){e.preventDefault();setSubmenu(item);}}
  }}>
    {submenu&&<button role="menuitem" onClick={()=>setSubmenu(null)}><ChevronLeft size={15}/>{submenu.label}</button>}
    {items.map((item,index)=><div key={item.label}>{item.separator&&index>0&&<hr/>}<button role="menuitem" data-action={item.label} aria-haspopup={item.children?"menu":undefined} disabled={item.disabled} className={item.danger?"danger-action":""} onClick={()=>{if(item.children)setSubmenu(item);else{item.run?.();onClose();}}}>{item.label}{item.children&&<ChevronRight size={15}/>}</button></div>)}
  </div>;
}
