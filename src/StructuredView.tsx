import { useEffect, useMemo, useRef, useState } from "react";
import {TableImage} from "./TableImage";
import {TableText} from "./TableText";
import { mediaUrl } from "./native";
import {
  cellValue,
  calloutRegion,
  formatStructuredTitle,
  structuredCellKey,
  structuredTargets,
  targetChoices,
  type StructuredCard,
} from "./structured";
import "./structured.css";
import { MathText } from "./MathText";
import { SmartMathInput } from "./SmartMathField";
import { FormattedCell, cellSurfaceCSS } from "./table-format";
import { OcclusionLeader, calloutStyle, anchorStyle } from "./OcclusionCallout";
import { Fragment } from "react";
import { StructuredChoice } from "./StructuredChoice";
import { AnswerMark } from "./AnswerMark";
import { useStudyMediaSize } from "./media-layout";

export type StructuredViewProps = {
  value: StructuredCard;
  mode: "reference" | "choice" | "typed";
  targetIds?: string[];
  answers?: Record<string, string>;
  onAnswer?: (id: string, answer: string) => void;
  /** Only the session's Check/Submit action should supply results. */
  results?: Record<string, boolean>;
  onSubmit?: () => void;
};

/** The original image and overlay share one box: no object-fit letterboxing drift. */
export function StructuredImage({
  name,
  children,
  onImageSize,
  visualBounds,
}: {
  name: string;
  children: React.ReactNode;
  onImageSize?: (width:number,height:number)=>void;
  visualBounds?: {width:number;height:number};
}) {
  const [loaded, setLoaded] = useState<{ name: string; url: string } | null>(
    null,
  );
  const [failed, setFailed] = useState("");
  const [reason,setReason]=useState("");
  const [dimensions,setDimensions]=useState({name:"",width:0,height:0});
  const frame=useRef<HTMLDivElement>(null);
  const size=useStudyMediaSize(frame,dimensions.name===name?dimensions.width:0,dimensions.name===name?dimensions.height:0,"diagram",visualBounds);
  useEffect(() => {
    let live = true;
    (/^(blob:|data:image\/)/.test(name)
      ? Promise.resolve(name)
      : mediaUrl(name)
    )
      .then((url) => {
        if (live) setLoaded({ name, url });
      })
      .catch((error) => {
        if (live) {setFailed(name);setReason(String(error));}
      });
    return () => {
      live = false;
    };
  }, [name]);
  const url = loaded?.name === name ? loaded.url : "";
  if (!name) return <p>Add an image to draw regions.</p>;
  if (failed === name)
    return (
      <p role="alert">
        Image unavailable. The image reference and regions have been preserved.
        {reason && <small className="structured-image-error">{reason}</small>}
      </p>
    );
  if (!url) return <p role="status">Loading image…</p>;
  return (
    <div ref={frame} className="structured-image" style={!onImageSize && size ? {width:size.width,maxWidth:"none",marginInline:"auto"}:undefined}>
      <img
        src={url}
        alt="Diagram source image"
        draggable={false}
        onLoad={event=>{const {naturalWidth:width,naturalHeight:height}=event.currentTarget;setDimensions({name,width,height});onImageSize?.(width,height);}}
        onError={() => {setFailed(name);setReason("The managed image could not be displayed by the desktop webview.");}}
      />
      {children}
    </div>
  );
}

export function StructuredView({
  value,
  mode,
  targetIds = [],
  answers = {},
  onAnswer,
  results,
  onSubmit,
}: StructuredViewProps) {
  const targets = useMemo(() => structuredTargets(value), [value]);
  const choices = useMemo(
    () =>
      Object.fromEntries(
        targets.map((target) => {
          // Stable per-source permutation: remounting must not change pending choices.
          let seed=2166136261;
          for(const char of target.id+targets.map(t=>t.answer).join("\0"))seed=Math.imul(seed^char.charCodeAt(0),16777619);
          const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
          return [target.id, targetChoices(targets, target,random)];
        }),
      ),
    [targets],
  );
  const active = new Set(mode === "reference" ? [] : targetIds);
  const columns =
    value.type === "table" &&
    value.headerColumn &&
    value.rows.every((_, ri) => !cellValue(value, ri, 0).trim())
      ? value.columns.slice(1)
      : value.type === "table"
        ? value.columns
        : [];
  const content = (id: string, text: string) => {
    const target = targets.find((item) => item.id === id);
    if(mode!=="reference" && target && !active.has(id))return <span className="structured-unrequested" aria-label="Not requested">—</span>;
    if (!active.has(id) || !target)
      return (
        <span className="structured-answer">
          {value.type==="table" && value.images?.[id] && <TableImage name={value.images[id]} cellId={id} layout={value.imageLayouts?.[id]}/>}
          {value.type === "table" ? (
            <TableText position={value.textPositions?.[id]}><FormattedCell text={text} format={value.formats?.[id]} /></TableText>
          ) : (
            <MathText text={text} />
          )}
        </span>
      );
    const checked =
      results !== undefined &&
      Object.prototype.hasOwnProperty.call(results, id);
    const options = choices[id];
    const label = target.label + " answer";
    return (
      <div
        className={
          "structured-response" +
          (checked ? (results[id] ? " correct" : " incorrect") : "")
        }
      >
        {mode === "choice" && options.length > 1 ? (
          <StructuredChoice label={label} options={options} value={answers[id] || ""} disabled={checked} onChange={answer=>onAnswer?.(id,answer)}/>
        ) : (
          <SmartMathInput
            aria-label={label}
            autoComplete="off"
            spellCheck={false}
            placeholder="Type here…"
            value={answers[id] || ""}
            readOnly={checked}
            onChange={(event) => onAnswer?.(id, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.stopPropagation();
                onSubmit?.();
              }
            }}
          />
        )}
        {checked && (
          <span className="structured-feedback" role="status">
            {results[id] ? (
              <AnswerMark correct/>
            ) : (
              <>
                <AnswerMark correct={false}/> <span>Correct answer: <MathText text={text} /></span>
              </>
            )}
          </span>
        )}
      </div>
    );
  };
  return (
    <section
      className="structured-view"
      aria-label={formatStructuredTitle(value)}
    >
      {value.title && (
        <h3>
          <MathText text={value.title} />
        </h3>
      )}
      <p className="structured-kind">
        {value.type === "occlusion"
          ? `Diagrams · ${value.regions.length} regions`
          : `Tables · ${value.rows.length} × ${value.columns.length}`}
      </p>
      {value.type === "occlusion" ? (
        <div className="diagram-study-scroll"><StructuredImage name={value.image} visualBounds={{width:Math.max(1,...value.regions.map(calloutRegion).map(r=>r.x+r.width)),height:Math.max(1,...value.regions.map(calloutRegion).map(r=>r.y+r.height))}}>
          {value.regions.map(calloutRegion).map((region, index) => (
            <Fragment key={region.id}>
            <OcclusionLeader region={region}/>
            <span className="occlusion-anchor" style={anchorStyle(region)} aria-hidden="true"/>
            <div
              key={region.id}
              className={
                "structured-region occlusion-callout" +
                (active.has(region.id) ? " hidden-region" : " reference-region")
              }
              style={calloutStyle(region)}
              aria-label={`Region ${index + 1}`}
            >
              {content(region.id, region.answer)}
            </div>
            </Fragment>
          ))}
        </StructuredImage></div>
      ) : (
        <div className="structured-table-scroll">
          <table
            className={
              value.gridLines ? "structured-table" : "structured-table no-grid"
            }
          >
            <colgroup>
              {value.rows.some(row=>row.name?.trim())&&<col style={{width:100}}/>}
              {columns.map((column) => (
                <col key={column.id} style={{ width: column.size }} />
              ))}
            </colgroup>
            {value.columns.some(column=>column.name?.trim())&&<thead><tr>{value.rows.some(row=>row.name?.trim())&&<th/>}{columns.map(column=><th key={column.id} scope="col"><MathText text={column.name??""}/></th>)}</tr></thead>}
            <tbody>
              {value.rows.map((row, ri) => (
                <tr key={row.id} style={{ height: row.size }}>
                  {value.rows.some(item=>item.name?.trim())&&<th scope="row"><MathText text={row.name??""}/></th>}
                  {columns.map((column) => {
                    const ci = value.columns.findIndex(
                      (c) => c.id === column.id,
                    );
                    const Tag =
                      (value.headerRow && ri === 0) ||
                      (value.headerColumn && ci === 0)
                        ? "th"
                        : "td";
                    return (
                      <Tag
                        key={column.id}
                        style={cellSurfaceCSS(
                          value.formats?.[structuredCellKey(row.id, column.id)],
                        )}
                        scope={
                          Tag === "th" ? (ri === 0 ? "col" : "row") : undefined
                        }
                      >
                        {content(
                          structuredCellKey(row.id, column.id),
                          cellValue(value, ri, ci),
                        )}
                      </Tag>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
