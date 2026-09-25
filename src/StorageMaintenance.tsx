import {useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import {inTauri,syncDraftMedia} from "./native";
import {Modal} from "./ui";
type Candidate={name:string;bytes:number;modified:number};
type Scan={candidates:Candidate[];bytes:number};
const size=(bytes:number)=>(bytes/1024/1024).toFixed(2)+" MiB";
export function StorageMaintenance(){
  const [scan,setScan]=useState<Scan|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  async function inspect(){setBusy(true);setMessage("");try{if(!inTauri())throw Error("Available in the desktop app.");await syncDraftMedia();setScan(await invoke<Scan>("scan_unused_media"));}catch(e){setMessage(String(e));}finally{setBusy(false);}}
  async function clean(){if(!scan || busy)return;setBusy(true);try{await syncDraftMedia();const result=await invoke<Scan>("cleanup_unused_media",{expected:scan.candidates});setMessage(`Removed ${result.candidates.length} unused managed files (${size(result.bytes)}). Newly referenced or changed files were skipped.`);setScan(null);}catch(e){setMessage(String(e));}finally{setBusy(false);}}
  return <section className="panel setting"><div><b>Managed media cleanup</b><p>Trash keeps restoration media for 7 days (up to 5 sets). Replaced attachments are retained for editor Undo and reclaimed on next launch when unreferenced. Review legacy orphans here. Source files and backup archives are never touched.</p>{message&&<p role="status">{message}</p>}</div><button disabled={busy} onClick={inspect}>Scan unused media</button>
    {scan&&<Modal title="Unused managed media" onClose={()=>{if(!busy)setScan(null);}}><p>This is a preview only. {scan.candidates.length} files · {size(scan.bytes)}. Cleanup checks saved cards, Trash, study history and the saved creation draft again before removing anything.</p><div style={{maxHeight:300,overflow:"auto"}}><ul>{scan.candidates.map(c=><li key={c.name}>{c.name} · {size(c.bytes)}</li>)}</ul></div><p>Removed files cannot be recovered without a backup. Files newly referenced or modified since this scan will be skipped.</p><div className="modal-actions"><button disabled={busy} onClick={()=>setScan(null)}>Cancel</button><button className="danger" disabled={busy||!scan.candidates.length} onClick={clean}>Delete unused managed files</button></div></Modal>}
  </section>;
}
