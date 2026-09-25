// @vitest-environment jsdom
import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StructuredView } from "./StructuredView";
import {
  createGrid,
  pasteGrid,
  structuredTargets,
  type ImageOcclusion,
} from "./structured";

vi.mock("./native", () => ({ mediaUrl: async (name: string) => name }));
afterEach(cleanup);
const grid = pasteGrid(
  createGrid(3, 2),
  "Element\tSymbol\nHydrogen\tH\nCarbon\tC",
  0,
  0,
);
const region: ImageOcclusion = {
  version: 1,
  type: "occlusion",
  title: "Cell",
  image: "data:image/png;base64,test",
  regions: [
    {
      id: "nucleus",
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.2,
      answer: "Nucleus",
    },
  ],
};

describe("answer in context", () => {
  it("answers callouts with keyboard-accessible math choices and locks only after Check", async () => {
    const user = userEvent.setup(), change = vi.fn();
    const value:ImageOcclusion = {...region,regions:[{...region.regions[0],answer:"x^2"},{...region.regions[0],id:"other",answer:"1/2",x:.6}]};
    const {rerender,container} = render(<StructuredView value={value} mode="choice" targetIds={["nucleus"]} onAnswer={change}/>);
    const control = await screen.findByRole("combobox",{name:"Region 1 answer"});
    await user.click(control);
    expect(screen.getByRole("listbox").querySelectorAll("math")).toHaveLength(2);
    await user.keyboard("{Home}{Enter}");
    expect(change).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("button",{name:/Move anchor/})).toBeNull();
    expect(container.querySelectorAll(".occlusion-leader")).toHaveLength(2);
    rerender(<StructuredView value={value} mode="choice" targetIds={["nucleus"]} answers={{nucleus:"1/2"}} results={{nucleus:false}} onAnswer={change}/>);
    expect((screen.getByRole("combobox") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("Correct answer:");
    expect(screen.getByRole("img",{name:"Incorrect"})).toBeTruthy();
  });
  it("reference tables remain complete even when targets are supplied", () => {
    render(
      <StructuredView
        value={grid}
        mode="reference"
        targetIds={structuredTargets(grid).map((t) => t.id)}
      />,
    );
    expect(screen.getByText("H")).toBeTruthy();
    expect(screen.getByText("C")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
  });
  it("places recognition directly in the selected cell, without premature feedback", () => {
    const target = structuredTargets(grid)[0],
      change = vi.fn();
    render(
      <StructuredView
        value={grid}
        mode="choice"
        targetIds={[target.id]}
        onAnswer={change}
      />,
    );
    const select = screen.getByRole("combobox", {
      name: "Hydrogen · Symbol answer",
    });
    expect(select.closest("td")).toBeTruthy();
    fireEvent.click(select);
    expect(screen.getByRole("listbox").style.maxHeight).toBeTruthy();
    expect(screen.getByRole("listbox").style.left).toBeTruthy();
    expect(within(screen.getByRole("listbox")).getAllByRole("option")).toHaveLength(2);
    fireEvent.click(screen.getByRole("option",{name:"C"}));
    expect(change).toHaveBeenCalledWith(target.id, "C");
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("supports Tab between missing cells and Enter submission", async () => {
    const user = userEvent.setup(),
      submit = vi.fn(),
      ids = structuredTargets(grid).map((t) => t.id);
    function Harness() {
      const [answers, setAnswers] = useState({});
      return (
        <StructuredView
          value={grid}
          mode="typed"
          targetIds={ids}
          answers={answers}
          onAnswer={(id, text) => setAnswers((old) => ({ ...old, [id]: text }))}
          onSubmit={submit}
        />
      );
    }
    render(<Harness />);
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Hydrogen · Symbol answer" }),
    );
    await user.keyboard("H");
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Carbon · Symbol answer" }),
    );
    await user.keyboard("C{Enter}");
    expect(submit).toHaveBeenCalledOnce();
  });
  it("covers the selected image rectangle with a typed control and reveals only after results", async () => {
    const { rerender } = render(
      <StructuredView
        value={region}
        mode="typed"
        targetIds={["nucleus"]}
        answers={{ nucleus: "Cell" }}
      />,
    );
    const input = await screen.findByRole("textbox", {
      name: "Region 1 answer",
    });
    expect(input.closest(".hidden-region")).toBeTruthy();
    expect(input.getAttribute("value")).toBe("Cell");
    expect(screen.queryByText(/Correct answer/)).toBeNull();
    expect(
      input.closest(".structured-region")?.getAttribute("style"),
    ).toContain("left: 33%");
    rerender(
      <StructuredView
        value={region}
        mode="typed"
        targetIds={["nucleus"]}
        answers={{ nucleus: "Cell" }}
        results={{ nucleus: false }}
      />,
    );
    expect(screen.getByRole("status").textContent).toBe(
      " Correct answer: Nucleus",
    );
    expect(
      screen.getByRole("status").closest(".structured-region"),
    ).toBeTruthy();
  });
  it("shows the full image and label together in reference mode", async () => {
    render(<StructuredView value={region} mode="reference" />);
    expect(await screen.findByText("Nucleus")).toBeTruthy();
    expect(screen.getByRole("img")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.querySelector(".hidden-region")).toBeNull();
  });
});
