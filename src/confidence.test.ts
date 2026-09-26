import {describe,it,expect} from "vitest";
import {confidenceGrade} from "./confidence";
import {answerLearn,beginLearn,continueWave} from "./learn-engine";
import type {Card} from "./lib";
describe("confidence evidence",()=>{
  it.each([["mitochondria","the mitochondria"],["biblioteca","la biblioteca"],["the mitochondria","mitochondria"],["mitochondria produces ATP","The mitochondria produces ATP"]])("accepts peripheral articles: %s",(a,b)=>expect(confidenceGrade(a,b).accuracy).toBeGreaterThanOrEqual(.9));
  it.each([["Who","The Who"],["la biblioteca","el biblioteca"],["","el"],["mitochondria","The mitochondria produces ATP"],["photosynthesis","cellular respiration"],["12","13"],["is active","is not active"],["x+2","x-2"],["cafe","café"]])("rejects missing or changed meaning: %s",(a,b)=>expect(confidenceGrade(a,b).accuracy).toBeLessThan(.6));
  it("accepts an incomplete near-match without claiming mastery",()=>{
    const e=confidenceGrade("respiration cellular","cellular respiration");
    expect(e.result).toBe("accepted");expect(e.needsReview).toBe(true);
    let state=beginLearn([{id:"one"} as Card],{waveSize:4,direction:"terms",grading:"normal",choice:false,reinforcement:true,confidence:true});
    state=answerLearn(state,true,"respiration cellular",e);
    expect(state.mastery.one).toBe("Familiar");
    expect(JSON.parse(JSON.stringify(state)).answers[0].evidence).toEqual(e);
    expect(continueWave(state).phase).toBe("weak");
  });
  it("preserves strict and accent settings",()=>{
    expect(confidenceGrade("biblioteca","la biblioteca",true).result).toBe("incorrect");
    expect(confidenceGrade("cafe","café",false,true).accuracy).toBe(1);
  });
});
