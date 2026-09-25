import {useRef,useState} from "react";
import {ManagedImage} from "./ImageField";
import {Modal} from "./ui";
import type {ImageCropRect} from "./table-media";
const full={x:0,y:0,width:1,height:1};
export function TableCrop({name,crop,onApply,onClose}:{name:string;crop?:ImageCropRect;onApply:(crop:ImageCropRect)=>void;onClose:()=>void}) {
  const [rect,setRect]=useState(crop||full),frame=useRef<HTMLDivElement>(null);
  const drag=useRef<{x:number;y:number;rect:ImageCropRect;bounds:DOMRect;resize:boolean}|null>(null);
  return <Modal title="Crop cell image" onClose={onClose}><p>Drag the frame to reposition it; drag its corner to crop. Original image bytes are preserved.</p>
    <div className="table-crop-workspace" ref={frame}><ManagedImage name={name} alt="Original crop source"/>
      <div role="group" tabIndex={0} aria-label="Crop frame" className="table-crop-frame" style={{left:`${rect.x*100}%`,top:`${rect.y*100}%`,width:`${rect.width*100}%`,height:`${rect.height*100}%`}}
        onPointerDown={e=>{if(e.button!==0||!frame.current)return;e.preventDefault();drag.current={x:e.clientX,y:e.clientY,rect,bounds:frame.current.getBoundingClientRect(),resize:(e.target as HTMLElement).tagName==="BUTTON"};e.currentTarget.setPointerCapture(e.pointerId);}}
        onPointerMove={e=>{const d=drag.current;if(!d)return;const dx=(e.clientX-d.x)/d.bounds.width,dy=(e.clientY-d.y)/d.bounds.height;setRect(d.resize?{...d.rect,width:Math.max(.05,Math.min(1-d.rect.x,d.rect.width+dx)),height:Math.max(.05,Math.min(1-d.rect.y,d.rect.height+dy))}:{...d.rect,x:Math.max(0,Math.min(1-d.rect.width,d.rect.x+dx)),y:Math.max(0,Math.min(1-d.rect.height,d.rect.y+dy))});}}
        onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{if(drag.current)setRect(drag.current.rect);drag.current=null;}}
        onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();onApply(rect);return;}const d=({ArrowLeft:[-.01,0],ArrowRight:[.01,0],ArrowUp:[0,-.01],ArrowDown:[0,.01]} as Record<string,number[]>)[e.key];if(d){e.preventDefault();setRect(e.shiftKey?{...rect,width:Math.max(.05,Math.min(1-rect.x,rect.width+d[0])),height:Math.max(.05,Math.min(1-rect.y,rect.height+d[1]))}:{...rect,x:Math.max(0,Math.min(1-rect.width,rect.x+d[0])),y:Math.max(0,Math.min(1-rect.height,rect.y+d[1]))});}}}><button type="button" aria-label="Resize crop frame" title="Drag to crop; Shift+Arrow on frame to resize"/></div>
    </div><div className="modal-actions"><button onClick={()=>setRect(full)}>Reset crop</button><button onClick={onClose}>Cancel</button><button className="primary" onClick={()=>onApply(rect)}>Apply crop</button></div>
  </Modal>;
}
