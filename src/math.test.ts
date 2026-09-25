import { describe,it,expect } from "vitest";
import { mathRuns,canonicalMath,hasMath } from "./math";
describe("general inline math",()=>{
  it.each(["1/2","x/y","kx/ky","x²/y²","(x+1)/(x-1)"])("recognizes mathematical fraction %s",text=>expect(hasMath(text)).toBe(true));
  it.each(["big/bigger","yes/no","km/h","yes/no i'm cool","Read yes/no then evaluate 1/2"])("preserves slash prose in %s",text=>{
    const runs=mathRuns(text);expect(runs.map(r=>r.source).join("")).toBe(text);
    expect(runs.filter(r=>r.node).map(r=>r.source)).toEqual(text.endsWith("1/2")?["1/2"]:[]);
  });
  it.each(["x^27","x^142","x^-2","x^0.5","x^(n+1)","2^(x+3)","e^(i*pi)","x^(1/2)","x_27","a_(n+1)","3/17","(x+1)/(x-2)","(a+b+c)/(2x)","(a/b)/(c/d)","sqrt(x+2)","|x|","x != 2"])("parses %s as structured math",text=>{
    const runs=mathRuns(text);expect(runs).toHaveLength(1);expect(runs[0].source).toBe(text);expect(runs[0].node).toBeTruthy();
  });
  it("retains mixed prose without turning a field into an equation",()=>{
    const text="Use (x+1)/(x-2) when x != 2.";
    const runs=mathRuns(text);expect(runs.map(r=>r.source).join("")).toBe(text);expect(runs.filter(r=>r.node)).toHaveLength(2);
    expect(hasMath("Folder names and ordinary text")).toBe(false);
  });
  it("normalizes representation rather than claiming algebraic equivalence",()=>{
    expect(canonicalMath("x ≤ 2")).toBe(canonicalMath("x <= 2"));
    expect(canonicalMath("x^27")).toBe(canonicalMath("x^(27)"));
    expect(canonicalMath("1/2")).not.toBe(canonicalMath("12"));
    expect(canonicalMath("(x+1)/(x-2)")).not.toBe(canonicalMath("(x-1)/(x+2)"));
  });
});
