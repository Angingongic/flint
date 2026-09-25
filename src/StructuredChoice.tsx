import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { MathText } from "./MathText";

/** In-diagram recognition control. Math, keyboard navigation and feedback share the card's scale. */
export function StructuredChoice({label, options, value, disabled, onChange}: {
  label:string; options:string[]; value:string; disabled:boolean; onChange:(value:string)=>void;
}) {
  const id = useId(), root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open,setOpen] = useState(false), [active,setActive] = useState(0);
  useLayoutEffect(() => {
    if (!open || disabled || !menu.current) return;
    const panel = menu.current;
    const position = () => {
      const anchor = root.current?.getBoundingClientRect();
      if (!anchor) return;
      const roomBelow = window.innerHeight - anchor.bottom - 12;
      const roomAbove = anchor.top - 12;
      const above = roomBelow < 220 && roomAbove > roomBelow;
      const height = Math.max(40, Math.min(260, above ? roomAbove : roomBelow));
      const width = Math.min(Math.max(anchor.width, 180), window.innerWidth - 16);
      Object.assign(panel.style, {
        width: `${width}px`, maxHeight: `${height}px`,
        left: `${Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8))}px`,
        top: above ? "auto" : `${anchor.bottom + 4}px`,
        bottom: above ? `${window.innerHeight - anchor.top + 4}px` : "auto",
      });
    };
    panel.showPopover?.();
    position();
    window.addEventListener("resize", position);
    document.addEventListener("scroll", position, true);
    return () => {
      panel.hidePopover?.();
      window.removeEventListener("resize", position);
      document.removeEventListener("scroll", position, true);
    };
  }, [open, disabled]);
  useEffect(() => {
    if (open) menu.current?.children[active]?.scrollIntoView?.({block:"nearest"});
  }, [open, active]);
  useEffect(() => {
    if (!open) return;
    const outside = (event:PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown",outside);
    return () => document.removeEventListener("pointerdown",outside);
  },[open]);
  const choose = (index:number) => { if (!disabled && options[index] !== undefined) onChange(options[index]); setOpen(false); };
  return <div ref={root} className="structured-choice" onBlur={event => {if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);}}>
    <button type="button" role="combobox" aria-label={label} aria-expanded={open && !disabled}
      aria-controls={id} aria-haspopup="listbox" aria-activedescendant={open ? `${id}-${active}` : undefined}
      disabled={disabled} onClick={() => {setActive(Math.max(0,options.indexOf(value)));setOpen(v=>!v);}}
      onKeyDown={event => {
        if (event.key === "Escape" && open) {event.preventDefault();event.stopPropagation();setOpen(false);}
        else if (["ArrowDown","ArrowUp","Home","End"].includes(event.key)) {
          event.preventDefault();event.stopPropagation();setOpen(true);
          setActive(old => event.key === "Home" ? 0 : event.key === "End" ? options.length-1 : !open ? Math.max(0,options.indexOf(value)) : (old + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
        } else if ((event.key === "Enter" || event.key === " ") && open) {event.preventDefault();event.stopPropagation();choose(active);}
        else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
          const index=options.findIndex(option=>option.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()));
          if(index>=0){event.preventDefault();setOpen(true);setActive(index);}
        }
      }}><MathText text={value || "Choose…"}/><span aria-hidden="true">⌄</span></button>
    {open && !disabled && <div ref={menu} popover={typeof HTMLElement !== "undefined" && "showPopover" in HTMLElement.prototype ? "manual" : undefined} id={id} role="listbox" aria-label={label} className="structured-choice-options">
      {options.map((option,index)=><div key={option} id={`${id}-${index}`} role="option" aria-selected={value===option}
        className={active===index?"active":""} onPointerDown={event=>event.preventDefault()}
        onPointerMove={()=>setActive(index)} onClick={()=>choose(index)}><MathText text={option}/></div>)}
    </div>}
  </div>;
}
