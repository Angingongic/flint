// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TableEditor } from "./TableEditor";
import { OcclusionEditor } from "./OcclusionEditor";
import {
  createGrid,
  createOcclusion,
  pasteGrid,
  type ImageOcclusion,
} from "./structured";

vi.mock("./native", () => ({
  mediaUrl: async (name: string) => name,
  saveMediaBytes: vi.fn(async () => "original.png"),
}));
afterEach(cleanup);

describe("structured editors", () => {
  it("hides canonical source even when a math cell has an authored text color", () => {
    const grid = pasteGrid(createGrid(2,2),"Name\tValue\nArea\tx^2",0,0);
    const key = grid.rows[1].id+":"+grid.columns[1].id;
    grid.formats = {[key]:{color:"#ff9900"}};
    render(<TableEditor value={grid} onChange={()=>{}}/>);
    const cell = screen.getByRole("textbox",{name:"Row 2, column 2"}) as HTMLInputElement;
    expect(cell.value).toBe("x^2");
    expect(cell.style.color).toBe("transparent");
    expect(cell.parentElement?.querySelector("math")).toBeTruthy();
    fireEvent.pointerDown(cell);
    expect(cell.style.color).toBe("rgb(255, 153, 0)");
  });
  it("moves callout labels and anchors without saving pointer moves and rolls back cancellation", async () => {
    const OriginalPointer = window.PointerEvent;
    window.PointerEvent = MouseEvent as typeof PointerEvent;
    const save = vi.fn();
    const card: ImageOcclusion = {...createOcclusion(),image:"original.png",regions:[{id:"r",answer:"Nucleus",x:.1,y:.2,width:.22,height:.08,anchor:{x:.5,y:.5}}]};
    const {container} = render(<OcclusionEditor value={card} onChange={save}/>);
    const label = await screen.findByRole("button",{name:"Edit region 1"});
    const canvas = container.querySelector(".occlusion-canvas") as HTMLDivElement;
    canvas.setPointerCapture = vi.fn();
    vi.spyOn(canvas,"getBoundingClientRect").mockReturnValue({left:0,top:0,width:1000,height:500} as DOMRect);
    try {
      fireEvent.pointerDown(label,{clientX:100,clientY:100});
      fireEvent.pointerMove(canvas,{clientX:200,clientY:150});
      expect(save).not.toHaveBeenCalled();
      expect(label.style.left).toBe("20%");
      fireEvent.pointerCancel(canvas);
      expect(label.style.left).toBe("10%");
      expect(save).not.toHaveBeenCalled();
      fireEvent.pointerDown(label,{clientX:100,clientY:100});
      fireEvent.pointerMove(canvas,{clientX:200,clientY:150});
      fireEvent.pointerUp(canvas);
      expect(save).toHaveBeenCalledTimes(1);
      expect(save.mock.calls[0][0].regions[0]).toMatchObject({x:.2,anchor:{x:.5,y:.5}});
      save.mockClear();
      const anchor = screen.getByRole("button",{name:"Move anchor 1"});
      fireEvent.pointerDown(anchor,{clientX:500,clientY:250});
      fireEvent.pointerMove(canvas,{clientX:700,clientY:200});
      expect(save).not.toHaveBeenCalled();
      fireEvent.pointerUp(canvas);
      expect(save).toHaveBeenCalledTimes(1);
      expect(save.mock.calls[0][0].regions[0]).toMatchObject({x:.1,y:.2,anchor:{x:.7,y:.4}});
    } finally { window.PointerEvent = OriginalPointer; }
  });
  it("toggles selected-text formatting without formatting the whole cell", () => {
    function Harness() {
      const [grid, setGrid] = useState(
        pasteGrid(createGrid(2, 2), "Name\tValue\nExample\tAnswer", 0, 0),
      );
      return <TableEditor value={grid} onChange={setGrid} />;
    }
    render(<Harness />);
    const cell = screen.getByRole("textbox", {
      name: "Row 2, column 2",
    }) as HTMLInputElement;
    fireEvent.focus(cell);
    cell.setSelectionRange(0, 3);
    fireEvent.select(cell);
    const bold = screen.getByRole("button", { name: "Bold" });
    fireEvent.click(bold);
    expect(bold.getAttribute("aria-pressed")).toBe("true");
    expect(cell.style.fontWeight).toBe("");
    fireEvent.click(bold);
    expect(bold.getAttribute("aria-pressed")).toBe("false");
  });
  it("keeps dimension drag temporary, rolls back cancellation, and commits only on drop", () => {
    const OriginalPointer = window.PointerEvent;
    window.PointerEvent = MouseEvent as typeof PointerEvent;
    const save = vi.fn();
    const { container } = render(
      <TableEditor value={createGrid(2, 2)} onChange={save} />,
    );
    const handle = screen.getByRole("button", { name: "Column 1 width" });
    handle.setPointerCapture = vi.fn();
    try {
      fireEvent.pointerDown(handle, { clientX: 100 });
      fireEvent.pointerMove(handle, { clientX: 140 });
      expect(save).not.toHaveBeenCalled();
      expect(container.querySelectorAll("col")[1].style.width).toBe("200px");
      fireEvent.pointerCancel(handle);
      expect(save).not.toHaveBeenCalled();
      expect(container.querySelectorAll("col")[1].style.width).toBe("160px");
      fireEvent.pointerDown(handle, { clientX: 100 });
      fireEvent.pointerMove(handle, { clientX: 130 });
      fireEvent.pointerUp(handle);
      expect(save).toHaveBeenCalledTimes(1);
      expect(save.mock.calls[0][0].columns[0].size).toBe(190);
    } finally {
      window.PointerEvent = OriginalPointer;
    }
  });
  it("applies a range format as one undo step and supports redo", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [grid, setGrid] = useState(
        pasteGrid(createGrid(2, 2), "Name\tValue\nExample\tAnswer", 0, 0),
      );
      return <TableEditor value={grid} onChange={setGrid} />;
    }
    render(<Harness />);
    const left = screen.getByRole("textbox", { name: "Row 2, column 1" });
    const right = screen.getByRole("textbox", { name: "Row 2, column 2" });
    await user.click(left);
    await user.keyboard("{Shift>}{ArrowRight}{/Shift}");
    await user.click(screen.getByRole("button", { name: "Bold" }));
    expect(left.style.fontWeight).toBe("700");
    expect(right.style.fontWeight).toBe("700");
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(left.style.fontWeight).toBe("");
    expect(right.style.fontWeight).toBe("");
    await user.click(screen.getByRole("button", { name: "Redo" }));
    expect(left.style.fontWeight).toBe("700");
    expect(right.style.fontWeight).toBe("700");
  });
  it("pastes a grid and edits individual cells, retaining headers", () => {
    function Harness() {
      const [grid, setGrid] = useState(createGrid(2, 2));
      return <TableEditor value={grid} onChange={setGrid} />;
    }
    render(<Harness />);
    fireEvent.paste(screen.getByRole("textbox", { name: "Row 1, column 1" }), {
      clipboardData: { getData: () => "Name\tSymbol\nHydrogen\tH\nCarbon\tC" },
    });
    fireEvent.click(screen.getByText("Table options"));
    expect(
      screen.getByLabelText("Rows").textContent,
    ).toBe("3");
    const cell = screen.getByRole("textbox", {
      name: "Row 3, column 2",
    }) as HTMLInputElement;
    expect(cell.value).toBe("C");
    fireEvent.change(cell, { target: { value: "Carbon symbol" } });
    expect(cell.value).toBe("Carbon symbol");
    expect(
      (screen.getByRole("checkbox", { name: "Header row" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });
  it("clears a keyboard-selected range and supports keyboard column resizing", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [grid, setGrid] = useState(
        pasteGrid(createGrid(2, 2), "Name\tSymbol\nHydrogen\tH", 0, 0),
      );
      return <TableEditor value={grid} onChange={setGrid} />;
    }
    render(<Harness />);
    const first = screen.getByRole("textbox", {
      name: "Row 2, column 1",
    }) as HTMLInputElement;
    await user.click(first);
    await user.keyboard("{Shift>}{ArrowRight}{/Shift}{Delete}");
    expect(first.value).toBe("");
    expect(
      (
        screen.getByRole("textbox", {
          name: "Row 2, column 2",
        }) as HTMLInputElement
      ).value,
    ).toBe("");
    expect(
      (
        screen.getByRole("textbox", {
          name: "Row 1, column 1",
        }) as HTMLInputElement
      ).value,
    ).toBe("Name");
    const handle = screen.getByRole("button", { name: "Column 1 width" });
    handle.focus();
    await user.keyboard("{ArrowRight}");
    expect(handle.title).toContain("168px");
  });
  it("edits region answers and geometry with the keyboard without modifying source image", async () => {
    const user = userEvent.setup();
    let saved: ImageOcclusion;
    function Harness() {
      const [card, setCard] = useState({
        ...createOcclusion(),
        image: "original.png",
      });
      saved = card;
      return <OcclusionEditor value={card} onChange={setCard} />;
    }
    render(<Harness />);
    await user.click(
      screen.getByRole("button", { name: "Add centered callout" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Region answer" }),
      "Nucleus",
    );
    const region = await screen.findByRole("button", { name: "Edit region 1" });
    region.focus();
    await user.keyboard("{ArrowRight}{Shift>}{ArrowDown}{/Shift}");
    expect(saved!.regions[0].x).toBeCloseTo(.21);
    expect(saved!.regions[0]).toMatchObject({ answer: "Nucleus", anchor: {x:.5,y:.5} });
    expect(saved!.regions[0].height).toBeCloseTo(.09);
    screen.getByRole("button", {name:"Move anchor 1"}).focus();
    await user.keyboard("{ArrowRight}");
    expect(saved!.regions[0].anchor).toEqual({x:.51,y:.5});
    expect(saved!.regions[0].x).toBeCloseTo(.21);
    expect(saved!.image).toBe("original.png");
    fireEvent.change(screen.getByLabelText("Label color"),{target:{value:"#ff55aa"}});
    expect(saved!.regions[0].color).toBe("#ff55aa");
    fireEvent.change(screen.getByLabelText("Connector attachment"),{target:{value:"bottom"}});
    expect(saved!.regions[0].socket).toBe("bottom");
    await user.click(screen.getByRole("button",{name:"Undo"}));
    expect(saved!.regions[0].socket).toBe("right");
    await user.click(screen.getByRole("button",{name:"Redo"}));
    expect(saved!.regions[0].socket).toBe("bottom");
    await user.click(screen.getByRole("button", { name: "Delete region" }));
    expect(saved!.regions).toHaveLength(0);
  });
});
