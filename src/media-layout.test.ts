import {expect,it} from "vitest";
import {calculateStudyMediaSize} from "./media-layout";
it.each([[1600,900],[800,600],[600,600],[900,1600],[2100,900]])("keeps source geometry for %i × %i",(w,h)=>{
 const size=calculateStudyMediaSize({intrinsicWidth:w,intrinsicHeight:h,availableWidth:900,availableHeight:480,contentType:"video"})!;
 expect(size.width/size.height).toBeCloseTo(w/h);expect(size.width).toBeLessThanOrEqual(w*2);
});
it("upscales small Diagrams but bounds enlargement and permits scrolling",()=>{
 const common={intrinsicWidth:200,intrinsicHeight:180,contentType:"diagram" as const};
 const desktop=calculateStudyMediaSize({...common,availableWidth:1000,availableHeight:700})!;
 expect(desktop.width).toBeGreaterThanOrEqual(560);expect(desktop.width).toBeLessThanOrEqual(800);
 const small=calculateStudyMediaSize({...common,availableWidth:300,availableHeight:200})!;
 expect(small.width).toBe(560);expect(small.overflow).toBe(true);
 expect(calculateStudyMediaSize({...common,intrinsicWidth:100,availableWidth:1500,availableHeight:1500})!.width).toBeLessThanOrEqual(400);
});
it("includes visual bounds and rejects missing source dimensions",()=>{
 const base={intrinsicWidth:1000,intrinsicHeight:500,availableWidth:1200,availableHeight:700,contentType:"diagram" as const};
 expect(calculateStudyMediaSize({...base,visualBounds:{width:2,height:1}})!.width).toBe(600);
 expect(calculateStudyMediaSize({...base,intrinsicWidth:0})).toBeNull();
});
