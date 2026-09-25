// @vitest-environment jsdom
import {useState} from "react";
import {cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {TableEditor} from "./TableEditor";
import {createGrid,pasteGrid,nameGridAxis,insertGridAxis,validStructure,setCellImage,removeGridAxis} from "./structured";
vi.mock("./native",()=>({saveMediaBytes:vi.fn(async()=>"managed.png"),mediaUrl:async(name:string)=>name}));
afterEach(cleanup);
const seed=()=>pasteGrid(createGrid(3,2),"Element\tSymbol\nHydrogen\tH\nCarbon\tC",0,0);
function Harness(){const [value,setValue]=useState(seed());return <TableEditor value={value} onChange={setValue}/>;}
it("stores independent, blank-capable axis names without changing cells or unknown metadata",()=>{
  const original={...seed(),extension:{preserved:true}};
  const named=nameGridAxis(nameGridAxis(original,"rows",1,"Atoms"),"columns",0,"");
  expect(named.cells).toEqual(original.cells);
  expect(named.rows[1].name).toBe("Atoms");expect(named.columns[0].name).toBe("");
  expect(JSON.parse(JSON.stringify(named)).extension).toEqual({preserved:true});
  expect(validStructure(named)).toBe(true);
  const duplicated=insertGridAxis(named,"rows",2,1);
  expect(duplicated.rows[2].id).not.toBe(named.rows[1].id);
  expect(duplicated.rows[2].name).toBe("Atoms");
  expect(duplicated.cells[duplicated.rows[2].id+":"+duplicated.columns[1].id]).toBe("H");
});
it("renames axes directly and duplicates a row from its contextual menu with one undo",()=>{
  render(<Harness/>);
  fireEvent.change(screen.getByLabelText("Row 2 name"),{target:{value:"Named row"}});
  expect((screen.getByLabelText("Row 2, column 1") as HTMLInputElement).value).toBe("Hydrogen");
  fireEvent.contextMenu(screen.getByLabelText("Row 2 name"),{clientX:900,clientY:600});
  fireEvent.click(screen.getByRole("menuitem",{name:"Duplicate row"}));
  expect((screen.getByLabelText("Row 3, column 2") as HTMLInputElement).value).toBe("H");
  fireEvent.click(screen.getByRole("button",{name:"Undo"}));
  expect((screen.getByLabelText("Row 3, column 2") as HTMLInputElement).value).toBe("C");
  expect(screen.queryByLabelText("Row 4 name")).toBeNull();
});
it("clears a selected rectangle through the menu and restores it as one undo step",()=>{
  render(<Harness/>);
  fireEvent.pointerDown(screen.getByLabelText("Row 2, column 1"));
  fireEvent.pointerDown(screen.getByLabelText("Row 3, column 2"),{shiftKey:true});
  fireEvent.contextMenu(screen.getByLabelText("Row 2, column 1"));
  fireEvent.click(screen.getByRole("menuitem",{name:"Clear contents"}));
  expect((screen.getByLabelText("Row 3, column 2") as HTMLInputElement).value).toBe("");
  fireEvent.click(screen.getByRole("button",{name:"Undo"}));
  expect((screen.getByLabelText("Row 2, column 1") as HTMLInputElement).value).toBe("Hydrogen");
  expect((screen.getByLabelText("Row 3, column 2") as HTMLInputElement).value).toBe("C");
});
it("provides keyboard menu navigation and Escape dismissal without changing data",()=>{
  render(<Harness/>);fireEvent.contextMenu(screen.getByLabelText("Row 2, column 2"));
  const menu=screen.getByRole("menu");
  fireEvent.keyDown(menu,{key:"End"});expect(document.activeElement?.textContent).toBe("Column");
  fireEvent.keyDown(menu,{key:"ArrowRight"});expect(screen.getByRole("menu",{name:"Column"})).toBeTruthy();
  fireEvent.keyDown(screen.getByRole("menu"),{key:"Escape"});expect(screen.queryByRole("menu")).toBeNull();
  expect((screen.getByLabelText("Row 2, column 2") as HTMLInputElement).value).toBe("H");
  fireEvent.click(screen.getByText("Table options"));
  expect(within(screen.getByText("Structure").parentElement!).getByRole("button",{name:"Increase rows"})).toBeTruthy();
});
it("copies a selected rectangle as TSV and cuts it with a single undo",()=>{
  render(<Harness/>);
  fireEvent.pointerDown(screen.getByLabelText("Row 2, column 1"));
  fireEvent.pointerDown(screen.getByLabelText("Row 3, column 2"),{shiftKey:true});
  let copied="";
  fireEvent.cut(screen.getByLabelText("Row 3, column 2"),{clipboardData:{setData:(_type:string,value:string)=>{copied=value;}}});
  expect(copied).toBe("Hydrogen\tH\nCarbon\tC");
  expect((screen.getByLabelText("Row 2, column 1") as HTMLInputElement).value).toBe("");
  fireEvent.click(screen.getByRole("button",{name:"Undo"}));
  expect((screen.getByLabelText("Row 2, column 1") as HTMLInputElement).value).toBe("Hydrogen");
});
it("stores pasted cell images, supports Undo/Redo and never replaces the text paste path",async()=>{
  render(<Harness/>);
  fireEvent.paste(screen.getByLabelText("Row 2, column 1"),{clipboardData:{files:[new File(["pixels"],"paste.png",{type:"image/png"})],getData:()=>""}});
  expect(await screen.findByAltText("Image in row 2, column 1")).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Undo"}));
  expect(screen.queryByAltText("Image in row 2, column 1")).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Redo"}));
  expect(await screen.findByAltText("Image in row 2, column 1")).toBeTruthy();
  fireEvent.paste(screen.getByLabelText("Row 2, column 1"),{clipboardData:{files:[],getData:()=>"Helium\tHe"}});
  expect((screen.getByLabelText("Row 2, column 2") as HTMLInputElement).value).toBe("He");
});
it("duplicates cell media references but removes deleted-axis references without mutating the source",()=>{
  const original=setCellImage(seed(),1,0,"managed.png");
  const duplicate=insertGridAxis(original,"rows",2,1);
  expect(Object.values(duplicate.images!)).toEqual(["managed.png","managed.png"]);
  const removed=removeGridAxis(duplicate,"rows",1);
  expect(Object.values(removed.images!)).toEqual(["managed.png"]);
  expect(Object.values(original.images!)).toEqual(["managed.png"]);
});
