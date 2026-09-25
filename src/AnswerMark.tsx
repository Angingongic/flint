import {Check,X} from "lucide-react";
/** Shared, non-color-only result marker for card objects and primary feedback. */
export function AnswerMark({correct,label}:{correct:boolean;label?:string}){
  return <span className={`answer-mark ${correct?"is-correct":"is-incorrect"}`} role="img" aria-label={label||(correct?"Correct":"Incorrect")} title={label||(correct?"Correct":"Incorrect")}>{correct?<Check aria-hidden="true" size={16}/>:<X aria-hidden="true" size={16}/>}</span>;
}
