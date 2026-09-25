import { describe, it, expect } from "vitest";
import { mathSuggestion, symbolicMath } from "./math-autofill";
describe("bounded deterministic local math",()=>{
  it("presents a reduced rational fraction while retaining cancelled domain restrictions",()=>{
    const result=symbolicMath("(x^2-1)/(x^2-3x+2)");
    expect(result?.source).toBe("(x+1)/(x-2), x ≠ 1, 2");
    expect(result?.exclusions).toEqual([{variable:"x",values:["1","2"]}]);
  });
  it.each([
    ["6x + 4 = 10","x = 1"], ["2(x+4)=18","x = 5"],
    ["x^2=16","x = ±4"], ["x^2-2x+1=0","x = 1"],
    ["x^3-x=0","x = -1, 0, 1"], ["1/2+1/3","5/6"],
    ["0.1+0.2","3/10"], ["6^2","36"], ["sqrt(81)","9"],
    ["2x+3x","5x"], ["2x=1","x = 1/2"], ["2^-3","1/8"],
    ["-2^2","-4"], ["(-2)^2","4"], ["√(49)","7"],
    ["sqrt(72)","6sqrt(2)"], ["x² = 12","x = ±2sqrt(3)"],
    ["x² - 2 = 0","x = ±sqrt(2)"], ["x² + 5x + 6 = 0","x = -3, -2"],
    ["3x⁴ - 10x² + 3 = 0","x = ±sqrt(3)/3, ±sqrt(3)"],
    ["2x²+2x-1=0","x = -1/2 ± sqrt(3)/2"],
    ["√16","4"], ["√72","6sqrt(2)"], ["√50 + √8","7sqrt(2)"], ["6/8","3/4"], ["x² = 9","x = ±3"],
  ])("solves %s exactly",(source,result)=>expect(mathSuggestion(source)).toBe(result));
  it.each(["Explain 6^2","x+y=2","1/0","6x +","x=x","x^2=-1","2^9999","hello","sin(x)","x^5=3"])("abstains for %s",source=>expect(mathSuggestion(source)).toBeNull());
  it.each([
    ["(x^2-9)/(x-3)","x+3, x ≠ 3"],
    ["(x^2-4)/(x-2)","x+2, x ≠ 2"],
    ["(x^2-1)/(x^2-1)","1, x ≠ -1, 1"],
    ["x/x","1, x ≠ 0"],
    ["sqrt(x^2)","|x|"],["sqrt(9x^2)","3|x|"],
    ["sqrt((x-2)^2)","|x-2|"],["sqrt(x^4)","x^2"],
    ["(x+3)(x-3)","x^2-9"],["(x+2)(x+5)","x^2+7x+10"],
    ["(x-4)^2","x^2-8x+16"],["(2x+3)(x-1)","2x^2+x-3"],
  ])("preserves real domain and useful transformations for %s",(input,answer)=>expect(mathSuggestion(input)).toBe(answer));
  it("records original denominator restrictions structurally",()=>{
    expect(symbolicMath("(x^2-1)/(x^2-1)")?.exclusions).toEqual([{variable:"x",values:["-1","1"]}]);
  });
  it.each(["x^2+6x+32","x^2+3x+2","sqrt(x)","sqrt(x^2+1)","sqrt(-x^2)","sqrt(-9x^2)"])("does not offer pointless regrouping or unsupported domains for %s",input=>expect(mathSuggestion(input)).toBeNull());
  it.each(["(x^2-1)/(x-1)=2","sqrt(x)=x-2","sqrt(-4)","0^0","x^4+x=1"])("never hides domain restrictions or approximates unsupported %s",source=>expect(mathSuggestion(source)).toBeNull());
  it("exposes exact LaTeX independently from editor recognition",()=>{
    expect(symbolicMath("6/8")).toMatchObject({source:"3/4",latex:"\\frac{3}{4}",kind:"simplify",domain:"real"});
  });
});
