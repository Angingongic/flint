// @vitest-environment jsdom
import {useState} from "react";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,expect,it} from "vitest";
import {Modal} from "./ui";
afterEach(cleanup);
it("cancels only the nested editor, preserving the parent draft",()=>{
  function Harness(){
    const [parent,setParent]=useState(true),[child,setChild]=useState(true);
    return parent&&<Modal title="Card draft" onClose={()=>setParent(false)}><input aria-label="Draft answer" defaultValue="Unsaved work"/>{child&&<Modal title="Structured editor" onClose={()=>setChild(false)}>Canvas</Modal>}</Modal>;
  }
  render(<Harness/>);
  fireEvent(screen.getByRole("dialog",{name:"Structured editor"}),new Event("cancel",{bubbles:true,cancelable:true}));
  expect(screen.queryByRole("dialog",{name:"Structured editor"})).toBeNull();
  expect((screen.getByLabelText("Draft answer") as HTMLInputElement).value).toBe("Unsaved work");
  expect(screen.getByRole("dialog",{name:"Card draft"})).toBeTruthy();
});
