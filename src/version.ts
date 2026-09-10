// The stable internal version must sort after the already-published 0.1.4.
// Keep display naming separate from the updater's SemVer and installer versions.
export const displayVersion=(version:string)=>version==="0.1.5"?"0.1.4a":version;
