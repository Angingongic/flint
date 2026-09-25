// @vitest-environment jsdom
import { useState } from "react";
import { cleanup,fireEvent,render,screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach,describe,it,expect,vi } from "vitest";
import { newCard,gradeAnswer,isValidCardDraft } from "./lib";
import { createGrid,pasteGrid,structuredTargets,parseStructuredUnit,structuredUnitId,createOcclusion,addRegion,updateRegion } from "./structured";
import { beginLearn,answerLearn,continueWave,structuredLearnGroup,answerLearnGroup,learnComplete,learnProgress } from "./learn-engine";
import { makeTest,testCorrect,testAnswered,questionId } from "./test-engine";
import { SingleCardEditor } from "./SingleCardEditor";
import { SmartMathInput,SmartMathTextarea } from "./SmartMathField";
import { MathText } from "./MathText";
import { duplicateKind } from "./editing";
import { StructuredEditor } from "./StructuredEditor";

afterEach(cleanup);
const tableCard=()=>({...newCard("",""),structure:pasteGrid(createGrid(3,2),"Element\tSymbol\nHydrogen\tH\nCarbon\tC",0,0)});
describe("structured study integration",()=>{
  it("offers Diagrams and Tables with NEW badges while retaining legacy type identifiers",async()=>{
    const user=userEvent.setup(),change=vi.fn();
    render(<StructuredEditor onChange={change}><span>Standard editor</span></StructuredEditor>);
    const diagram=screen.getByRole("button",{name:"Diagrams NEW"}),table=screen.getByRole("button",{name:"Tables NEW"});
    expect(diagram.querySelector(".card-type-new")?.textContent).toBe("NEW");
    expect(table.querySelector(".card-type-new")?.textContent).toBe("NEW");
    await user.click(diagram);
    expect(change.mock.calls[0][0].type).toBe("occlusion");
    await user.click(table);
    expect(change.mock.calls[1][0].type).toBe("table");
    expect(screen.queryByText("Image Occlusion")).toBeNull();
  });
  it("finishes every ordinary, grid and occlusion target across persisted mixed waves",()=>{
    const image=addRegion({...createOcclusion(),image:"managed.png"},{x:.1,y:.2,width:.3,height:.2});
    const occlusion={...newCard("",""),structure:updateRegion(image,image.regions[0].id,{answer:"Nucleus"})};
    const cards=[newCard("Ordinary","Answer"),tableCard(),occlusion];
    let state=beginLearn(cards,{waveSize:2,direction:"terms",grading:"normal"});
    const seen=new Set<string>();
    for(let steps=0;steps<40&&!learnComplete(state);steps++){
      state=JSON.parse(JSON.stringify(state));
      if(!state.queue.length){state=continueWave(state);continue;}
      const question=state.queue[0],parent=parseStructuredUnit(question.cardId)?.[0]||question.cardId;
      const card=cards.find(c=>c.id===parent)!;expect(card).toBeTruthy();seen.add(parent);
      const group=structuredLearnGroup(card,state);
      state=card.structure?answerLearnGroup(state,Object.fromEntries(group.map(t=>[structuredUnitId(card.id,t.id),true]))):answerLearn(state,true);
    }
    expect(learnComplete(state)).toBe(true);expect(learnProgress(state)).toBe(100);
    expect(seen).toEqual(new Set(cards.map(c=>c.id)));
    expect(Object.values(state.mastery).every(m=>m==="Mastered")).toBe(true);
  });
  it("resumes the same multi-cell Learn mask and grades each cell independently",()=>{
    const card={...newCard("",""),structure:pasteGrid(createGrid(3,4),"Element\tSymbol\tNumber\tMass\nHydrogen\tH\t1\t1.008\nCarbon\tC\t6\t12.011",0,0)};
    let state=beginLearn([card],{...beginLearn([card]).options,waveSize:10});
    const mask=structuredLearnGroup(card,state);
    expect(mask).toHaveLength(3);
    expect(structuredLearnGroup(card,JSON.parse(JSON.stringify(state)))).toEqual(mask);
    const outcomes=Object.fromEntries(mask.map((t,i)=>[structuredUnitId(card.id,t.id),i!==0]));
    state=answerLearnGroup(state,outcomes);
    expect(state.mastery[structuredUnitId(card.id,mask[0].id)]).toBe("Learning");
    expect(state.mastery[structuredUnitId(card.id,mask[1].id)]).toBe("Familiar");
    expect(state.queue.filter(q=>q.kind==="typed")).toHaveLength(6);
    expect(state.queue.filter(q=>q.kind==="choice")).toHaveLength(3);
  });
  it("uses unique question identities for varied table masks and respects selected types",()=>{
    const card=tableCard(),questions=makeTest([card],10,["written"],"definitions");
    expect(questions).toHaveLength(3);
    expect(new Set(questions.map(questionId)).size).toBe(3);
    expect(questions.every(q=>q.card.id===card.id)).toBe(true);
    expect(makeTest([card],2,["choice"],"definitions")).toEqual([]);
  });
  it("tracks each cell in the existing Learn engine and requeues weak targets",()=>{
    const card=tableCard();let state=beginLearn([card]);
    expect(state.ids).toHaveLength(2);
    const weak=state.ids[0];expect(parseStructuredUnit(weak)?.[0]).toBe(card.id);
    expect(state.queue.map(q=>q.kind)).toEqual(["choice","choice","typed","typed"]);
    state=answerLearn(state,true);state=answerLearn(state,true);state=answerLearn(state,false);state=answerLearn(state,true);
    expect(state.mastery[weak]).toBe("Learning");expect(state.mistakes[weak]).toBe(1);
    expect(continueWave(state).queue.every(q=>q.cardId===weak)).toBe(true);
  });
  it("keeps actual Test questions structured with per-cell answer validation",()=>{
    const card=tableCard();const [q]=makeTest([card],1,["written"],"definitions");
    expect(q.card.structure).toEqual(card.structure);expect(q.structuredTargets!.length).toBeGreaterThanOrEqual(1);expect(q.structuredTargets!.length).toBeLessThanOrEqual(2);
    const answers=Object.fromEntries(q.structuredTargets!.map(t=>[t.id,t.answer]));
    expect(testAnswered(q,JSON.stringify(answers))).toBe(true);expect(testCorrect(q,JSON.stringify(answers))).toBe(true);
    answers[q.structuredTargets![0].id]="wrong";expect(testCorrect(q,JSON.stringify(answers))).toBe(false);
    delete answers[q.structuredTargets![0].id];expect(testAnswered(q,JSON.stringify(answers))).toBe(false);
  });
  it("does not merge different empty-front structured cards as duplicates",()=>{
    const a=tableCard(),b=tableCard();b.structure.cells[structuredTargets(b.structure)[0].id]="Different";
    const copy={...a,id:"copy"};expect(duplicateKind(a,b)).toBeNull();expect(duplicateKind(a,copy)).toBe("exact");
  });
  it("saves the actual single-card editor payload without flattening",async()=>{
    const user=userEvent.setup(),save=vi.fn(async()=>{}),card=tableCard();
    render(<SingleCardEditor card={card} starred={false} save={save} close={()=>{}}/>);
    expect(screen.queryByRole("group",{name:"Card type"})).toBeNull();
    expect(screen.queryByRole("button",{name:"Undo card edit"})).toBeNull();
    expect(screen.queryByRole("button",{name:"Redo card edit"})).toBeNull();
    await user.click(screen.getByRole("button",{name:"Edit structured card"}));
    const field=screen.getByRole("textbox",{name:"Row 2, column 2"});
    await user.clear(field);await user.type(field,"Hydrogen");await user.click(screen.getByRole("button",{name:"Done editing"}));await user.click(screen.getByRole("button",{name:"Save card"}));
    expect(save).toHaveBeenCalledOnce();const saved=save.mock.calls[0] as unknown as [typeof card];
    expect(saved[0].structure.cells[structuredTargets(card.structure)[0].id]).toBe("Hydrogen");
    expect(saved[0].question).toBe("");expect(isValidCardDraft(saved[0])).toBe(true);
  });
});
describe("canonical math editing",()=>{
  it("keeps explicitly exposed source literal during subsequent edits and restores presentation on reopening",async()=>{
    const user=userEvent.setup();function Harness(){const [value,setValue]=useState("x^2");return <SmartMathInput value={value} onChange={e=>setValue(e.target.value)}/>;}
    const {container}=render(<Harness/>);const input=screen.getByRole("textbox") as HTMLInputElement;
    expect(container.querySelector("msup")).toBeTruthy();
    await user.click(input);await user.keyboard("{End}+1{Backspace}");
    expect(container.querySelector(".math-inline-surface")).toBeNull();
    expect(input.value).toBe("x^2+");
    fireEvent.blur(input);
    fireEvent.change(input,{target:{value:"x^2+1",selectionStart:5}});
    fireEvent.blur(input);
    expect(container.querySelector("msup")).toBeTruthy();
  });
  it("keeps an existing fraction formatted through ordinary trailing deletion",async()=>{
    const user=userEvent.setup();function Harness(){const [value,setValue]=useState("");return <SmartMathInput value={value} onChange={e=>setValue(e.target.value)}/>;}
    const {container}=render(<Harness/>);const input=screen.getByRole("textbox") as HTMLInputElement;
    await user.type(input,"1/2 + 31");
    for(const expected of ["1/2 + 3","1/2 + ","1/2 +","1/2 ","1/2"]){await user.keyboard("{Backspace}");expect(input.value).toBe(expected);expect(container.querySelector("mfrac")).toBeTruthy();}
  });
  it("accepts an inline suggestion with Tab and dismisses it with Escape",async()=>{
    const user=userEvent.setup();
    function Harness(){const [value,setValue]=useState("");return <SmartMathTextarea value={value} suggestion="x = 1" onAcceptSuggestion={setValue} onChange={e=>setValue(e.target.value)}/>;}
    const {container}=render(<Harness/>);const input=screen.getByRole("textbox") as HTMLTextAreaElement;
    await user.click(input);await user.keyboard("{Escape}");expect(container.querySelector(".math-autofill-ghost")).toBeNull();
    cleanup();render(<Harness/>);await user.click(screen.getByRole("textbox"));await user.keyboard("{Tab}");expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("x = 1");
  });
  it("renders arbitrary fractions and exponents using actual math layout",()=>{
    const {container}=render(<MathText text="Use (x+1)/(x-2) and x^142."/>);
    expect(container.querySelector("mfrac")).toBeTruthy();expect(container.querySelector("msup")).toBeTruthy();
    expect(gradeAnswer("x^(27)","x^27")).toBe("CORRECT");expect(gradeAnswer("12","1/2")).toBe("INCORRECT");
  });
  it("Backspace deletes once without a formatting interception",async()=>{
    const user=userEvent.setup();
    function Harness(){const [value,setValue]=useState("");return <SmartMathInput aria-label="Math answer" value={value} onChange={e=>setValue(e.target.value)}/>;}
    const {container}=render(<Harness/>);const input=screen.getByRole("textbox") as HTMLInputElement;
    await user.type(input,"x^27");expect(container.querySelector("msup")).toBeTruthy();
    await user.keyboard("{Backspace}");expect(input.value).toBe("x^2");expect(container.querySelector("msup")).toBeTruthy();
    await user.keyboard("{Backspace}");expect(input.value).toBe("x^");
  });
  it("copies mixed prose and formatted math as canonical syntax",()=>{
    const text="Use (x+1)/(x-2).";const {container}=render(<MathText text={text}/>);
    const span=container.querySelector(".math-text")!;const range=document.createRange();range.selectNodeContents(span);
    const selection=window.getSelection()!;selection.removeAllRanges();selection.addRange(range);
    const setData=vi.fn();fireEvent.copy(span,{clipboardData:{setData}});expect(setData).toHaveBeenCalledWith("text/plain",text);
    selection.removeAllRanges();
  });
});
