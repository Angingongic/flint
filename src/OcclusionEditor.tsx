import { Fragment, useEffect, useRef, useState } from "react";
import { saveMediaBytes } from "./native";
import { SmartMathInput } from "./SmartMathField";
import { MathText } from "./MathText";
import { StructuredImage } from "./StructuredView";
import {
  addCallout,
  calloutRegion,
  regionAnchor,
  regionConnector,
  regionColor,
  regionSocket,
  removeRegion,
  updateRegion,
  type ImageOcclusion,
  type Region,
} from "./structured";
import { OcclusionLeader, calloutStyle, anchorStyle } from "./OcclusionCallout";
import { ImagePlus, MousePointer2, MapPinPlus, Plus, Minus, Maximize, Undo2, Redo2, Pencil, Trash2 } from "lucide-react";

type Point = { x: number; y: number };
type Gesture = {
  start: Point;
  pointer: number;
  region?: Region;
  resize?: boolean;
  anchor?: boolean;
  bounds: DOMRect;
  next?: ImageOcclusion;
};
export function OcclusionEditor({
  value,
  onChange: save,
}: {
  value: ImageOcclusion;
  onChange: (card: ImageOcclusion) => void;
}) {
  const [tool, setTool] = useState<"select" | "draw">("draw"),
    [selected, setSelected] = useState("");
  const [zoom, setZoom] = useState(1),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [aspect,setAspect] = useState(1);
  const latest = useRef(value);
  latest.current = value;
  const history=useRef<{past:ImageOcclusion[];future:ImageOcclusion[]}>({past:[],future:[]});
  const [,refreshHistory]=useState(0);
  function onChange(next:ImageOcclusion){if(next===latest.current)return;history.current.past.push(latest.current);if(history.current.past.length>100)history.current.past.shift();history.current.future=[];save(next);refreshHistory(n=>n+1);}
  function undo(redo=false){const from=redo?history.current.future:history.current.past,to=redo?history.current.past:history.current.future;const next=from.pop();if(next){to.push(latest.current);save(next);refreshHistory(n=>n+1);}}
  const gesture = useRef<Gesture | null>(null),
    canvas = useRef<HTMLDivElement>(null);
  const current = value.regions.find((region) => region.id === selected);
  const answerField=useRef<HTMLInputElement>(null), focusPending=useRef(false);
  const editAnswer=(id:string)=>{focusPending.current=true;setSelected(id);if(id===selected){answerField.current?.focus();answerField.current?.select();focusPending.current=false;}};
  useEffect(()=>{if(focusPending.current && current){answerField.current?.focus();answerField.current?.select();focusPending.current=false;}},[selected,current]);
  async function image(file?: File) {
    if (!file || busy) return;
    if (
      !/^image\/(png|jpeg|webp|gif)$/.test(file.type) ||
      file.size > 25 * 1024 * 1024
    ) {
      setError("Choose a PNG, JPEG, WebP or GIF under 25 MB.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const saved = await saveMediaBytes(file);
      onChange({ ...latest.current, image: saved });
    } catch {
      setError("Could not save the original image. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  function point(event: React.PointerEvent): Point {
    const box = gesture.current?.bounds || canvas.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
      y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)),
    };
  }
  function begin(event: React.PointerEvent, region?: Region, resize = false, anchor = false) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (region) setSelected(region.id);
    else if (tool !== "draw") {
      setSelected("");
      return;
    }
    gesture.current = {
      start: point(event),
      pointer: event.pointerId,
      region,
      resize,
      anchor,
      bounds: canvas.current!.getBoundingClientRect(),
    };
    canvas.current!.setPointerCapture(event.pointerId);
  }
  function paint(region: Region) {
    const root = canvas.current;
    if (!root) return;
    const id = CSS.escape(region.id), anchor = regionAnchor(region), end=regionConnector(region);
    const label = root.querySelector<HTMLElement>(`[data-region-id="${id}"]`);
    const endpoint = root.querySelector<HTMLElement>(`[data-anchor-id="${id}"]`);
    const line = root.querySelector(`[data-leader-id="${id}"] line`);
    if (label) Object.assign(label.style, calloutStyle(region));
    if (endpoint) Object.assign(endpoint.style, anchorStyle(region));
    if (line) {
      line.setAttribute("x1", String(anchor.x * 1000));
      line.setAttribute("y1", String(anchor.y * 1000));
      line.setAttribute("x2", String(end.x * 1000));
      line.setAttribute("y2", String(end.y * 1000));
    }
  }
  function cancel() {
    if (gesture.current?.region) paint(gesture.current.region);
    gesture.current = null;
  }
  return (
    <section
      className="occlusion-editor"
      aria-label="Diagram editor"
      onKeyDown={event=>{if((event.target as HTMLElement).matches("input,textarea,select"))return;if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="z"){event.preventDefault();undo(event.shiftKey);}}}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        void image(event.dataTransfer.files[0]);
      }}
      onPaste={(event) => {
        if (event.clipboardData.files[0]) {
          event.preventDefault();
          void image(event.clipboardData.files[0]);
        }
      }}
    >
      <div className="structured-tools occlusion-tool-rail">
        <h4>Image & tools</h4>
        <label className="occlusion-upload" title="Choose a managed source image">
          <ImagePlus size={18}/>
          {busy
            ? "Saving original…"
            : value.image
              ? "Replace image"
              : "Add image"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            disabled={busy}
            onChange={(event) => {
              void image(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          aria-pressed={tool === "select"}
          onClick={() => setTool("select")}
        >
          <MousePointer2 size={18}/> Select / move
        </button>
        <button
          type="button"
          aria-pressed={tool === "draw"}
          onClick={() => setTool("draw")}
        >
          <MapPinPlus size={18}/> Add callout
        </button>
        <button
          type="button"
          disabled={!value.image || value.regions.length >= 200}
          onClick={() => {
            const next = addCallout(value, { x: .5, y: .5 });
            onChange(next);
            setSelected(next.regions.at(-1)!.id);
            setTool("select");
          }}
        >
          <Plus size={18}/> Add centered callout
        </button>
        <div className="occlusion-zoom">
        <button
          type="button"
          aria-label="Zoom out"
          disabled={zoom <= 0.5}
          onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
        >
          <Minus size={18}/>
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          aria-label="Zoom in"
          disabled={zoom >= 3}
          onClick={() => setZoom(Math.min(3, zoom + 0.25))}
        >
          <Plus size={18}/>
        </button>
        </div>
        <button type="button" onClick={() => setZoom(1)}>
          <Maximize size={18}/> Fit image
        </button>
        <div className="occlusion-history">
          <button type="button" aria-label="Undo" title="Undo" disabled={!history.current.past.length} onClick={()=>undo()}><Undo2 size={18}/></button>
          <button type="button" aria-label="Redo" title="Redo" disabled={!history.current.future.length} onClick={()=>undo(true)}><Redo2 size={18}/></button>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      <p className="muted occlusion-tip">
        Click the image to place an anchor. Drag its label or endpoint independently.
        Arrow keys move the focused label or anchor; Shift+Arrow resizes a label.
      </p>
      <div className="occlusion-workspace">
        <div style={{ width: `${zoom * 100}%`, maxWidth:`${zoom * 52 * aspect}vh`,marginInline:"auto" }}>
          <StructuredImage name={value.image} onImageSize={(width,height)=>{if(width>0&&height>0)setAspect(width/height);}}>
            <div
              ref={canvas}
              className="occlusion-canvas"
              onPointerDown={(event) => begin(event)}
              onPointerMove={(event) => {
                const drag = gesture.current;
                if (!drag || event.pointerId !== drag.pointer) return;
                const p = point(event);
                if (!drag.region) {
                  return;
                }
                const dx = p.x - drag.start.x,
                  dy = p.y - drag.start.y;
                drag.next = updateRegion(
                    latest.current,
                    drag.region.id,
                    drag.anchor ? { anchor: { x: p.x, y: p.y } } : drag.resize
                      ? {
                          width: Math.min(
                            1 - drag.region.x,
                            drag.region.width + dx,
                          ),
                          height: Math.min(
                            1 - drag.region.y,
                            drag.region.height + dy,
                          ),
                        }
                      : { x: drag.region.x + dx, y: drag.region.y + dy },
                  );
                // The overlay alone moves. Parent draft/history/storage stays untouched until drop.
                const moved = drag.next.regions.find(r => r.id === drag.region!.id)!;
                paint(moved);
              }}
              onPointerUp={(event) => {
                const drag = gesture.current;
                if (!drag || event.pointerId !== drag.pointer) return;
                if (!drag.region) {
                  const next = addCallout(latest.current, drag.start);
                  if (next !== value) {
                    onChange(next);
                    editAnswer(next.regions.at(-1)!.id);
                    setTool("select");
                  }
                } else if (drag.next) onChange(drag.next);
                gesture.current = null;
              }}
              onPointerCancel={cancel}
              onLostPointerCapture={cancel}
            >
              {value.regions.map(calloutRegion).map((region, index) => (
                <Fragment key={region.id}>
                <OcclusionLeader region={region}/>
                <button type="button" className="occlusion-anchor editable-anchor" data-anchor-id={region.id}
                  aria-label={`Move anchor ${index + 1}`} style={anchorStyle(region)}
                  onPointerDown={event => begin(event, region, false, true)}
                  onKeyDown={event => {
                    const delta = {ArrowLeft:[-.01,0],ArrowRight:[.01,0],ArrowUp:[0,-.01],ArrowDown:[0,.01]}[event.key];
                    if (!delta) return;
                    event.preventDefault(); event.stopPropagation();
                    const anchor = regionAnchor(region);
                    onChange(updateRegion(value, region.id, {anchor:{x:Math.max(0,Math.min(1,anchor.x+delta[0])),y:Math.max(0,Math.min(1,anchor.y+delta[1]))}}));
                  }}/>
                <div
                  key={region.id}
                  data-region-id={region.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Edit region ${index + 1}`}
                  aria-pressed={selected === region.id}
                  className={
                    "structured-region occlusion-callout editor-region" +
                    (selected === region.id ? " selected-region" : "")
                  }
                  style={calloutStyle(region)}
                  onFocus={() => setSelected(region.id)}
                  onPointerDown={(event) => begin(event, region)}
                  onDoubleClick={()=>editAnswer(region.id)}
                  onKeyDown={(event) => {
                    const delta = {
                      ArrowLeft: [-0.01, 0],
                      ArrowRight: [0.01, 0],
                      ArrowUp: [0, -0.01],
                      ArrowDown: [0, 0.01],
                    }[event.key];
                    if (delta) {
                      event.preventDefault();
                      onChange(
                        updateRegion(
                          value,
                          region.id,
                          event.shiftKey
                            ? {
                                width: Math.min(
                                  1 - region.x,
                                  region.width + delta[0],
                                ),
                                height: Math.min(
                                  1 - region.y,
                                  region.height + delta[1],
                                ),
                              }
                            : {
                                x: region.x + delta[0],
                                y: region.y + delta[1],
                              },
                        ),
                      );
                    } else if (event.key === "Delete") {
                      event.preventDefault();
                      onChange(removeRegion(value, region.id));
                    }
                  }}
                >
                  <span><MathText text={region.answer || `Region ${index + 1}`}/></span>
                  <span
                    className="region-resize"
                    aria-hidden="true"
                    onPointerDown={(event) => begin(event, region, true)}
                  />
                </div>
                </Fragment>
              ))}
            </div>
          </StructuredImage>
        </div>
      </div>
      <div className="structured-tools occlusion-inspector">
        <h4>Regions ({value.regions.length})</h4>
        <ol className="occlusion-region-list">{value.regions.map((region,index)=><li key={region.id}><button type="button" aria-pressed={selected===region.id} onClick={()=>setSelected(region.id)} onDoubleClick={()=>editAnswer(region.id)}><span className="region-color-dot" style={{background:regionColor(region)}}>{index+1}</span><MathText text={region.answer || "Untitled region"}/></button><button type="button" aria-label={`Edit answer ${index+1}`} title="Edit answer" onClick={()=>editAnswer(region.id)}><Pencil size={15}/></button></li>)}</ol>
        {current && (
          <>
            <h4>Region settings</h4>
            <label>
              Answer
              <SmartMathInput
                ref={answerField}
                aria-label="Region answer"
                value={current.answer}
                onChange={(event) =>
                  onChange(
                    updateRegion(value, current.id, {
                      answer: event.target.value,
                    }),
                  )
                }
              />
            </label>
            <label>Label color<input type="color" aria-label="Label color" value={regionColor(current)} onChange={event=>onChange(updateRegion(value,current.id,{color:event.target.value}))}/></label>
            <label>Connector attachment<select aria-label="Connector attachment" value={regionSocket(calloutRegion(current))} onChange={event=>onChange(updateRegion(value,current.id,{socket:event.target.value as Region["socket"]}))}><option value="left">Left center</option><option value="right">Right center</option><option value="top">Top center</option><option value="bottom">Bottom center</option></select></label>
            <button
              type="button"
              aria-label="Delete region" title="Delete selected region"
              onClick={() => {
                onChange(removeRegion(value, current.id));
                setSelected("");
              }}
            >
              <Trash2 size={18}/>
            </button>
          </>
        )}
      </div>
    </section>
  );
}
