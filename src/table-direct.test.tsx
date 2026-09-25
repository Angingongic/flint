// @vitest-environment jsdom
import {useState} from "react";
import {afterEach,it,expect,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {createGrid,setCell,setCellImage,insertGridAxis,removeGridAxis,validStructure} from "./structured";
import {moveTableImage} from "./table-media";
import {TableEditor} from "./TableEditor";
import {TableImage} from "./TableImage";
vi.mock("./native",()=>({mediaUrl:async(name:string)=>name,saveMediaBytes:vi.fn()}));
afterEach(cleanup);
it("pointer movement never persists until drop",async()=>{
 vi.stubGlobal("PointerEvent",MouseEvent);
 const commit=vi.fn();render(<table><tbody><tr><td data-media-cell="a"><TableImage name="original.png" cellId="a" onCommit={commit}/></td><td data-media-cell="b"/></tr></tbody></table>);
 const img=await screen.findByAltText("Cell image"),frame=img.closest(".table-direct-image") as HTMLElement;
 frame.setPointerCapture=vi.fn();frame.hasPointerCapture=()=>false;
 frame.getBoundingClientRect=()=>new DOMRect(0,0,80,60);
 frame.closest("table")!.getBoundingClientRect=()=>new DOMRect(0,0,400,200);
 const cells=document.querySelectorAll("td");cells[0].getBoundingClientRect=()=>new DOMRect(0,0,200,200);cells[1].getBoundingClientRect=()=>new DOMRect(200,0,200,200);
 fireEvent.pointerDown(img,{button:0,clientX:10,clientY:10});
 fireEvent.pointerMove(frame,{clientX:230,clientY:30});expect(commit).not.toHaveBeenCalled();
 fireEvent.pointerUp(frame,{clientX:230,clientY:30});expect(commit).toHaveBeenCalledTimes(1);expect(commit).toHaveBeenCalledWith("b",{x:20,y:20,width:120});
 vi.unstubAllGlobals();
});
function sample(){return setCellImage(setCell(setCell(createGrid(2,2),1,1,"H"),1,0,"Hydrogen"),1,0,"original.png");}
it("moves ownership without mutating bytes or overwriting another cell",()=>{
 const v=sample(),from=`${v.rows[1].id}:${v.columns[0].id}`,to=`${v.rows[1].id}:${v.columns[1].id}`;
 const layout={x:8,y:12,width:90,crop:{x:.1,y:.1,width:.8,height:.7}};
 const next=moveTableImage(v,from,to,layout);
 expect(next.images?.[from]).toBeUndefined();expect(next.images?.[to]).toBe("original.png");expect(next.imageLayouts?.[to]).toEqual(layout);
 expect(v.images?.[from]).toBe("original.png");expect(validStructure(JSON.parse(JSON.stringify(next)))).toBe(true);
 expect(moveTableImage(setCellImage(v,1,1,"other.png"),from,to,layout).images?.[to]).toBe("other.png");
 const duplicated=insertGridAxis(next,"rows",2,1);expect(Object.values(duplicated.imageLayouts||{})).toHaveLength(2);
 expect(Object.values(removeGridAxis(next,"rows",1).imageLayouts||{})).toHaveLength(0);
});
it("keyboard movement and crop each undo atomically",async()=>{
 let last=sample();function Harness(){const [v,set]=useState(last);last=v;return <TableEditor value={v} onChange={set}/>;}
 render(<Harness/>);await screen.findByAltText("Image in row 2, column 1");
 fireEvent.keyDown(screen.getByLabelText("Move cell image (arrow keys; Shift+Arrow resizes)"),{key:"ArrowRight"});
 expect(Object.values(last.imageLayouts||{})[0].x).toBe(4);
 fireEvent.click(screen.getByRole("button",{name:"Undo"}));expect(last.imageLayouts).toBeUndefined();
 fireEvent.click(screen.getByRole("button",{name:"Crop cell image"}));
 fireEvent.keyDown(screen.getByLabelText("Crop frame"),{key:"ArrowLeft",shiftKey:true});
 fireEvent.click(screen.getByRole("button",{name:"Apply crop"}));
 expect(Object.values(last.imageLayouts||{})[0].crop?.width).toBe(.99);
 expect(Object.values(last.images||{})).toEqual(["original.png"]);
 fireEvent.click(screen.getByRole("button",{name:"Undo"}));expect(last.imageLayouts).toBeUndefined();
});
it("rejects corrupt crop and orphaned presentation metadata",()=>{
 const v=sample(),key=Object.keys(v.images!)[0];
 expect(validStructure({...v,imageLayouts:{[key]:{x:0,y:0,width:100,crop:{x:.8,y:0,width:.8,height:1}}}})).toBe(false);
 expect(validStructure({...v,textPositions:{missing:{x:0,y:0}}})).toBe(false);
});
