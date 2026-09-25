import { useCallback, useEffect, useRef, useState } from "react";
import { usePreference } from "./preferences";
import { Undo2, Redo2, Eraser, Plus, Minus, PaintBucket, Type, SlidersHorizontal, CircleHelp } from "lucide-react";
import {TableMenu,type TableAction} from "./TableMenu";
import {saveMediaBytes} from "./native";
import {TableImage} from "./TableImage";
import {TableText} from "./TableText";
import {moveTableImage} from "./table-media";
import {ReplaceImageDialog} from "./ReplaceImageDialog";
import {
  cellValue,
  clearGridCells,
  gridResize,
  pasteGrid,
  removeGridAxis,
  resizeAxis,
  nameGridAxis,
  insertGridAxis,
  setCell,
  setCellImage,
  type TableCard,
} from "./structured";
import "./structured.css";
import { SmartMathInput } from "./SmartMathField";
import {
  FormattedCell,
  formatCSS,
  cellSurfaceCSS,
  formatCells,
  type CellStyle,
} from "./table-format";
import { structuredCellKey } from "./structured";

type Cell = [number, number];
export function TableEditor({
  value,
  onChange: save,
}: {
  value: TableCard;
  onChange: (value: TableCard) => void;
}) {
  const [liveMath]=usePreference<boolean>("live-math",true);
  const [start, setStart] = useState<Cell>([0, 0]),
    [end, setEnd] = useState<Cell>([0, 0]);
  const root = useRef<HTMLDivElement>(null);
  const imagePicker=useRef<HTMLInputElement>(null),latest=useRef(value),imageTarget=useRef<Cell>([0,0]);
  latest.current=value;
  const [imageBusy,setImageBusy]=useState(false);
  const [replacement,setReplacement]=useState<{file:File;rowId:string;colId:string}|null>(null);
  async function attachImage(file:File,row:number,column:number,confirmed=false) {
    if(imageBusy)return;
    const before=latest.current, rowId=before.rows[row]?.id,colId=before.columns[column]?.id;
    if(!rowId||!colId)return;
    if(before.images?.[structuredCellKey(rowId,colId)]&&!confirmed){setReplacement({file,rowId,colId});return;}
    setImageBusy(true);setClipboardError("");
    try {
      const name=await saveMediaBytes(file),current=latest.current;
      const ri=current.rows.findIndex(r=>r.id===rowId),ci=current.columns.findIndex(c=>c.id===colId);
      if(ri>=0&&ci>=0)onChange(setCellImage(current,ri,ci,name));
    }catch(reason){setClipboardError(String(reason));}finally{setImageBusy(false);}
  }
  const chooseImage=()=>{imageTarget.current=[...end];imagePicker.current?.click();};
  useEffect(()=>{const clamp=([r,c]:Cell):Cell=>[Math.min(r,value.rows.length-1),Math.min(c,value.columns.length-1)];setStart(old=>clamp(old));setEnd(old=>clamp(old));},[value.rows.length,value.columns.length]);
  const movingFocus = useRef(false);
  const history = useRef<{ past: TableCard[]; future: TableCard[] }>({
    past: [],
    future: [],
  });
  const [, refreshHistory] = useState(0);
  const [textRange, setTextRange] = useState({ start: 0, end: 0 });
  const [menu,setMenu]=useState<{x:number;y:number;axis?:"rows"|"columns";index?:number}|null>(null);
  const [clipboardError,setClipboardError]=useState("");
  const closeMenu=useCallback(()=>setMenu(null),[]);
  useEffect(()=>{
    const closeOutside=(event:PointerEvent)=>root.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach(details=>{if(!details.contains(event.target as Node))details.open=false;});
    document.addEventListener("pointerdown",closeOutside);
    return()=>document.removeEventListener("pointerdown",closeOutside);
  },[]);
  const selectionText=()=>value.rows.slice(Math.min(start[0],end[0]),Math.max(start[0],end[0])+1).map(row=>value.columns.slice(Math.min(start[1],end[1]),Math.max(start[1],end[1])+1).map(column=>value.cells[structuredCellKey(row.id,column.id)]||"").join("\t")).join("\n");
  async function clipboard(action:"copy"|"cut"|"paste"){
    setClipboardError("");try{
      const before=latest.current;
      if(action==="paste") {
        if(navigator.clipboard.read){const items=await navigator.clipboard.read();const item=items.find(item=>item.types.some(type=>type.startsWith("image/")));if(item){const type=item.types.find(type=>type.startsWith("image/"))!;const blob=await item.getType(type);await attachImage(new File([blob],"clipboard",{type}),...end);return;}}
        const text=await navigator.clipboard.readText();if(latest.current!==before)throw Error("Table changed during clipboard access");onChange(pasteGrid(before,text,Math.min(start[0],end[0]),Math.min(start[1],end[1])));
      }
      else{await navigator.clipboard.writeText(selectionText());if(action==="cut"){if(latest.current!==before)throw Error("Table changed during clipboard access");onChange(clearGridCells(before,start,end));}}
    }catch{setClipboardError("Clipboard access is unavailable. Use Ctrl+C, Ctrl+X or Ctrl+V in the selected cells.");}
  }
  function axisActions(axis:"rows"|"columns",index:number):TableAction[]{
    const noun=axis==="rows"?"row":"column",max=axis==="rows"?100:20;
    const a:Cell=axis==="rows"?[index,0]:[0,index],b:Cell=axis==="rows"?[index,value.columns.length-1]:[value.rows.length-1,index];
    return [
      {label:`Rename ${noun}`,run:()=>setTimeout(()=>{const input=root.current?.querySelector<HTMLInputElement>(`[data-axis="${axis}:${index}"]`);input?.focus();input?.select();},0)},
      {label:axis==="rows"?"Insert above":"Insert left",disabled:value[axis].length>=max,run:()=>onChange(insertGridAxis(value,axis,index))},
      {label:axis==="rows"?"Insert below":"Insert right",disabled:value[axis].length>=max,run:()=>onChange(insertGridAxis(value,axis,index+1))},
      {label:`Duplicate ${noun}`,disabled:value[axis].length>=max,run:()=>onChange(insertGridAxis(value,axis,index+1,index))},
      {label:`Clear ${noun}`,run:()=>onChange(clearGridCells(value,a,b))},
      {label:`Delete ${noun}`,danger:true,disabled:value[axis].length<=1,run:()=>{onChange(removeGridAxis(value,axis,index));setStart([0,0]);setEnd([0,0]);}},
      {label:`Reset ${noun} ${axis==="rows"?"height":"width"}`,run:()=>onChange(resizeAxis(value,axis,value[axis][index].id,axis==="rows"?44:160))},
    ];
  }
  const menuActions:TableAction[]=menu?.axis?axisActions(menu.axis,menu.index||0):[
    {label:(value.textPositions?.[structuredCellKey(value.rows[end[0]].id,value.columns[end[1]].id)]?"✓ ":"")+"Free Position",run:()=>{const key=structuredCellKey(value.rows[end[0]].id,value.columns[end[1]].id),textPositions={...value.textPositions};if(textPositions[key])delete textPositions[key];else textPositions[key]={x:0,y:0};onChange({...value,textPositions});}},
    {label:value.images?.[structuredCellKey(value.rows[end[0]]?.id||"",value.columns[end[1]]?.id||"")]?"Replace image":"Insert image",disabled:imageBusy,run:chooseImage},
    ...(value.images?.[structuredCellKey(value.rows[end[0]]?.id||"",value.columns[end[1]]?.id||"")] ? [{label:"Remove image",run:()=>onChange(setCellImage(latest.current,end[0],end[1],null))}] : []),
    {label:"Cut",run:()=>void clipboard("cut")},{label:"Copy",run:()=>void clipboard("copy")},{label:"Paste",run:()=>void clipboard("paste")},
    {label:"Clear contents",run:()=>onChange(clearGridCells(value,start,end))},
    {label:"Insert row above",separator:true,disabled:value.rows.length>=100,run:()=>onChange(insertGridAxis(value,"rows",Math.min(start[0],end[0])))},
    {label:"Insert row below",disabled:value.rows.length>=100,run:()=>onChange(insertGridAxis(value,"rows",Math.max(start[0],end[0])+1))},
    {label:"Insert column left",disabled:value.columns.length>=20,run:()=>onChange(insertGridAxis(value,"columns",Math.min(start[1],end[1])))},
    {label:"Insert column right",disabled:value.columns.length>=20,run:()=>onChange(insertGridAxis(value,"columns",Math.max(start[1],end[1])+1))},
    {label:"Clear formatting",separator:true,run:()=>onChange(formatCells(value,start,end,null))},
    {label:"Row",separator:true,children:axisActions("rows",end[0])},{label:"Column",children:axisActions("columns",end[1])},
  ];
  function onChange(next: TableCard) {
    if (next === latest.current) return;
    history.current.past.push(latest.current);
    if (history.current.past.length > 100) history.current.past.shift();
    history.current.future = [];
    save(next);
    refreshHistory((n) => n + 1);
  }
  function undo(redo = false) {
    const source = redo ? history.current.future : history.current.past,
      target = redo ? history.current.past : history.current.future;
    const next = source.pop();
    if (next) {
      target.push(value);
      save(next);
      refreshHistory((n) => n + 1);
    }
  }
  function format(patch: CellStyle | null) {
    onChange(formatCells(value, start, end, patch, textRange));
  }
  const selectedFormat =
    value.formats?.[
      structuredCellKey(
        value.rows[start[0]]?.id || "",
        value.columns[start[1]]?.id || "",
      )
    ] || {};
  const selectedTextStyle = Object.assign(
    {},
    selectedFormat,
    ...(start[0] === end[0] &&
    start[1] === end[1] &&
    textRange.end > textRange.start
      ? (selectedFormat.runs || [])
          .filter(
            (run) => run.start <= textRange.start && run.end >= textRange.end,
          )
          .map((run) => run.style)
      : []),
  );
  const selected = (r: number, c: number) =>
    r >= Math.min(start[0], end[0]) &&
    r <= Math.max(start[0], end[0]) &&
    c >= Math.min(start[1], end[1]) &&
    c <= Math.max(start[1], end[1]);
  function focus(r: number, c: number, extend = false) {
    const cell: Cell = [
      Math.max(0, Math.min(value.rows.length - 1, r)),
      Math.max(0, Math.min(value.columns.length - 1, c)),
    ];
    if (!extend) setStart(cell);
    setTextRange({ start: 0, end: 0 });
    setEnd(cell);
    movingFocus.current = true;
    root.current
      ?.querySelector<HTMLInputElement>(`[data-cell="${cell.join(":")}"]`)
      ?.focus();
    movingFocus.current = false;
  }
  const dragSize = useRef<{
    axis: "rows" | "columns";
    id: string;
    position: number;
    size: number;
    next?: number;
  } | null>(null);
  return (
    <div
      className="table-editor"
      ref={root}
      onCopy={event=>{if(start[0]!==end[0]||start[1]!==end[1]){event.preventDefault();event.clipboardData.setData("text/plain",selectionText());}}}
      onCut={event=>{if(start[0]!==end[0]||start[1]!==end[1]){event.preventDefault();event.clipboardData.setData("text/plain",selectionText());onChange(clearGridCells(value,start,end));}}}
      onKeyDownCapture={(event) => {
        if(replacement)return;
        if(event.key==="Escape"&&!menu){const opened=root.current?.querySelectorAll<HTMLDetailsElement>("details[open]");if(opened?.length){event.preventDefault();event.stopPropagation();opened.forEach(details=>{details.open=false;});return;}}
        if (event.nativeEvent.isComposing || !(event.ctrlKey || event.metaKey))
          return;
        const key = event.key.toLowerCase();
        if (key === "z" || key === "y") {
          event.preventDefault();
          event.stopPropagation();
          undo(key === "y" || event.shiftKey);
        }
        const style = ({ b: "bold", i: "italic", u: "underline" } as const)[
          key as "b" | "i" | "u"
        ];
        if (style) {
          event.preventDefault();
          event.stopPropagation();
          format({ [style]: !selectedTextStyle[style] });
        }
      }}
    >
      {replacement && <ReplaceImageDialog onCancel={()=>setReplacement(null)} onReplace={()=>{
        const pending=replacement;setReplacement(null);
        const current=latest.current,r=current.rows.findIndex(row=>row.id===pending.rowId),c=current.columns.findIndex(column=>column.id===pending.colId);
        if(r>=0&&c>=0)void attachImage(pending.file,r,c,true);
      }}/>}
      <div
        className="table-format-toolbar"
        role="toolbar"
        aria-label="Cell formatting"
      >
        {(["bold", "italic", "underline", "strike"] as const).map(
          (key, index) => (
            <button
              key={key}
              type="button"
              title={
                [
                  "Bold (Ctrl+B)",
                  "Italic (Ctrl+I)",
                  "Underline (Ctrl+U)",
                  "Strikethrough",
                ][index]
              }
              aria-label={
                ["Bold", "Italic", "Underline", "Strikethrough"][index]
              }
              aria-pressed={!!selectedTextStyle[key]}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => format({ [key]: !selectedTextStyle[key] })}
            >
              {[<b>B</b>, <i>I</i>, <u>U</u>, <s>S</s>][index]}
            </button>
          ),
        )}
        <span className="table-toolbar-divider"/>
        <select
          aria-label="Text alignment"
          value={selectedFormat.align || "left"}
          onChange={(e) =>
            format({ align: e.target.value as CellStyle["align"] })
          }
        >
          <option value="left">Align left</option>
          <option value="center">Center</option>
          <option value="right">Align right</option>
        </select>
        <span className="table-toolbar-divider"/>
        <label className="table-color-control" title="Text color" style={{"--swatch":selectedFormat.color||"var(--text)"} as React.CSSProperties}>
          <Type size={17}/><span>Text</span>
          <input
            type="color"
            aria-label="Text color"
            value={selectedFormat.color || "#e7ebef"}
            onChange={(e) => format({ color: e.target.value })}
          />
        </label>
        <label className="table-color-control" title="Cell background" style={{"--swatch":selectedFormat.background||"var(--surface)"} as React.CSSProperties}>
          <PaintBucket size={17}/><span>Fill</span>
          <input
            type="color"
            aria-label="Cell background color"
            value={selectedFormat.background || "#1d242b"}
            onChange={(e) => format({ background: e.target.value })}
          />
        </label>
        <button type="button" aria-label="Reset formatting" title="Reset formatting" onClick={() => format(null)}>
          <Eraser size={18}/>
        </button>
        <span className="table-toolbar-divider"/>
        <button
          type="button"
          disabled={!history.current.past.length}
          aria-label="Undo" title="Undo"
          onClick={() => undo()}
        >
          <Undo2 size={18}/>
        </button>
        <button
          type="button"
          disabled={!history.current.future.length}
          aria-label="Redo" title="Redo"
          onClick={() => undo(true)}
        >
          <Redo2 size={18}/>
        </button>
      </div>
      <div className="table-layout-toolbar">
        <details className="table-options">
          <summary><SlidersHorizontal size={16}/>Table options</summary>
          <div className="table-options-panel">
            <h4>Structure</h4>
            {(["rows", "columns"] as const).map((axis) => (
              <div className="table-dimension-control" key={axis}><span>{axis === "rows" ? "Rows" : "Columns"}</span><button type="button" aria-label={`Decrease ${axis}`} disabled={value[axis].length<=1} onClick={()=>onChange(gridResize(value,axis,value[axis].length-1))}><Minus size={14}/></button><output aria-label={axis==="rows"?"Rows":"Columns"}>{value[axis].length}</output><button type="button" aria-label={`Increase ${axis}`} disabled={value[axis].length>=(axis==="rows"?100:20)} onClick={()=>onChange(gridResize(value,axis,value[axis].length+1))}><Plus size={14}/></button></div>
            ))}
            <h4>Display</h4>
            {(["headerRow", "headerColumn", "gridLines"] as const).map(
              (option, index) => (
                <label key={option}>
                  <input
                    type="checkbox"
                    checked={value[option]}
                    onChange={(e) =>
                      onChange({ ...value, [option]: e.target.checked })
                    }
                  />
                  {["Header row", "Header column", "Grid lines"][index]}
                </label>
              ),
            )}
          </div>
        </details>
        <details className="table-help"><summary aria-label="Table shortcuts" title="Table shortcuts"><CircleHelp size={17}/></summary><div>Shift-click or Shift+Arrow selects a range. Paste tab-separated cells with Ctrl+V. Drag header dividers to resize; double-click to fit. Right-click cells or headers for more actions. Ctrl+Z undoes an action.</div></details>
      </div>
      {clipboardError&&<p role="status">{clipboardError}</p>}
      <input ref={imagePicker} hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="Insert cell image" onChange={e=>{const file=e.target.files?.[0];if(file)void attachImage(file,...imageTarget.current);e.target.value="";}}/>
      {imageBusy&&<p role="status">Saving cell image…</p>}
      <div className="table-grid-workspace">
      <div className="structured-table-scroll" onContextMenu={event=>event.preventDefault()}>
        <table
          className={"structured-table" + (value.gridLines ? "" : " no-grid")}
        >
          <colgroup>
            <col style={{ width: 100 }} />
            {value.columns.map((column) => (
              <col key={column.id} style={{ width: column.size }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th aria-label="Row names" />
              {value.columns.map((column, ci) => (
                <th key={column.id} scope="col" onContextMenu={event=>{event.preventDefault();setMenu({x:event.clientX,y:event.clientY,axis:"columns",index:ci});}}>
                  <input size={1} className="table-axis-name" data-axis={`columns:${ci}`} aria-label={`Column ${ci+1} name`} value={column.name??String.fromCharCode(65+ci)} onChange={event=>onChange(nameGridAxis(value,"columns",ci,event.target.value))}/>
                  {handle(
                    "columns",
                    column.id,
                    column.size,
                    `Column ${ci + 1} width`,
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {value.rows.map((row, ri) => (
              <tr key={row.id} style={{ height: row.size }}>
                <th scope="row" onContextMenu={event=>{event.preventDefault();setMenu({x:event.clientX,y:event.clientY,axis:"rows",index:ri});}}>
                  <input size={1} className="table-axis-name" data-axis={`rows:${ri}`} aria-label={`Row ${ri+1} name`} value={row.name??String(ri+1)} onChange={event=>onChange(nameGridAxis(value,"rows",ri,event.target.value))}/>
                  {handle("rows", row.id, row.size, `Row ${ri + 1} height`)}
                </th>
                {value.columns.map((column, ci) => (
                  <td
                    key={column.id}
                    data-media-cell={structuredCellKey(row.id,column.id)}
                    onContextMenu={event=>{event.preventDefault();if(!selected(ri,ci)){setStart([ri,ci]);setEnd([ri,ci]);}setTextRange({start:0,end:0});setMenu({x:event.clientX,y:event.clientY});}}
                    style={cellSurfaceCSS(
                      value.formats?.[structuredCellKey(row.id, column.id)],
                    )}
                    className={
                      (selected(ri, ci) ? "selected-cell " : "") +
                      ((value.headerRow && ri === 0) ||
                      (value.headerColumn && ci === 0)
                        ? "header-cell"
                        : "")
                    }
                  >
                    {value.images?.[structuredCellKey(row.id,column.id)]&&<TableImage name={value.images[structuredCellKey(row.id,column.id)]} alt={`Image in row ${ri+1}, column ${ci+1}`} cellId={structuredCellKey(row.id,column.id)} layout={value.imageLayouts?.[structuredCellKey(row.id,column.id)]} onRemove={()=>onChange(setCellImage(latest.current,ri,ci,null))} onCommit={(to,layout)=>{const next=moveTableImage(latest.current,structuredCellKey(row.id,column.id),to,layout);if(next===latest.current)setClipboardError("That cell already contains an image. Move it to an empty cell or use Replace image.");else onChange(next);}}/>}
                    <TableText position={value.textPositions?.[structuredCellKey(row.id,column.id)]} onMove={position=>onChange({...latest.current,textPositions:{...latest.current.textPositions,[structuredCellKey(row.id,column.id)]:position}})}><SmartMathInput
                      style={{
                        ...formatCSS(
                          value.formats?.[structuredCellKey(row.id, column.id)],
                        ),
                        background: "transparent",
                      }}
                      formattedContent={
                        value.formats?.[structuredCellKey(row.id, column.id)]
                          ?.runs?.length ? (
                          <FormattedCell
                            math={liveMath}
                            text={cellValue(value, ri, ci)}
                            format={
                              value.formats?.[
                                structuredCellKey(row.id, column.id)
                              ]
                            }
                          />
                        ) : undefined
                      }
                      data-cell={`${ri}:${ci}`}
                      aria-label={`Row ${ri + 1}, column ${ci + 1}`}
                      value={cellValue(value, ri, ci)}
                      onSelect={(event) => {
                        setTextRange({
                          start: event.currentTarget.selectionStart || 0,
                          end: event.currentTarget.selectionEnd || 0,
                        });
                      }}
                      onPointerDown={(event) => {
                        if (event.shiftKey) {
                          event.preventDefault();
                          focus(ri, ci, true);
                        } else {
                          setStart([ri, ci]);
                          setEnd([ri, ci]);
                        }
                      }}
                      onChange={(event) =>
                        onChange(setCell(value, ri, ci, event.target.value))
                      }
                      onPaste={(event) => {
                        const file=Array.from(event.clipboardData.files||[]).find(f=>f.type.startsWith("image/"));
                        if(file){event.preventDefault();event.stopPropagation();void attachImage(file,ri,ci);return;}
                        const text = event.clipboardData.getData("text/plain");
                        if (/[\t\r\n]/.test(text)) {
                          event.preventDefault();
                          onChange(pasteGrid(value, text, ri, ci));
                        }
                      }}
                      onFocus={() => {
                        if (!movingFocus.current) {
                          setStart([ri, ci]);
                          setEnd([ri, ci]);
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.nativeEvent.isComposing) return;
                        const delta = {
                          ArrowUp: [-1, 0],
                          ArrowDown: [1, 0],
                          ArrowLeft: [0, -1],
                          ArrowRight: [0, 1],
                        }[event.key];
                        if (event.shiftKey && delta) {
                          event.preventDefault();
                          focus(ri + delta[0], ci + delta[1], true);
                        } else if (event.key === "Enter") {
                          event.preventDefault();
                          focus(ri + (event.shiftKey ? -1 : 1), ci);
                        } else if (event.key === "Tab") {
                          const next =
                            ri * value.columns.length +
                            ci +
                            (event.shiftKey ? -1 : 1);
                          if (
                            next >= 0 &&
                            next < value.rows.length * value.columns.length
                          ) {
                            event.preventDefault();
                            focus(
                              Math.floor(next / value.columns.length),
                              next % value.columns.length,
                            );
                          }
                        } else if (
                          event.key === "Delete" &&
                          (start[0] !== end[0] || start[1] !== end[1])
                        ) {
                          event.preventDefault();
                          onChange(clearGridCells(value, start, end));
                        }
                      }}
                    /></TableText>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="table-edge-add add-column" type="button" aria-label="Add column" title="Add column" disabled={value.columns.length>=20} onClick={()=>onChange(gridResize(value,"columns",value.columns.length+1))}><Plus size={18}/></button>
      <button className="table-edge-add add-row" type="button" aria-label="Add row" title="Add row" disabled={value.rows.length>=100} onClick={()=>onChange(gridResize(value,"rows",value.rows.length+1))}><Plus size={18}/></button>
      </div>
      {menu&&<TableMenu x={menu.x} y={menu.y} actions={menuActions} onClose={closeMenu}/>}
    </div>
  );

  function handle(
    axis: "rows" | "columns",
    id: string,
    size: number,
    label: string,
  ) {
    return (
      <button
        type="button"
        className={`table-size-handle ${axis==="rows"?"row-divider":"column-divider"}`}
        aria-label={label}
        title={`${label}: ${size}px`}
        onPointerDown={(event) => {
          event.preventDefault();
          dragSize.current = {
            axis,
            id,
            size,
            position: axis === "rows" ? event.clientY : event.clientX,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragSize.current;
          if (drag?.id === id) {
            drag.next = Math.max(
              axis === "rows" ? 32 : 64,
              Math.min(
                axis === "rows" ? 240 : 640,
                drag.size +
                  (axis === "rows" ? event.clientY : event.clientX) -
                  drag.position,
              ),
            );
            const node =
              axis === "rows"
                ? root.current?.querySelectorAll("tbody tr")[
                    value.rows.findIndex((r) => r.id === id)
                  ]
                : root.current?.querySelectorAll("col")[
                    value.columns.findIndex((c) => c.id === id) + 1
                  ];
            if (node)
              (node as HTMLElement).style[
                axis === "rows" ? "height" : "width"
              ] = `${drag.next}px`;
          }
        }}
        onPointerUp={() => {
          const drag = dragSize.current;
          if (drag?.next !== undefined)
            onChange(resizeAxis(value, axis, id, drag.next));
          dragSize.current = null;
        }}
        onDoubleClick={() => {
          const index = value[axis].findIndex((v) => v.id === id);
          const longest =
            axis === "columns"
              ? Math.max(
                  ...value.rows.map(
                    (_, r) => cellValue(value, r, index).length,
                  ),
                )
              : Math.max(
                  ...value.columns.map((_, c) =>
                    Math.ceil(
                      cellValue(value, index, c).length /
                        Math.max(5, value.columns[c].size / 9),
                    ),
                  ),
                );
          onChange(
            resizeAxis(
              value,
              axis,
              id,
              axis === "columns" ? longest * 9 + 28 : longest * 26 + 22,
            ),
          );
        }}
        onPointerCancel={cancelResize}
        onLostPointerCapture={cancelResize}
        onKeyDown={(event) => {
          if (
            ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
              event.key,
            )
          ) {
            event.preventDefault();
            onChange(
              resizeAxis(
                value,
                axis,
                id,
                size + (["ArrowUp", "ArrowLeft"].includes(event.key) ? -8 : 8),
              ),
            );
          }
        }}
      >
        <span aria-hidden="true" />
      </button>
    );
  }
  function cancelResize() {
    const drag = dragSize.current;
    if (!drag) return;
    const node =
      drag.axis === "rows"
        ? root.current?.querySelectorAll("tbody tr")[
            value.rows.findIndex((r) => r.id === drag.id)
          ]
        : root.current?.querySelectorAll("col")[
            value.columns.findIndex((c) => c.id === drag.id) + 1
          ];
    if (node)
      (node as HTMLElement).style[drag.axis === "rows" ? "height" : "width"] =
        `${drag.size}px`;
    dragSize.current = null;
  }
}
