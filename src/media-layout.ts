import {useEffect,useState,type RefObject} from "react";
export type MediaSizing = {intrinsicWidth:number;intrinsicHeight:number;availableWidth:number;availableHeight:number;contentType:"image"|"video"|"diagram";mode?:"study"|"choice"|"preview";visualBounds?:{width:number;height:number};readabilityMinimum?:number;upscaleLimit?:number};
/** Preserve source geometry; prefer local scrolling over unreadably small objects. */
export function calculateStudyMediaSize(input:MediaSizing) {
  const {intrinsicWidth:w,intrinsicHeight:h}=input;
  if(![w,h].every(n=>Number.isFinite(n)&&n>0))return null;
  const bounds=input.visualBounds||{width:1,height:1};
  const ceiling=w*(input.upscaleLimit??(input.contentType==="diagram"?4:2));
  const floor=Math.min(ceiling,input.readabilityMinimum??(input.contentType==="diagram"?560:input.mode==="choice"?180:240));
  const fit=Math.min(input.availableWidth/Math.max(1,bounds.width),input.availableHeight*w/h/Math.max(1,bounds.height));
  const width=Math.min(ceiling,Math.max(floor,fit));
  return {width,height:width*h/w,overflow:width*bounds.width>input.availableWidth||width*h/w*bounds.height>input.availableHeight};
}
export function useStudyMediaSize(ref:RefObject<HTMLElement|null>,width:number,height:number,contentType:MediaSizing["contentType"],visualBounds?:MediaSizing["visualBounds"],mode:MediaSizing["mode"]="study") {
  const [available,setAvailable]=useState({width:800,height:480});
  useEffect(()=>{
    const parent=ref.current?.parentElement;if(!parent)return;
    const update=()=>setAvailable({width:parent.clientWidth||800,height:Math.max(220,window.innerHeight*(mode==="choice"?.34:.58))});
    update();const observer=typeof ResizeObserver!=="undefined"?new ResizeObserver(update):null;observer?.observe(parent);window.addEventListener("resize",update);
    return()=>{observer?.disconnect();window.removeEventListener("resize",update);};
  },[ref,width,height,mode]);
  return calculateStudyMediaSize({intrinsicWidth:width,intrinsicHeight:height,availableWidth:available.width,availableHeight:available.height,contentType,visualBounds,mode});
}
