// @vitest-environment jsdom
import { cleanup,fireEvent,render,screen } from "@testing-library/react";
import { beforeEach,afterEach,describe,it,expect,vi } from "vitest";
import { LibraryView,activeSet } from "./LibraryView";
import { App } from "./App";
import { newCard,restoreLegacyLibrary,type Deck } from "./lib";
beforeEach(()=>{vi.stubGlobal("scrollTo",vi.fn());});
afterEach(()=>{cleanup();localStorage.clear();window.history.replaceState(null,"","/");vi.unstubAllGlobals();});
const deck=(id:string,meta:Deck["meta"]={}):Deck=>({id,title:id,subject:"",color:"#f80",cards:[newCard("Front","Back")],meta});
const actions={update:vi.fn(async()=>{}),edit:vi.fn(),duplicate:vi.fn(async()=>{}),export:vi.fn(async()=>{})};
describe("compact Library navigation",()=>{
  it("restores legacy archived sets without altering their cards, folders or Trash status",()=>{
    const legacy={...deck("Old",{folder:"Science/Cells"}),meta:{folder:"Science/Cells",archived:true}};
    const restored=restoreLegacyLibrary(legacy);
    expect(activeSet(legacy)).toBe(true);expect(restored.cards).toBe(legacy.cards);expect(restored.meta).toEqual({folder:"Science/Cells"});
    const trashed={...legacy,meta:{...legacy.meta,deletedAt:"2026-09-13T00:00:00Z"}};
    expect(activeSet(restoreLegacyLibrary(trashed))).toBe(false);
  });
  it("places Favorites in the dropdown and Trash only in the overflow menu",()=>{
    render(<LibraryView decks={[deck("Ordinary"),{...deck("Favorite"),favorite:true},deck("Deleted",{deletedAt:new Date().toISOString()})]} globalQuery="" create={()=>{}} start={()=>{}} actions={actions}/>);
    for(const name of ["All","Recent","Favorites","Archive","Archived"])expect(screen.queryByRole("button",{name})).toBeNull();
    // jsdom's role query does not model native closed-details visibility.
    // Verify Trash belongs exclusively to the collapsed Library overflow.
    const menu=screen.getByLabelText("Library menu").closest("details")!;
    expect(menu.open).toBe(false);
    expect(screen.getAllByRole("button",{name:"Trash"})).toHaveLength(1);
    expect(menu.contains(screen.getByRole("button",{name:"Trash"}))).toBe(true);
    fireEvent.click(screen.getByLabelText("Library menu"));expect(menu.open).toBe(true);
    fireEvent.keyDown(document,{key:"Escape"});expect(menu.open).toBe(false);
    expect(document.activeElement).toBe(screen.getByLabelText("Library menu"));
    fireEvent.click(screen.getByLabelText("Library menu"));
    fireEvent.pointerDown(document.body);expect(menu.open).toBe(false);
    fireEvent.change(screen.getByRole("combobox",{name:"Sort sets"}),{target:{value:"favorites"}});
    expect(screen.getByRole("button",{name:"Open Favorite"})).toBeTruthy();expect(screen.queryByRole("button",{name:"Open Ordinary"})).toBeNull();
    fireEvent.click(screen.getByLabelText("Library menu"));fireEvent.click(screen.getByRole("button",{name:"Trash"}));
    expect(screen.getByRole("heading",{name:"Trash"})).toBeTruthy();expect(screen.getByRole("button",{name:"Restore"})).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Back to Library"}));expect(screen.getByRole("button",{name:"Open Favorite"})).toBeTruthy();
  });
  it("removes the global Study now button but retains contextual study entry points",()=>{
    localStorage.setItem("flint-decks",JSON.stringify([deck("Biology")]));render(<App/>);
    expect(screen.queryByRole("button",{name:"Study now"})).toBeNull();
    expect(screen.getByRole("button",{name:"Switch to light theme"})).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Library"}));
    expect(screen.queryByRole("button",{name:"Study now"})).toBeNull();
  });
});
