import {useRef,type ReactNode} from "react";
import {Move} from "lucide-react";
export function TableText({position,children,onMove}:{position?:{x:number;y:number};children:ReactNode;onMove?:(position:{x:number;y:number})=>void}) {
  const root=useRef<HTMLDivElement>(null),drag=useRef<{x:number;y:number;maxX:number;maxY:number}|null>(null);
  if(!position)return <>{children}</>;
  return <div ref={root} className="table-free-text" style={{marginLeft:position.x,marginTop:position.y}}>
    {onMove&&<button className="table-text-grip icon" type="button" title="Move text; arrow keys for precise positioning" aria-label="Move cell text"
      onPointerDown={e=>{e.preventDefault();e.stopPropagation();const cell=root.current?.closest("td")?.getBoundingClientRect();if(!cell)return;drag.current={x:e.clientX,y:e.clientY,maxX:Math.max(0,cell.width-40),maxY:Math.max(0,cell.height-24)};e.currentTarget.setPointerCapture(e.pointerId);}}
      onPointerMove={e=>{const d=drag.current;if(d&&root.current)root.current.style.transform=`translate(${Math.max(0,Math.min(d.maxX,position.x+e.clientX-d.x))-position.x}px,${Math.max(0,Math.min(d.maxY,position.y+e.clientY-d.y))-position.y}px)`;}}
      onPointerUp={e=>{const d=drag.current;if(!d)return;drag.current=null;if(root.current)root.current.style.transform="";onMove({x:Math.max(0,Math.min(d.maxX,position.x+e.clientX-d.x)),y:Math.max(0,Math.min(d.maxY,position.y+e.clientY-d.y))});}}
      onPointerCancel={()=>{drag.current=null;if(root.current)root.current.style.transform="";}}
      onKeyDown={e=>{const d=({ArrowLeft:[-4,0],ArrowRight:[4,0],ArrowUp:[0,-4],ArrowDown:[0,4]} as Record<string,number[]>)[e.key];if(d){e.preventDefault();e.stopPropagation();const cell=root.current?.closest("td");onMove({x:Math.max(0,Math.min((cell?.clientWidth||40)-40,position.x+d[0])),y:Math.max(0,Math.min((cell?.clientHeight||24)-24,position.y+d[1]))});}}}><Move size={14}/></button>}
    {children}
  </div>;
}
