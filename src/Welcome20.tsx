import { useState } from "react";
import { Modal } from "./ui";
import { useReducedMotion } from "./motion";
export function Welcome20({ upgraded }: { upgraded: boolean }) {
  const [viewed,setViewed]=useState(()=>localStorage.getItem("flint-welcome-2") === "viewed");
  const reduced=useReducedMotion();
  if (!upgraded || viewed) return null;
  const close=()=>{localStorage.setItem("flint-welcome-2","viewed");localStorage.removeItem("flint-welcome-2-pending");setViewed(true);};
  return <Modal title="Welcome to Flint 2.0" onClose={close}><section className={"welcome-major"+(reduced?" reduced-motion":"")}>
    {!reduced && <div className="welcome-confetti" aria-hidden="true">{Array.from({length:18},(_,i)=><i key={i} style={{left:`${i*5.7}%`,animationDelay:`${i%5*.13}s`,rotate:`${i*37}deg`}}/>)}</div>}
    <p className="eyebrow">YOUR NEXT CHAPTER</p><h1>Everything you know.<br/>Reimagined.</h1>
    <p>Your library is still yours. Discover new ways to build understanding.</p>
    <div className="welcome-highlights"><span>Structured Cards</span><span>Smart Math</span><span>Better Learn</span><span>Improved Media</span><span>Cleaner Flint</span><span>Sonata file format</span></div>
    <button className="primary" onClick={close}>Explore Flint 2.0</button>
  </section></Modal>;
}
