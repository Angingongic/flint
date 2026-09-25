// @vitest-environment jsdom
import {useState} from "react";
import {cleanup,fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {ImageDestination,ImageField} from "./ImageField";
import {TableEditor} from "./TableEditor";
import {createGrid,setCell,setCellImage} from "./structured";
import {saveMediaBytes} from "./native";
import {SelectableImage} from "./SelectableImage";
vi.mock("./native",()=>({inTauri:()=>true,saveMediaBytes:vi.fn(async(file:File)=>file.name),mediaUrl:async(name:string)=>name}));
afterEach(()=>{cleanup();vi.clearAllMocks();vi.unstubAllGlobals();});
const paste=(target:HTMLElement,name="new.png")=>fireEvent.paste(target,{clipboardData:{files:[new File(["pixels"],name,{type:"image/png"})],getData:()=>""}});
it("pastes into the focused Standard side, confirms replacement and preserves text",async()=>{
 function Harness(){const [front,setFront]=useState<string|null>("old.png");return <><ImageDestination><input aria-label="Front" defaultValue="Keep my text"/><ImageField label="Front image" value={front} onChange={setFront}/></ImageDestination><ImageDestination><input aria-label="Back"/><ImageField label="Back image" onChange={()=>{}}/></ImageDestination></>;}
 render(<Harness/>);paste(screen.getByLabelText("Front"));
 expect(saveMediaBytes).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"Cancel"}));
 expect((await screen.findByAltText("Front image")).getAttribute("src")).toBe("old.png");
 paste(screen.getByLabelText("Front"));
 fireEvent.click(within(screen.getByRole("dialog",{name:"Replace existing image?"})).getByRole("button",{name:"Replace"}));
 await waitFor(()=>expect(screen.getByAltText("Front image").getAttribute("src")).toBe("new.png"));
 expect((screen.getByLabelText("Front") as HTMLInputElement).value).toBe("Keep my text");
 expect(saveMediaBytes).toHaveBeenCalledTimes(1);
});
it("confirms per-cell replacement and restores the old reference with Undo",async()=>{
 function Harness(){const [value,setValue]=useState(setCellImage(setCell(createGrid(2,2),1,0,"10"),1,0,"old.png"));return <TableEditor value={value} onChange={setValue}/>;}
 render(<Harness/>);const cell=screen.getByLabelText("Row 2, column 1");paste(cell);
 fireEvent.click(screen.getByRole("button",{name:"Cancel"}));expect(saveMediaBytes).not.toHaveBeenCalled();
 paste(cell);fireEvent.click(screen.getByRole("button",{name:"Replace"}));
 await waitFor(()=>expect(screen.getByAltText("Image in row 2, column 1").getAttribute("src")).toBe("new.png"));
 fireEvent.click(screen.getByRole("button",{name:"Undo"}));
 await waitFor(()=>expect(screen.getByAltText("Image in row 2, column 1").getAttribute("src")).toBe("old.png"));
 expect((cell as HTMLInputElement).value).toBe("10");
 fireEvent.click(screen.getByRole("button",{name:"Redo"}));
 await waitFor(()=>expect(screen.getByAltText("Image in row 2, column 1").getAttribute("src")).toBe("new.png"));
 });
it("deletes only a selected cell image and restores it with Undo",async()=>{
 function Harness(){const [value,setValue]=useState(setCellImage(setCell(createGrid(2,2),1,0,"10"),1,0,"old.png"));return <TableEditor value={value} onChange={setValue}/>;}
 render(<Harness/>);
 fireEvent.keyDown(screen.getByRole("group",{name:"Select image in row 2, column 1"}),{key:"Backspace"});
 expect(screen.queryByAltText("Image in row 2, column 1")).toBeNull();
 expect((screen.getByLabelText("Row 2, column 1") as HTMLInputElement).value).toBe("10");
 fireEvent.click(screen.getByRole("button",{name:"Undo"}));expect(await screen.findByAltText("Image in row 2, column 1")).toBeTruthy();
});
it("copies original bytes and cuts only after successful clipboard writing",async()=>{
 const blob=new Blob(["original bytes"],{type:"image/png"}),write=vi.fn().mockResolvedValue(undefined),remove=vi.fn();
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,blob:async()=>blob}));
 vi.stubGlobal("ClipboardItem",class {constructor(public data:Record<string,Blob>) {}});
 const old=Object.getOwnPropertyDescriptor(navigator,"clipboard");Object.defineProperty(navigator,"clipboard",{configurable:true,value:{write}});
 try{
 render(<SelectableImage name="old.png" label="picture" onRemove={remove}><img alt="picture"/></SelectableImage>);
 fireEvent.keyDown(screen.getByRole("group"),{key:"c",ctrlKey:true});
 await waitFor(()=>expect(write).toHaveBeenCalledTimes(1));expect(write.mock.calls[0][0][0].data["image/png"]).toBe(blob);expect(remove).not.toHaveBeenCalled();
 fireEvent.keyDown(screen.getByRole("group"),{key:"x",ctrlKey:true});await waitFor(()=>expect(remove).toHaveBeenCalledTimes(1));
 write.mockRejectedValueOnce(Error("denied"));fireEvent.keyDown(screen.getByRole("group"),{key:"x",ctrlKey:true});
 expect(await screen.findByRole("alert")).toBeTruthy();expect(remove).toHaveBeenCalledTimes(1);
 }finally{if(old)Object.defineProperty(navigator,"clipboard",old);else Reflect.deleteProperty(navigator,"clipboard");}
});
