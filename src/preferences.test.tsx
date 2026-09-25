// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,act} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {MotionPage} from "./motion";
import {EditorPreferences} from "./EditorPreferences";
import {SmartMathInput,SmartMathTextarea} from "./SmartMathField";
import {readPreference,writePreference} from "./preferences";
afterEach(()=>{cleanup();localStorage.clear();});
it("persists editor preferences and updates mounted fields without rewriting canonical text",()=>{
  const {container}=render(<><EditorPreferences/><SmartMathInput aria-label="Formula" value="x^2" readOnly/><SmartMathTextarea aria-label="Suggested answer" value="" readOnly suggestion="x = 1"/></>);
  expect(container.querySelector("msup")).toBeTruthy();
  expect(container.querySelector(".math-autofill-ghost")).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox",{name:/Live Smart Math/}));
  expect(container.querySelector("msup")).toBeNull();
  expect((screen.getByLabelText("Formula") as HTMLInputElement).value).toBe("x^2");
  fireEvent.click(screen.getByRole("checkbox",{name:/Local answer suggestions/}));
  expect(container.querySelector(".math-autofill-ghost")).toBeNull();
  cleanup();render(<SmartMathInput aria-label="Reopened formula" value="x^2" readOnly/>);
  expect(document.querySelector("msup")).toBeNull();
  act(()=>writePreference("live-math",true));
  expect(document.querySelector("msup")).toBeTruthy();
});
it("ignores corrupt or wrongly typed preferences",()=>{
  localStorage.setItem("flint-pref-live-math","broken");expect(readPreference("live-math",true)).toBe(true);
  localStorage.setItem("flint-pref-study-size",'"large"');expect(readPreference("study-size",100)).toBe(100);
});
it("does not scroll Settings to the top when accessibility preferences change",()=>{
  const scroll=vi.spyOn(window,"scrollTo").mockImplementation(()=>{});
  const view=render(<MotionPage route="Settings"><p>Accessibility</p></MotionPage>);
  scroll.mockClear();
  act(()=>writePreference("reduced-motion",true));
  act(()=>writePreference("high-contrast",true));
  expect(scroll).not.toHaveBeenCalled();
  view.rerender(<MotionPage route="Library"><p>Library</p></MotionPage>);
  expect(scroll).toHaveBeenCalledOnce();
  scroll.mockRestore();
});
