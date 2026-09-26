import { Card, gradeAnswer } from "./lib";
import { confidenceGrade } from "./confidence";
import type { AnswerEvidence } from "./confidence";

export type Question = {
  cardId: string;
  kind: "choice" | "typed";
  reverse: boolean;
  choices?: string[];
  /** Semantics are resolved before persistence, not inferred by the renderer. */
  resolved?: boolean;
  targetGroup?: string[];
};
export type Mastery = "New" | "Learning" | "Familiar" | "Mastered";
export type LearnOptions = {
  waveSize: number;
  direction: "terms" | "definitions" | "mixed";
  grading: "normal" | "strict" | "lenient";
  choice?: boolean;
  typed?: boolean;
  reinforcement?: boolean;
  confidence?: boolean;
};
export type WaveState = {
  version: 1;
  ids: string[];
  options: LearnOptions;
  introduced: number;
  wave: string[];
  queue: Question[];
  mastery: Record<string, Mastery>;
  mistakes: Record<string, number>;
  checkpoint: boolean;
  rounds: number;
  didntKnow?: Record<string, number>;
  phase?: "learning" | "weak" | "complete";
  reinforcement?: { section:number; total:number; ids:string[]; failed:string[] };
  reviewNeeded?: Record<string,boolean>;
  answers?: { question:Question; input:string; outcome:boolean | "DIDNT_KNOW"; section:number; evidence?:AnswerEvidence }[];
};
export const defaultOptions: LearnOptions = {
  waveSize: 4,
  direction: "terms",
  grading: "normal",
  reinforcement: true,
};
/** Deterministic progressive phase size. Zero means automatic sizing. */
export function phaseSize(total:number):number {
  if(total<=0)return 1;if(total<=2)return total;if(total<=5)return 2;if(total<=10)return 3;
  if(total<=15)return 4;if(total<=30)return 6;if(total<=48)return 8;if(total<=75)return 10;
  if(total<=100)return 12;return 15;
}
export function phaseCount(total:number,size=phaseSize(total)){return Math.max(1,Math.ceil(total/Math.max(1,size)));}
export function phaseProgress(state:WaveState,kind:'choice'|'typed') {
  const size=state.options.waveSize>0?state.options.waveSize:phaseSize(state.ids.length);
  const phases=phaseCount(state.ids.length,size),answered=state.answers?.filter(a=>a.question.kind===kind).length||0;
  return {size,phases,current:Math.min(phases,Math.floor(answered/Math.max(1,size))+1),answeredInPhase:answered%Math.max(1,size),segments:Array.from({length:phases},(_,i)=>Math.max(0,Math.min(1,(answered-i*size)/size)))};
}
export function waveQuestions(
  ids: string[],
  options: LearnOptions,
  round: number,
): Question[] {
  const make = (kind: Question["kind"]) =>
    ids.map((cardId, index) => ({
      cardId,
      kind,
      reverse:
        options.direction === "terms" ||
        (options.direction === "mixed" && (index + round) % 2 === 0),
    }));
  // A malformed preference cannot generate an empty session.
  return [...(options.choice !== false ? make("choice") : []), ...(options.typed !== false || options.choice === false ? make("typed") : [])];
}
import { structuredTargets, structuredUnitId, parseStructuredUnit, type Target } from "./structured";
export function structuredLearnGroup(card: Card, state: WaveState): Target[] {
  if(!card.structure)return [];
  const first=state.queue[0], all=structuredTargets(card.structure), firstId=parseStructuredUnit(first?.cardId || "")?.[1];
  if(first?.targetGroup)return first.targetGroup.flatMap(id=>{const target=all.find(t=>t.id===id);return target?[target]:[];});
  const eligible=new Set(state.queue.filter(q=>q.kind===first?.kind && parseStructuredUnit(q.cardId)?.[0]===card.id).map(q=>parseStructuredUnit(q.cardId)![1]));
  const head=all.find(t=>t.id===firstId);if(!head)return [];
  if(card.structure.type!=="table")return [head];
  const value=card.structure, selected:Target[]=[];
  const wanted=Math.max(1,Math.round(all.length*.45));
  // The persisted queue determines the mask, so resuming cannot change the question.
  const queued=state.queue.map(q=>all.find(t=>structuredUnitId(card.id,t.id)===q.cardId)).filter((t):t is Target=>!!t && t.id!==head.id && eligible.has(t.id));
  for(const target of [head,...queued.filter((t,i)=>queued.findIndex(other=>other.id===t.id)===i)]) {
    const populated=value.columns.filter(c=>value.cells[`${target.row}:${c.id}`]?.trim()).length;
    if(selected.filter(t=>t.row===target.row).length>=populated-1)continue;
    selected.push(target);if(selected.length>=wanted)break;
  }
  return selected;
}
export function answerLearnGroup(state: WaveState, outcomes: Record<string,boolean | "DIDNT_KNOW">, evidence:Record<string,AnswerEvidence>={}, inputs:Record<string,string>={}): WaveState {
  const kind=state.queue[0]?.kind;
  const selected=state.queue.filter(q=>q.kind===kind && Object.hasOwn(outcomes,q.cardId));
  let next={...state,queue:[...selected,...state.queue.filter(q=>!selected.includes(q))]};
  for(const question of selected)next=answerLearn(next,outcomes[question.cardId],inputs[question.cardId]||"",evidence[question.cardId]);
  return next;
}
export function learnIds(cards: Card[]) {
  return cards.flatMap(card => card.structure ? structuredTargets(card.structure).map(target => structuredUnitId(card.id,target.id)) : [card.id]);
}
export function beginLearn(cards: Card[], options = defaultOptions): WaveState {
  const ids = learnIds(cards),
    waveSize = options.waveSize>0?options.waveSize:phaseSize(ids.length),
    wave = ids.slice(0, waveSize);
  return {
    version: 1,
    ids,
    options,
    introduced: wave.length,
    wave,
    queue: waveQuestions(wave, options, 0),
    mastery: Object.fromEntries(ids.map((id) => [id, "New"])),
    mistakes: {},
    checkpoint: false,
    rounds: 0,
    ...(options.reinforcement ? {phase:"learning" as const} : {}),
  };
}
export function shuffleLearn(state: WaveState): WaveState {
  return {...state, ids:[...state.ids.slice(0,state.introduced),...shuffle(state.ids.slice(state.introduced))], queue:[...shuffle(state.queue.filter(q=>q.kind==="choice")),...shuffle(state.queue.filter(q=>q.kind==="typed"))]};
}
/** Generate once before saving, never when rendering/resuming a question. */
export function prepareLearnChoices(state:WaveState,cards:Card[]):WaveState {
  const semanticQueue=state.queue.map(question=>{
    if(question.resolved)return question;
    const unit=parseStructuredUnit(question.cardId);
    if(unit){const card=cards.find(c=>c.id===unit[0]);return card?.structure?.type==="occlusion"?{...question,kind:"choice" as const,resolved:true}:question;}
    const card=cards.find(c=>c.id===question.cardId);if(!card)return question;
    let next={...question,resolved:true};
    if(next.kind==="typed"&&!sides(card,next.reverse).answer.trim()){
      if(sides(card,!next.reverse).answer.trim())next.reverse=!next.reverse;
      else {
        const answer=sides(card,next.reverse);
        const key=(s:ReturnType<typeof sides>)=>JSON.stringify([s.answer,s.answerImage,s.answerAudio,s.answerVideo]);
        const canRecognize=cards.some(other=>!other.structure&&other.id!==card.id&&key(sides(other,next.reverse))!==key(answer));
        if(canRecognize)next.kind="choice";
      }
    }
    return next;
  });
  const uniqueQueue=semanticQueue.filter((q,index,all)=>!parseStructuredUnit(q.cardId)||all.findIndex(other=>other.cardId===q.cardId&&other.kind===q.kind)===index);
  const grouped=new Map<string,string[]>();
  const structuredQueue=uniqueQueue.map(question=>{
    const unit=parseStructuredUnit(question.cardId);
    if(!unit||question.targetGroup)return question;
    const key=question.kind+":"+question.cardId;
    if(grouped.has(key))return {...question,targetGroup:grouped.get(key)};
    const candidates=uniqueQueue.filter(q=>q.kind===question.kind&&!q.targetGroup&&!grouped.has(q.kind+":"+q.cardId)&&parseStructuredUnit(q.cardId)?.[0]===unit[0]);
    const count=1+Math.floor(Math.random()*Math.min(3,candidates.length));
    const group=[question,...shuffle(candidates.filter(q=>q!==question)).slice(0,count-1)];
    const targets=group.map(q=>parseStructuredUnit(q.cardId)![1]);
    group.forEach(q=>grouped.set(q.kind+":"+q.cardId,targets));
    return {...question,targetGroup:targets};
  });
  return {...state,queue:structuredQueue.flatMap((question):Question[]=>{
    if(question.kind!=="choice" || question.choices || parseStructuredUnit(question.cardId))return [question];
    const card=cards.find(c=>c.id===question.cardId);
    if(!card)return [question];
    const answer=sides(card,question.reverse);
    const key=(c:Card)=>{const side=sides(c,question.reverse);return [side.answer.trim().toLowerCase(),side.answerImage,side.answerAudio,side.answerVideo].join("|");};
    const seen=new Set([key(card)]);
    const others=shuffle(cards.filter(c=>c.id!==card.id && !c.structure)).filter(c=>{const k=key(c);if(seen.has(k))return false;seen.add(k);return k!=="|||";}).slice(0,3);
    if(!others.length && answer.answer.trim() && state.options.typed!==false) {
      // Don't create two recall questions when the wave already contains one.
      return semanticQueue.some(q=>q.cardId===question.cardId&&q.reverse===question.reverse&&q.kind==="typed")?[]:[{...question,kind:"typed"}];
    }
    return [{...question,choices:shuffle([card.id,...others.map(c=>c.id)])}];
  })};
}
export function grade(
  input: string,
  expected: string,
  grading: LearnOptions["grading"] = "normal",
  accents?: boolean,
): "CORRECT" | "CLOSE" | "INCORRECT" {
  if (grading === "strict") return gradeAnswer(input, expected, "strict", accents);
  const evidence = confidenceGrade(input, expected, false, accents);
  return evidence.signals?.trivialTypo ? "CLOSE" : evidence.result === "strong_correct" ? "CORRECT" : evidence.result === "accepted" || evidence.result === "borderline" ? "CLOSE" : "INCORRECT";
}
export function answerLearn(
  state: WaveState,
  outcome: boolean | "DIDNT_KNOW",
  input = "",
  evidence?: AnswerEvidence,
): WaveState {
  const question = state.queue[0];
  if (!question) return state;
  const correct = outcome === true;
  const didntKnow = { ...state.didntKnow };
  if (outcome === "DIDNT_KNOW")
    didntKnow[question.cardId] = (didntKnow[question.cardId] || 0) + 1;
  const mastery = { ...state.mastery },
    mistakes = { ...state.mistakes };
  mastery[question.cardId] = correct
    ? question.kind === "typed" && !evidence?.needsReview
      ? "Mastered"
      : "Familiar"
    : outcome === "DIDNT_KNOW" && mastery[question.cardId] === "New"
      ? "New"
      : "Learning";
  if (!correct)
    mistakes[question.cardId] =
      (mistakes[question.cardId] || 0) + (outcome === "DIDNT_KNOW" ? 2 : 1);
  const queue = state.queue.slice(1);
  // A skipped recognition must be recognized again before its typed recall.
  if (outcome === "DIDNT_KNOW" && question.kind === "choice") {
    const typed = queue.findIndex(
      (q) => q.cardId === question.cardId && q.kind === "typed",
    );
    if (typed >= 0) queue.splice(typed, 1);
  }
  return {
    ...state,
    queue,
    mastery,
    mistakes,
    didntKnow,
    reviewNeeded:{...state.reviewNeeded,[question.cardId]:evidence?.needsReview ?? !correct},
    answers:[...(state.answers || []),{question,input,outcome,section:state.reinforcement?.section || 0,evidence}],
    checkpoint: queue.length === 0,
    ...(state.phase === "weak" && state.reinforcement ? {reinforcement:{...state.reinforcement,failed:correct && !evidence?.needsReview ? state.reinforcement.failed.filter(id=>id!==question.cardId) : [...new Set([...state.reinforcement.failed,question.cardId])]}} : {}),
  };
}
export const learnComplete = (state: WaveState) => state.phase ? state.phase === "complete" :
  !state.queue.length &&
  state.introduced >= state.ids.length &&
  (state.wave.length === 0 ||
    state.ids.every((id) => state.mastery[id] === "Mastered"));
export function continueWave(state: WaveState): WaveState {
  if(state.phase) {
    if(state.queue.length || state.phase === "complete")return state;
    const rounds=state.rounds+1;
    const complete=()=>({...state,phase:"complete" as const,queue:[],wave:[],checkpoint:false});
    if(state.phase === "learning" && state.introduced < state.ids.length) {
      const size=state.options.waveSize>0?state.options.waveSize:phaseSize(state.ids.length),wave=state.ids.slice(state.introduced,state.introduced+size);
      return {...state,wave,rounds,introduced:state.introduced+wave.length,queue:waveQuestions(wave,state.options,rounds),checkpoint:false};
    }
    const ids=state.phase === "learning" ? state.ids.filter(id=>(state.mistakes[id]||0)>0 || state.reviewNeeded?.[id]) : state.reinforcement?.failed || [];
    if(!ids.length)return complete();
    const misses=ids.reduce((n,id)=>n+(state.mistakes[id]||0),0);
    const total=state.reinforcement?.total || (misses>state.ids.length || ids.length>state.ids.length*.5 ? 3 : misses>2 ? 2 : 1);
    const section=(state.reinforcement?.section || 0)+1;
    if(section>total)return complete();
    return {...state,phase:"weak",rounds,wave:ids,queue:waveQuestions(ids,state.options,rounds),checkpoint:false,
      reinforcement:{section,total,ids:state.reinforcement?.ids || ids,failed:[]}};
  }
  // Reinforce only concepts still weak; recognized concepts must pass recall.
  const weak = state.wave.filter(
    (id) =>
      state.mastery[id] !== "Mastered" && (state.didntKnow?.[id] || 0) < 3,
  );
  const wave = weak.length
    ? weak
    : state.ids.slice(
        state.introduced,
        state.introduced + (state.options.waveSize>0?state.options.waveSize:phaseSize(state.ids.length)),
      );
  const rounds = state.rounds + 1;
  return {
    ...state,
    wave,
    rounds,
    introduced: state.introduced + (weak.length ? 0 : wave.length),
    queue: waveQuestions(wave, state.options, rounds),
    checkpoint: false,
  };
}
export function learnProgress(state: WaveState): number {
  const weights = { New: 0, Learning: 0.15, Familiar: 0.5, Mastered: 1 };
  return state.ids.length
    ? Math.round(
        (state.ids.reduce((n, id) => n + weights[state.mastery[id]], 0) /
          state.ids.length) *
          100,
      )
    : 0;
}
export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function sides(card: Card, reverse: boolean) {
  return reverse
    ? {
        prompt: card.answer,
        image: card.answerImage,
        audio: card.answerAudio,
        video: card.answerVideo,
        answer: card.question,
        answerImage: card.questionImage,
        answerAudio: card.questionAudio,
        answerVideo: card.questionVideo,
      }
    : {
        prompt: card.question,
        image: card.questionImage,
        audio: card.questionAudio,
        video: card.questionVideo,
        answer: card.answer,
        answerImage: card.answerImage,
        answerAudio: card.answerAudio,
        answerVideo: card.answerVideo,
      };
}
