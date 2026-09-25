import { useEffect, useState } from "react";
const eventName="flint-preference-change";
export function readPreference<T extends string|number|boolean>(key:string,fallback:T):T {
  try {const value=JSON.parse(localStorage.getItem("flint-pref-"+key)||"null");return typeof value===typeof fallback?value:fallback;}catch{return fallback;}
}
export function writePreference<T extends string|number|boolean>(key:string,value:T){localStorage.setItem("flint-pref-"+key,JSON.stringify(value));window.dispatchEvent(new Event(eventName));}
export function usePreference<T extends string|number|boolean>(key:string,fallback:T){
  const [value,setValue]=useState<T>(()=>readPreference(key,fallback));
  useEffect(()=>{const update=()=>setValue(readPreference(key,fallback));window.addEventListener(eventName,update);window.addEventListener("storage",update);return()=>{window.removeEventListener(eventName,update);window.removeEventListener("storage",update);};},[key,fallback]);
  return [value,(next:T)=>writePreference(key,next)] as const;
}
