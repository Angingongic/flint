import { type CSSProperties } from "react";
import { MathText } from "./MathText";
import { mathRuns } from "./math";
import { type TableCard, structuredCellKey } from "./structured";
export type TextStyle = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
};
export type CellStyle = TextStyle & {
  align?: "left" | "center" | "right";
  background?: string;
};
export type TextRun = { start: number; end: number; style: TextStyle };
export type CellFormat = CellStyle & { runs?: TextRun[] };
export function formatCSS(style: CellStyle = {}): CSSProperties {
  return {
    fontWeight: style.bold === undefined ? undefined : style.bold ? 700 : 400,
    fontStyle:
      style.italic === undefined
        ? undefined
        : style.italic
          ? "italic"
          : "normal",
    textDecoration:
      [style.underline ? "underline" : "", style.strike ? "line-through" : ""]
        .filter(Boolean)
        .join(" ") ||
      (style.underline !== undefined || style.strike !== undefined
        ? "none"
        : undefined),
    color: style.color,
    backgroundColor: style.background,
    textAlign: style.align,
  };
}
/** Decorations belong to text leaves: ancestor decorations cannot be cancelled by a run. */
export function cellSurfaceCSS(style: CellStyle = {}): CSSProperties {
  return { backgroundColor: style.background, textAlign: style.align };
}
export function formatCells(
  grid: TableCard,
  a: [number, number],
  b: [number, number],
  patch: CellStyle | null,
  range?: { start: number; end: number },
): TableCard {
  const formats = { ...grid.formats };
  for (let r = Math.min(a[0], b[0]); r <= Math.max(a[0], b[0]); r++)
    for (let c = Math.min(a[1], b[1]); c <= Math.max(a[1], b[1]); c++) {
      if (!grid.rows[r] || !grid.columns[c]) continue;
      const key = structuredCellKey(grid.rows[r].id, grid.columns[c].id),
        old = formats[key] || {};
      if (!patch) {
        delete formats[key];
        continue;
      }
      if (
        range &&
        range.end > range.start &&
        a[0] === b[0] &&
        a[1] === b[1] &&
        !patch.align &&
        !patch.background
      ) {
        const text = grid.cells[key] || "",
          start = Math.max(0, Math.min(text.length, range.start)),
          end = Math.min(text.length, range.end);
        const points = [
          ...new Set([
            0,
            text.length,
            start,
            end,
            ...(old.runs || []).flatMap((s) => [s.start, s.end]),
          ]),
        ].sort((x, y) => x - y);
        const runs: TextRun[] = [];
        for (let i = 0; i < points.length - 1; i++) {
          const left = points[i],
            right = points[i + 1];
          const style = Object.assign(
            {},
            ...(old.runs || [])
              .filter((s) => s.start <= left && s.end >= right)
              .map((s) => s.style),
            left >= start && right <= end ? patch : {},
          );
          if (Object.keys(style).length)
            runs.push({ start: left, end: right, style });
        }
        formats[key] = { ...old, runs };
      } else formats[key] = { ...old, ...patch };
    }
  return { ...grid, formats };
}
/** Keep math layout intact: a selected fragment of a formula styles that math island. */
export function FormattedCell({
  text,
  format,
  math = true,
}: {
  text: string;
  format?: CellFormat;
  math?: boolean;
}) {
  let offset = 0;
  return (
    <span
      className="formatted-cell"
      style={{ backgroundColor: format?.background, textAlign: format?.align }}
    >
      {mathRuns(text).map((run, index) => {
        const start = offset;
        offset += run.source.length;
        const spans =
          format?.runs?.filter((s) => s.end > start && s.start < offset) || [];
        if (run.node && math)
          return (
            <span
              key={index}
              style={formatCSS(
                Object.assign({}, format, ...spans.map((s) => s.style)),
              )}
            >
              <MathText text={run.source} />
            </span>
          );
        const ends = [
          ...new Set([
            start,
            offset,
            ...spans.flatMap((s) => [
              Math.max(start, s.start),
              Math.min(offset, s.end),
            ]),
          ]),
        ].sort((a, b) => a - b);
        return ends.slice(0, -1).map((left, i) => (
          <span
            key={`${index}-${i}`}
            style={formatCSS(
              Object.assign(
                {},
                format,
                ...spans
                  .filter((s) => s.start <= left && s.end >= ends[i + 1])
                  .map((s) => s.style),
              ),
            )}
          >
            {text.slice(left, ends[i + 1])}
          </span>
        ));
      })}
    </span>
  );
}
