import { describe, it, expect } from "vitest";
import { newCard } from "./lib";
import {
  beginLearn,
  answerLearn,
  continueWave,
  grade,
  learnProgress,
  learnComplete,
  defaultOptions,
  prepareLearnChoices,
  sides,
} from "./learn-engine";
describe("wave engine", () => {
  it.each(["Image","Audio","Video"] as const)("resolves %s → text recall before rendering, regardless of requested direction",media=>{
    const card={...newCard("","snow"),id:"snow",["question"+media]:"managed.media"};
    for(const direction of ["terms","definitions","mixed"] as const){
      const state=prepareLearnChoices(beginLearn([card],{...defaultOptions,direction,choice:false}),[card]);
      expect(state.queue).toHaveLength(1);
      const q=state.queue[0];expect(q.kind).toBe("typed");expect(sides(card,q.reverse).answer).toBe("snow");expect(q.reverse).toBe(false);
      expect(prepareLearnChoices(JSON.parse(JSON.stringify(state)),[card])).toEqual(state);
    }
  });
  it("substitutes objective recognition for media-only recall and preserves mixed text answers",()=>{
    const a={...newCard("",""),id:"a",questionVideo:"prompt.mp4",answerImage:"a.gif"};
    const b={...newCard("",""),id:"b",questionAudio:"prompt.mp3",answerVideo:"b.mp4"};
    const state=prepareLearnChoices(beginLearn([a,b],{...defaultOptions,choice:false,direction:"definitions"}),[a,b]);
    expect(state.queue.every(q=>q.kind==="choice"&&q.choices?.length===2)).toBe(true);
    const mixed={...a,answer:"snow"};
    const recall=prepareLearnChoices(beginLearn([mixed],{...defaultOptions,choice:false,direction:"definitions"}),[mixed]);
    expect(recall.queue[0].kind).toBe("typed");expect(sides(mixed,recall.queue[0].reverse).answer).toBe("snow");
  });
  it("does not treat different numbers or short answers as spelling mistakes", () => {
    expect(grade("Term 2", "Term 1")).toBe("INCORRECT");
    expect(grade("ADP", "ATP")).toBe("INCORRECT");
  });
  const cards = Array.from({ length: 12 }, (_, i) => ({
    ...newCard("Term " + i, "Answer " + i),
    id: String(i),
  }));
  it("introduces four concepts as MC then recalls those same four before introducing E", () => {
    let state = beginLearn(cards);
    expect(state.queue.map((q) => q.cardId + ":" + q.kind)).toEqual([
      "0:choice",
      "1:choice",
      "2:choice",
      "3:choice",
      "0:typed",
      "1:typed",
      "2:typed",
      "3:typed",
    ]);
    for (let i = 0; i < 8; i++) state = answerLearn(state, true);
    expect(state.checkpoint).toBe(true);
    expect(learnProgress(state)).toBe(33);
    state = continueWave(state);
    expect(state.queue[0]).toMatchObject({ cardId: "4", kind: "choice" });
  });
  it("finishes normal learning before reinforcing missed targets without mastered peers", () => {
    let state = beginLearn(cards);
    for (let i = 0; i < 8; i++) state = answerLearn(state, i !== 5);
    expect(state.mastery["1"]).toBe("Learning");
    state = continueWave(state);
    expect(state.queue[0].cardId).toBe("4");
    while(state.introduced < cards.length || state.queue.length) {
      state=state.queue.length?answerLearn(state,true):continueWave(state);
    }
    state=continueWave(state);
    expect(state.phase).toBe("weak");
    expect(state.queue.map((q) => q.cardId + ":" + q.kind)).toEqual([
      "1:choice",
      "1:typed",
    ]);
    state = answerLearn(answerLearn(state, true), true);
    state = continueWave(state);
    expect(learnComplete(state)).toBe(true);
  });
  it("does not reinforce perfect sessions and persists all three bounded weak sections", () => {
    let perfect=beginLearn(cards);
    for(let i=0;i<100 && !learnComplete(perfect);i++)perfect=perfect.queue.length?answerLearn(perfect,true):continueWave(perfect);
    expect(learnComplete(perfect)).toBe(true);
    expect(perfect.reinforcement).toBeUndefined();
    let state=beginLearn(cards.slice(0,2));
    const sections=new Set<number>();
    for(let i=0;i<100 && !learnComplete(state);i++) {
      if(state.reinforcement)sections.add(state.reinforcement.section);
      const restored=JSON.parse(JSON.stringify(state));
      const next=(value:typeof state)=>value.queue.length?answerLearn(value,false):continueWave(value);
      expect(next(restored)).toEqual(next(state));
      state=next(state);
    }
    expect([...sections]).toEqual([1,2,3]);
    expect(learnComplete(state)).toBe(true);
    expect(Object.values(state.mastery)).not.toContain("Mastered");
  });
  it("honors question-type preferences and keeps legacy pending queues intact", () => {
    expect(beginLearn(cards,{...defaultOptions,choice:false}).queue.every(q=>q.kind==="typed")).toBe(true);
    expect(beginLearn(cards,{...defaultOptions,typed:false}).queue.every(q=>q.kind==="choice")).toBe(true);
    let legacy=beginLearn(cards,{...defaultOptions,reinforcement:false});
    for(let i=0;i<8;i++)legacy=answerLearn(legacy,i!==5);
    expect(continueWave(legacy).queue.map(q=>q.cardId)).toEqual(["1","1"]);
  });
  it("serializes exact pending queue, progress and mastery across exit/reopen", () => {
    let state = beginLearn(cards);
    state = answerLearn(state, true);
    state = answerLearn(state, false);
    const restored = JSON.parse(JSON.stringify(state));
    expect(restored).toEqual(state);
    expect(answerLearn(restored, true)).toEqual(answerLearn(state, true));
  });
  it("progress depends on mastery and a recognition answer does not graduate a concept", () => {
    const state = answerLearn(beginLearn(cards), true);
    expect(state.mastery["0"]).toBe("Familiar");
    expect(learnProgress(state)).toBe(4);
  });
  it("distinguishes correct, close and wrong while accepting case punctuation and hyphens", () => {
    expect(grade(" CELL-membrane! ", "cell membrane")).toBe("CORRECT");
    expect(grade("mitochndria", "mitochondria")).toBe("CLOSE");
    expect(grade("ribosome", "mitochondria")).toBe("INCORRECT");
    expect(grade("ATP", "atp", "strict")).toBe("INCORRECT");
  });
});
