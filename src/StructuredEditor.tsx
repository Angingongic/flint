import { useMemo, useRef, useState, type ReactNode } from "react";
import { OcclusionEditor } from "./OcclusionEditor";
import { TableEditor } from "./TableEditor";
import { StructuredView } from "./StructuredView";
import { SmartMathInput } from "./SmartMathField";
import { Modal } from "./ui";
import { createGrid, createOcclusion, selectTargets, type StructuredCard } from "./structured";
import { FileText, Image, Table2 } from "lucide-react";

export function StructuredEditor({ value, onChange, children, lockType = false }: { value?: StructuredCard | null; onChange: (value: StructuredCard | null) => void; children: ReactNode; lockType?: boolean }) {
  const [editing,setEditing]=useState(false);
  const opened=useRef<StructuredCard|null>(null);
  const [confirmClose,setConfirmClose]=useState(false);
  const beginEdit=(next:StructuredCard)=>{opened.current=structuredClone(next);setConfirmClose(false);setEditing(true);};
  const requestClose=()=>{if(JSON.stringify(opened.current)!==JSON.stringify(value))setConfirmClose(true);else setEditing(false);};
  const [showPreview,setShowPreview]=useState(true);
  const [preview, setPreview] = useState<"reference" | "choice" | "typed">("reference");
  const [answers, setAnswers] = useState<Record<string,string>>({});
  const targets = useMemo(() => value ? selectTargets(value).map(t => t.id) : [], [value]);
  return <div className="card-content-editor">
    {lockType && value ? <p className="muted">{value.type === "table" ? `TABLE · ${value.rows.length}×${value.columns.length}` : `DIAGRAM · ${value.regions.length} regions`}</p> : <fieldset className="card-type-picker"><legend>Card type</legend>{(["standard","occlusion","table"] as const).map(type=><button type="button" key={type} aria-pressed={(value?.type || "standard")===type} onClick={() => {
      if ((value?.type || "standard") === type) {if(value)beginEdit(value);return;}
      if (value && !window.confirm("Change card type? The current structured content will be replaced. You can Undo this change.")) return;
      const next=type === "table" ? createGrid() : type === "occlusion" ? createOcclusion() : null;
      onChange(next);
      setAnswers({});
      if(next)beginEdit(next);else setEditing(false);
    }}>{type==="standard"?<FileText size={17}/>:type==="occlusion"?<Image size={17}/>:<Table2 size={17}/>}<span>{type==="standard"?"Standard":type==="occlusion"?"Diagrams":"Tables"}</span>{type!=="standard"&&<> <small className="card-type-new">NEW</small></>}</button>)}</fieldset>}
    {!value ? children : <>
      <div className="structured-compact"><StructuredView value={value} mode="reference"/><button type="button" onClick={()=>beginEdit(value)}>Edit structured card</button></div>
      {editing && <Modal title={value.type === "table" ? "Edit Tables" : "Edit Diagrams"} onClose={requestClose}>
      {confirmClose&&<Modal title="Save changes?" onClose={()=>setConfirmClose(false)}><p>Your changes to this {value.type==="table"?"Table":"Diagram"} haven't been saved.</p><div className="modal-actions"><button className="primary" onClick={()=>{setConfirmClose(false);setEditing(false);}}>Save All</button><button className="secondary" onClick={()=>{onChange(opened.current);setConfirmClose(false);setEditing(false);}}>Discard Changes</button><button autoFocus className="secondary" onClick={()=>setConfirmClose(false)}>Cancel</button></div></Modal>}
      <label className="structured-prompt">Study prompt (optional)<SmartMathInput value={value.title} onChange={event => onChange({ ...value, title:event.target.value })} /></label>
      <button type="button" aria-expanded={showPreview} onClick={()=>setShowPreview(v=>!v)}>{showPreview?"Hide study preview":"Show study preview"}</button>
      <div className={"structured-editor-layout table-workspace "+(value.type==="table"&&showPreview?"table-with-preview":"occlusion-studio")}><section className="structured-edit-pane"><h3>{value.type === "table" ? "Edit the table" : "Diagrams"}</h3>
      {value.type === "table" ? <TableEditor value={value} onChange={onChange} /> : <OcclusionEditor value={value} onChange={onChange} />}
      </section><section hidden={!showPreview} className="structured-preview-pane" aria-label="Study preview"><h3>Live preview</h3><div className="structured-preview-tabs" role="group" aria-label="Preview study mode">{(["reference","choice","typed"] as const).map((mode,index) => <button type="button" key={mode} aria-pressed={preview === mode} onClick={() => { setPreview(mode); setAnswers({}); }}>{["Flashcards","Learn","Test"][index]}</button>)}</div>
        <StructuredView value={value} mode={preview} targetIds={targets} answers={answers} onAnswer={(id, answer) => setAnswers(old => ({ ...old, [id]:answer }))} />
      <p className="muted">{preview === "reference" ? "The complete card, with every answer visible." : "Example questions use the same card layout."}</p></section></div>
      <div className="modal-actions"><button type="button" className="primary" onClick={()=>setEditing(false)}>Done editing</button></div></Modal>}
    </>}
  </div>;
}
