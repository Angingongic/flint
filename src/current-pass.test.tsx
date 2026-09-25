// @vitest-environment jsdom
import {useState} from "react";
import {cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {afterEach,it,expect,vi} from "vitest";
import {createGrid,createOcclusion,addRegion,updateRegion,structuredUnitId,selectTargets} from "./structured";
import {StructuredEditor} from "./StructuredEditor";
import {StructuredView} from "./StructuredView";
import {newCard} from "./lib";
import {beginLearn,prepareLearnChoices,structuredLearnGroup,answerLearnGroup} from "./learn-engine";
vi.mock("./native",()=>({mediaUrl:async(name:string)=>name,saveMediaBytes:vi.fn()}));
afterEach(()=>{cleanup();vi.restoreAllMocks();});
const diagram=()=>{let value={...createOcclusion(),image:"source.png"};for(let i=0;i<4;i++){value=addRegion(value,{x:i*.2,y:.2,width:.18,height:.1});value=updateRegion(value,value.regions[i].id,{answer:["Nucleus","Golgi","Membrane","Mitochondria"][i]});}return value;};
it.each([0,.4,.99])("selects 1–3 persisted independent Diagram targets at random %s",random=>{
 vi.spyOn(Math,"random").mockReturnValue(random);
 const card={...newCard("",""),structure:diagram()};
 const state=prepareLearnChoices(beginLearn([card]),[card]);const group=structuredLearnGroup(card,state);
 expect(group).toHaveLength(1+Math.floor(random*3));
 expect(prepareLearnChoices(JSON.parse(JSON.stringify(state)),[card])).toEqual(state);
 expect(new Set(group.map(t=>t.id)).size).toBe(group.length);
 const outcomes=Object.fromEntries(group.map((t,i)=>[structuredUnitId(card.id,t.id),i!==0]));
 const next=answerLearnGroup(state,outcomes);expect(next.mistakes[structuredUnitId(card.id,group[0].id)]).toBe(1);
 for(const target of group.slice(1))expect(next.mistakes[structuredUnitId(card.id,target.id)]).toBeUndefined();
 expect(selectTargets(card.structure,undefined,()=>random)).toHaveLength(group.length);
});
it("hides non-requested labels without changing the reference card",async()=>{
 const value=diagram();const view=render(<StructuredView value={value} mode="choice" targetIds={[value.regions[0].id]}/>);
 expect((await screen.findByLabelText("Region 2")).textContent).toBe("—");
 view.rerender(<StructuredView value={value} mode="reference"/>);
 expect(screen.getByLabelText("Region 2").textContent).toBe("Golgi");
});
it.each(["table","diagram"])("protects dirty %s edits with cancel, discard, and Save All",type=>{
 function Harness(){const [value,setValue]=useState(type==="table"?createGrid():diagram());return <StructuredEditor value={value} onChange={next=>{if(next)setValue(next);}}>Standard</StructuredEditor>;}
 render(<Harness/>);fireEvent.click(screen.getByRole("button",{name:"Edit structured card"}));
 const title=type==="table"?"Edit Tables":"Edit Diagrams";
 fireEvent.click(within(screen.getByRole("dialog",{name:title})).getByRole("button",{name:"Close dialog"}));expect(screen.queryByRole("dialog")).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"Edit structured card"}));
 fireEvent.change(screen.getByLabelText("Study prompt (optional)"),{target:{value:"Changed"}});
 const close=()=>fireEvent.click(within(screen.getByRole("dialog",{name:title})).getByRole("button",{name:"Close dialog"}));close();
 fireEvent.click(screen.getByRole("button",{name:"Cancel"}));expect((screen.getByLabelText("Study prompt (optional)") as HTMLInputElement).value).toBe("Changed");
 close();fireEvent.click(screen.getByRole("button",{name:"Discard Changes"}));fireEvent.click(screen.getByRole("button",{name:"Edit structured card"}));expect((screen.getByLabelText("Study prompt (optional)") as HTMLInputElement).value).toBe("");
 fireEvent.change(screen.getByLabelText("Study prompt (optional)"),{target:{value:"Saved"}});close();fireEvent.click(screen.getByRole("button",{name:"Save All"}));
 fireEvent.click(screen.getByRole("button",{name:"Edit structured card"}));expect((screen.getByLabelText("Study prompt (optional)") as HTMLInputElement).value).toBe("Saved");close();expect(screen.queryByRole("dialog")).toBeNull();
});
