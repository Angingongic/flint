import {useRef,useState,type PointerEvent} from "react";
import {Crop} from "lucide-react";
import {TableCrop} from "./TableCrop";
import {ManagedImage} from "./ImageField";
import {SelectableImage} from "./SelectableImage";
import {defaultImageLayout,type ImageLayout} from "./table-media";

/** Presentation is shared with study. Pointer movement updates only this DOM object;
 * the owning editor receives one atomic change on drop (one undo step). */
export function TableImage({name,cellId,alt="Cell image",layout=defaultImageLayout,onCommit,onRemove}:{name:string;cellId:string;alt?:string;layout?:ImageLayout;onCommit?:(to:string,layout:ImageLayout)=>void;onRemove?:()=>void}) {
  const frame=useRef<HTMLDivElement>(null);
  const [cropping,setCropping]=useState(false),[ratio,setRatio]=useState(1);
  const gesture=useRef<{pointer:number;x:number;y:number;resize:boolean;width:number;height:number;left:number;top:number;cells:{id:string;rect:DOMRect}[];bounds:DOMRect}|null>(null);
  function restore(){if(frame.current){frame.current.style.transform="";frame.current.style.width=`${layout.width}px`;}gesture.current=null;}
  function begin(event:PointerEvent,resize=false){
    if(!onCommit||event.button!==0||!frame.current)return;
    event.preventDefault();event.stopPropagation();frame.current.focus();
    const table=frame.current.closest("table"),bounds=table?.getBoundingClientRect();if(!table||!bounds)return;
    const rect=frame.current.getBoundingClientRect();
    gesture.current={pointer:event.pointerId,x:event.clientX,y:event.clientY,resize,width:rect.width,height:rect.height,left:rect.left,top:rect.top,bounds,cells:Array.from(table.querySelectorAll<HTMLElement>("[data-media-cell]")).map(cell=>({id:cell.dataset.mediaCell!,rect:cell.getBoundingClientRect()}))};
    frame.current.setPointerCapture(event.pointerId);
  }
  function position(event:PointerEvent){const g=gesture.current!;return {x:Math.max(g.bounds.left,Math.min(g.bounds.right-g.width,g.left+event.clientX-g.x)),y:Math.max(g.bounds.top,Math.min(g.bounds.bottom-g.height,g.top+event.clientY-g.y))};}
  function finish(event:PointerEvent){
    const g=gesture.current;if(!g||g.pointer!==event.pointerId)return;
    if(g.resize){const width=Math.max(24,Math.min(640,g.bounds.right-g.left,g.width+event.clientX-g.x));restore();onCommit?.(cellId,{...layout,width});}
    else {
      const p=position(event),target=g.cells.find(c=>event.clientX>=c.rect.left&&event.clientX<c.rect.right&&event.clientY>=c.rect.top&&event.clientY<c.rect.bottom);
      restore();if(target)onCommit?.(target.id,{...layout,x:Math.max(0,p.x-target.rect.left),y:Math.max(0,p.y-target.rect.top)});
    }
    if(frame.current?.hasPointerCapture(event.pointerId))frame.current.releasePointerCapture(event.pointerId);
  }
  const crop=layout.crop;
  const picture=<div className="table-image-picture" style={crop?{aspectRatio:ratio*crop.width/crop.height,overflow:"hidden",position:"relative"}:undefined} onLoadCapture={event=>{const img=event.target;if(img instanceof HTMLImageElement&&img.naturalHeight)setRatio(img.naturalWidth/img.naturalHeight);}}><div style={crop?{width:`${100/crop.width}%`,position:"absolute",left:`${-crop.x/crop.width*100}%`,top:`${-crop.y/crop.height*100}%`}:undefined}><ManagedImage name={name} alt={alt}/></div></div>;
  return <div ref={frame} className="table-direct-image" style={{width:layout.width,marginLeft:layout.x,marginTop:layout.y}} tabIndex={onCommit?0:undefined} aria-label={onCommit?"Move cell image (arrow keys; Shift+Arrow resizes)":undefined}
    onPointerDown={event=>{if(event.target instanceof HTMLImageElement)begin(event);}}
    onPointerMove={event=>{const g=gesture.current;if(!g||!frame.current)return;event.stopPropagation();if(g.resize)frame.current.style.width=`${Math.max(24,Math.min(640,g.bounds.right-g.left,g.width+event.clientX-g.x))}px`;else{const p=position(event);frame.current.style.transform=`translate(${p.x-g.left}px,${p.y-g.top}px)`;}}}
    onPointerUp={finish} onPointerCancel={restore} onLostPointerCapture={restore}
    onKeyDown={event=>{if(event.key==="Escape"){restore();return;}if(event.target!==event.currentTarget||!onCommit)return;const delta=({ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]} as Record<string,number[]>)[event.key];if(delta){event.preventDefault();event.stopPropagation();onCommit(cellId,event.shiftKey?{...layout,width:Math.max(24,Math.min(640,layout.width+(delta[0]||delta[1])*4))}:{...layout,x:Math.max(0,layout.x+delta[0]*4),y:Math.max(0,layout.y+delta[1]*4)});}}}>
    {onRemove?<SelectableImage name={name} label={alt.charAt(0).toLowerCase()+alt.slice(1)} onRemove={onRemove}>{picture}</SelectableImage>:picture}
    {onCommit&&<><button type="button" className="table-image-crop icon" aria-label="Crop cell image" title="Crop image" onClick={()=>setCropping(true)}><Crop size={14}/></button><button type="button" className="table-image-resize" aria-label="Resize cell image" title="Drag to resize proportionally" onPointerDown={event=>begin(event,true)}/></>}
    {cropping&&<TableCrop name={name} crop={crop} onClose={()=>setCropping(false)} onApply={crop=>{onCommit?.(cellId,{...layout,crop});setCropping(false);}}/>}
  </div>;
}
