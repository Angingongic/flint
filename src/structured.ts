/** Source knowledge, not generated ordinary cards. Geometry is normalized to the image. */
import type { CellFormat } from "./table-format";
import type { ImageLayout } from "./table-media";
export type Region = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  answer: string;
  /** Optional for legacy rectangles. Normalized independently from the label. */
  anchor?: { x: number; y: number };
  color?: string;
  socket?: "left" | "right" | "top" | "bottom";
};
export type ImageOcclusion = {
  version: 1;
  type: "occlusion";
  image: string;
  regions: Region[];
  title: string;
};
export type TableAxis = { id: string; size: number; name?: string };
export type TableCard = {
  version: 1;
  type: "table";
  title: string;
  rows: TableAxis[];
  columns: TableAxis[];
  cells: Record<string, string>;
  images?: Record<string,string>;
  imageLayouts?: Record<string,ImageLayout>;
  textPositions?: Record<string,{x:number;y:number}>;
  formats?: Record<string, CellFormat>;
  headerRow: boolean;
  headerColumn: boolean;
  gridLines: boolean;
};
export type StructuredCard = ImageOcclusion | TableCard;
export type Target = {
  id: string;
  answer: string;
  label: string;
  column?: string;
  row?: string;
  context: string;
};
export type TargetState = {
  correct: number;
  incorrect: number;
  recognition: boolean;
  recall: boolean;
  lastSeen: string | null;
  answer: string;
  attempts: number;
};
export type StructuredProgress = Record<string, TargetState>;
export type TargetProgress = {
  cardId: string;
  targetId: string;
  correct: boolean;
  kind: "choice" | "typed";
  answer: string;
  sourceAnswer: string;
  at: string;
};
export const structuredCellKey = (row: string, column: string) =>
  row + ":" + column;
export const createAxis = (size: number): TableAxis => ({
  id: crypto.randomUUID(),
  size,
});
export const createGrid = (rows = 4, columns = 3): TableCard => ({
  version: 1,
  type: "table",
  title: "",
  rows: Array.from({ length: Math.max(2, Math.min(100, rows)) }, () =>
    createAxis(44),
  ),
  columns: Array.from({ length: Math.max(2, Math.min(20, columns)) }, () =>
    createAxis(160),
  ),
  cells: {},
  headerRow: true,
  headerColumn: true,
  gridLines: true,
});
export const createOcclusion = (): ImageOcclusion => ({
  version: 1,
  type: "occlusion",
  title: "",
  image: "",
  regions: [],
});
export const getCell = (grid: TableCard, row: string, column: string) =>
  grid.cells[structuredCellKey(row, column)] || "";
export function cellValue(grid: TableCard, row: number, column: number) {
  const r = grid.rows[row],
    c = grid.columns[column];
  return r && c ? getCell(grid, r.id, c.id) : "";
}
export function setCell(
  grid: TableCard,
  row: number,
  column: number,
  value: string,
): TableCard {
  const r = grid.rows[row],
    c = grid.columns[column];
  if (!r || !c) return grid;
  const key = structuredCellKey(r.id, c.id),
    before = grid.cells[key] || "",
    after = value.slice(0, 10000),
    format = grid.formats?.[key];
  let prefix = 0;
  while (
    prefix < before.length &&
    prefix < after.length &&
    before[prefix] === after[prefix]
  )
    prefix++;
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  )
    suffix++;
  const delta = after.length - before.length;
  const formats = format?.runs
    ? {
        ...grid.formats,
        [key]: {
          ...format,
          runs: format.runs
            .map((run) => ({
              ...run,
              start:
                run.start <= prefix
                  ? run.start
                  : run.start >= before.length - suffix
                    ? run.start + delta
                    : prefix,
              end:
                run.end <= prefix
                  ? run.end
                  : run.end >= before.length - suffix
                    ? run.end + delta
                    : after.length - suffix,
            }))
            .filter((run) => run.end > run.start),
        },
      }
    : grid.formats;
  return {
    ...grid,
    ...(formats ? { formats } : {}),
    cells: {
      ...grid.cells,
      [key]: after,
    },
  };
}
export function setCellImage(grid:TableCard,row:number,column:number,name:string|null):TableCard {
  if(!grid.rows[row] || !grid.columns[column])return grid;
  const images={...grid.images},key=structuredCellKey(grid.rows[row].id,grid.columns[column].id);
  if(name)images[key]=name;else delete images[key];
  const imageLayouts={...grid.imageLayouts};delete imageLayouts[key];
  return {...grid,images,...(grid.imageLayouts?{imageLayouts}:{})};
}
export function gridResize(
  grid: TableCard,
  axis: "rows" | "columns",
  count: number,
): TableCard {
  if (!Number.isFinite(count)) return grid;
  const max = axis === "rows" ? 100 : 20,
    nextCount = Math.max(1, Math.min(max, Math.floor(count)));
  const items = Array.from(
    { length: nextCount },
    (_, i) => grid[axis][i] || createAxis(axis === "rows" ? 44 : 160),
  );
  const next = { ...grid, [axis]: items };
  const legal = new Set(
    next.rows.flatMap((r) =>
      next.columns.map((c) => structuredCellKey(r.id, c.id)),
    ),
  );
  return {
    ...next,
    ...(next.textPositions?{textPositions:Object.fromEntries(Object.entries(next.textPositions).filter(([key])=>legal.has(key)))}:{}),
    ...(next.imageLayouts?{imageLayouts:Object.fromEntries(Object.entries(next.imageLayouts).filter(([key])=>legal.has(key)))}:{}),
    ...(next.images?{images:Object.fromEntries(Object.entries(next.images).filter(([key])=>legal.has(key)))}:{}),
    ...(next.formats
      ? {
          formats: Object.fromEntries(
            Object.entries(next.formats).filter(([key]) => legal.has(key)),
          ),
        }
      : {}),
    cells: Object.fromEntries(
      Object.entries(next.cells).filter(([k]) => legal.has(k)),
    ),
  };
}
export function removeGridAxis(
  grid: TableCard,
  axis: "rows" | "columns",
  index: number,
): TableCard {
  if (grid[axis].length <= 1 || index < 0 || index >= grid[axis].length)
    return grid;
  const next = { ...grid, [axis]: grid[axis].filter((_, i) => i !== index) };
  const legal = new Set(
    next.rows.flatMap((r) =>
      next.columns.map((c) => structuredCellKey(r.id, c.id)),
    ),
  );
  return {
    ...next,
    ...(next.textPositions?{textPositions:Object.fromEntries(Object.entries(next.textPositions).filter(([key])=>legal.has(key)))}:{}),
    ...(next.imageLayouts?{imageLayouts:Object.fromEntries(Object.entries(next.imageLayouts).filter(([key])=>legal.has(key)))}:{}),
    ...(next.images?{images:Object.fromEntries(Object.entries(next.images).filter(([key])=>legal.has(key)))}:{}),
    ...(next.formats
      ? {
          formats: Object.fromEntries(
            Object.entries(next.formats).filter(([key]) => legal.has(key)),
          ),
        }
      : {}),
    cells: Object.fromEntries(
      Object.entries(next.cells).filter(([key]) => legal.has(key)),
    ),
  };
}
export function resizeAxis(
  grid: TableCard,
  axis: "rows" | "columns",
  id: string,
  size: number,
): TableCard {
  if (!Number.isFinite(size)) return grid;
  return {
    ...grid,
    [axis]: grid[axis].map((item) =>
      item.id === id
        ? {
            ...item,
            size: Math.round(
              Math.max(
                axis === "rows" ? 32 : 64,
                Math.min(axis === "rows" ? 240 : 640, size),
              ),
            ),
          }
        : item,
    ),
  };
}
/** Additive axis names never overwrite authored cell contents or historical IDs. */
export function nameGridAxis(grid: TableCard, axis: "rows" | "columns", index: number, name: string): TableCard {
  return {...grid,[axis]:grid[axis].map((item,i)=>i===index?{...item,name:name.slice(0,1000)}:item)};
}
export function insertGridAxis(grid: TableCard, axis: "rows" | "columns", index: number, duplicate?: number): TableCard {
  if(grid[axis].length >= (axis==="rows"?100:20)) return grid;
  const source=duplicate===undefined?undefined:grid[axis][duplicate];
  const item={...(source||createAxis(axis==="rows"?44:160)),id:crypto.randomUUID()};
  const items=[...grid[axis]];items.splice(Math.max(0,Math.min(items.length,index)),0,item);
  const cells={...grid.cells},formats={...grid.formats},images={...grid.images},imageLayouts={...grid.imageLayouts},textPositions={...grid.textPositions};
  if(source){for(const other of grid[axis==="rows"?"columns":"rows"]){
    const key=axis==="rows"?structuredCellKey(source.id,other.id):structuredCellKey(other.id,source.id);
    const next=axis==="rows"?structuredCellKey(item.id,other.id):structuredCellKey(other.id,item.id);
    if(key in cells) cells[next]=cells[key];
    if(key in images) images[next]=images[key];
    if(key in imageLayouts)imageLayouts[next]={...imageLayouts[key]};
    if(key in textPositions)textPositions[next]={...textPositions[key]};
    if(formats[key]) formats[next]=structuredClone(formats[key]);
  }}
  return {...grid,[axis]:items,cells,...(grid.formats?{formats}:{}),...(grid.images?{images}:{}),...(grid.imageLayouts?{imageLayouts}:{}),...(grid.textPositions?{textPositions}:{})};
}
/** TSV paste grows the table while preserving stable identities and header options. */
export function pasteGrid(
  grid: TableCard,
  text: string,
  row: number,
  column: number,
): TableCard {
  if (
    !Number.isInteger(row) ||
    !Number.isInteger(column) ||
    row < 0 ||
    column < 0 ||
    row >= 100 ||
    column >= 20
  )
    return grid;
  const lines = text
    .replace(/\r\n?/g, "\n")
    .replace(/\n$/, "")
    .split("\n")
    .slice(0, 100 - row)
    .map((line) => line.split("\t").slice(0, 20 - column));
  let next = gridResize(
    gridResize(grid, "rows", Math.max(grid.rows.length, row + lines.length)),
    "columns",
    Math.max(
      grid.columns.length,
      column + Math.max(...lines.map((l) => l.length)),
    ),
  );
  lines.forEach((line, ri) =>
    line.forEach((value, ci) => {
      next = setCell(next, row + ri, column + ci, value);
    }),
  );
  return next;
}
export function clearGridCells(
  grid: TableCard,
  a: [number, number],
  b: [number, number],
): TableCard {
  let next = grid;
  for (let r = Math.min(a[0], b[0]); r <= Math.max(a[0], b[0]); r++)
    for (let c = Math.min(a[1], b[1]); c <= Math.max(a[1], b[1]); c++)
      next = setCellImage(setCell(next, r, c, ""),r,c,null);
  return next;
}
export const normalizeRect = (
  a: { x: number; y: number },
  b: { x: number; y: number },
) => {
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  const x = clamp(Math.min(a.x, b.x)),
    y = clamp(Math.min(a.y, b.y));
  const width = clamp(Math.max(a.x, b.x)) - x,
    height = clamp(Math.max(a.y, b.y)) - y;
  return { x, y, width, height };
};
export function clampRegion(region: Region): Region {
  const width = Math.max(0.015, Math.min(1, region.width)),
    height = Math.max(0.015, Math.min(1, region.height));
  return {
    ...region,
    width,
    height,
    x: Math.max(0, Math.min(1 - width, region.x)),
    y: Math.max(0, Math.min(1 - height, region.y)),
    answer: region.answer.slice(0, 10000),
  };
}
/** Old rectangles keep their authored bounds and target identity, without rewriting files. */
export const regionAnchor = (region: Region) => region.anchor ?? {
  x: region.x + region.width / 2,
  y: region.y + region.height / 2,
};
export const regionColors = ["#8b78ff","#ffbc43","#ee6aca","#53cb92","#50b8eb","#ff8866"] as const;
export function regionColor(region: Region): string {
  if (region.color) return region.color;
  let hash=0; for(const character of region.id) hash=(hash*31+character.charCodeAt(0))>>>0;
  return regionColors[hash%regionColors.length];
}
export const regionSocket = (region:Region) => region.socket ?? (regionAnchor(region).x < region.x+region.width/2 ? "left" : "right");
export function regionConnector(region:Region) {
  const socket=regionSocket(region);
  return {x:region.x+region.width*(socket==="left"?0:socket==="right"?1:.5),y:region.y+region.height*(socket==="top"?0:socket==="bottom"?1:.5)};
}
export function calloutRegion(region: Region): Region {
  if (region.anchor) return {...region,socket:regionSocket(region)};
  const anchor = regionAnchor(region);
  return {...region,anchor,socket:anchor.x<.5?"left":"right",
    x:Math.max(0,Math.min(.78,anchor.x < .5 ? anchor.x + .08 : anchor.x - .30)),
    y:Math.max(0,Math.min(.92,anchor.y - .04)),width:.22,height:.08};
}
export function addCallout(card: ImageOcclusion, anchor: { x: number; y: number }): ImageOcclusion {
  if (![anchor.x, anchor.y].every(n => Number.isFinite(n) && n >= 0 && n <= 1)) return card;
  const next = addRegion(card, {
    x: Math.max(0, Math.min(.78, anchor.x < .5 ? anchor.x + .08 : anchor.x - .30)),
    y: Math.max(0, Math.min(.92, anchor.y - .04)), width: .22, height: .08,
  });
  return next === card ? card : {...next,regions:next.regions.map((region,index)=>index===next.regions.length-1?{...region,anchor,socket:anchor.x<.5?"left":"right",color:regionColors[Math.floor(Math.random()*regionColors.length)]}:region)};
}
export function addRegion(
  card: ImageOcclusion,
  rect: Pick<Region, "x" | "y" | "width" | "height">,
): ImageOcclusion {
  if (
    card.regions.length >= 200 ||
    !Object.values(rect).every(Number.isFinite) ||
    rect.width < 0.015 ||
    rect.height < 0.015
  )
    return card;
  return {
    ...card,
    regions: [
      ...card.regions,
      clampRegion({ ...rect, id: crypto.randomUUID(), answer: "" }),
    ],
  };
}
export function updateRegion(
  card: ImageOcclusion,
  id: string,
  patch: Partial<Omit<Region, "id">>,
): ImageOcclusion {
  if (
    (patch.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(patch.color)) ||
    (patch.socket !== undefined && !["left","right","top","bottom"].includes(patch.socket)) ||
    (patch.anchor !== undefined && (!patch.anchor || ![patch.anchor.x, patch.anchor.y].every(n => Number.isFinite(n) && n >= 0 && n <= 1))) ||
    [patch.x, patch.y, patch.width, patch.height].some(
      (n) => n !== undefined && !Number.isFinite(n),
    )
  )
    return card;
  return {
    ...card,
    regions: card.regions.map((region) =>
      region.id === id ? clampRegion({ ...calloutRegion(region), ...patch }) : region,
    ),
  };
}
export function removeRegion(card: ImageOcclusion, id: string): ImageOcclusion {
  return {
    ...card,
    regions: card.regions.filter((region) => region.id !== id),
  };
}
export const formatStructuredTitle = (value: StructuredCard) =>
  value.title.trim() ||
  (value.type === "occlusion" ? "Diagrams" : "Tables");
export const structuredSourceImage = (value?: StructuredCard | null) =>
  value?.type === "occlusion" ? value.image : null;
export function structuredTargets(value?: StructuredCard | null): Target[] {
  if (!value) return [];
  if (value.type === "occlusion")
    return value.regions.flatMap((r, i) =>
      r.answer.trim()
        ? [
            {
              id: r.id,
              answer: r.answer,
              label: "Region " + (i + 1),
              context: formatStructuredTitle(value),
            },
          ]
        : [],
    );
  const out: Target[] = [];
  value.rows.forEach((r, ri) =>
    value.columns.forEach((c, ci) => {
      if ((ri === 0 && value.headerRow) || (ci === 0 && value.headerColumn))
        return;
      const answer = getCell(value, r.id, c.id);
      if (!answer.trim()) return;
      const rowOthers = value.columns
        .filter((other) => other.id !== c.id)
        .map((other) => getCell(value, r.id, other.id))
        .filter((s) => s.trim());
      if (!rowOthers.length) return;
      const context = JSON.stringify(
        value.columns
          .filter((other) => other.id !== c.id)
          .map((other) =>
            getCell(value, r.id, other.id)
              .trim()
              .normalize("NFC")
              .toLowerCase(),
          ),
      );
      // Do not hide a value if indistinguishable rows require different answers.
      const ambiguous = value.rows.some(
        (other, i) =>
          other.id !== r.id &&
          (!value.headerRow || i > 0) &&
          getCell(value, other.id, c.id).trim().toLowerCase() !==
            answer.trim().toLowerCase() &&
          JSON.stringify(
            value.columns
              .filter((col) => col.id !== c.id)
              .map((col) =>
                getCell(value, other.id, col.id)
                  .trim()
                  .normalize("NFC")
                  .toLowerCase(),
              ),
          ) === context,
      );
      if (ambiguous) return;
      const columnName = c.name ?? (value.headerRow
        ? cellValue(value, 0, ci)
        : "Column " + (ci + 1));
      const rowName = r.name ?? (value.headerColumn
        ? cellValue(value, ri, 0)
        : "Row " + (ri + 1));
      out.push({
        id: structuredCellKey(r.id, c.id),
        answer,
        label:
          (rowName || "Row " + (ri + 1)) +
          " · " +
          (columnName || "Column " + (ci + 1)),
        column: c.id,
        row: r.id,
        context,
      });
    }),
  );
  return out;
}
export function targetContext(
  value: StructuredCard,
  id: string,
): Target | undefined {
  return structuredTargets(value).find((t) => t.id === id);
}
export function targetChoices(
  targets: Target[],
  target: Target,
  random = Math.random,
): string[] {
  const norm = (s: string) => s.trim().normalize("NFC").toLowerCase();
  const unique = Array.from(
    new Map(
      targets
        .filter((t) => !target.column || t.column === target.column)
        .map((t) => [norm(t.answer), t.answer]),
    ).values(),
  );
  const correct = target.answer;
  const pool = unique.filter((s) => norm(s) !== norm(correct));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const result = [correct, ...pool.slice(0, 3)];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
/** One hidden cell per row retains identifying context; never blank headers. */
export function selectTargets(
  value: StructuredCard,
  max?: number,
  random = Math.random,
): Target[] {
  const pool = structuredTargets(value);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const limit =
    max ??
    (pool.length ? 1+Math.floor(random()*Math.min(3,pool.length)) : 0);
  const usedRows = new Map<string, number>();
  return pool
    .filter((t) => {
      if (t.row && value.type === "table") {
        const populated = value.columns.filter((c) =>
          getCell(value, t.row!, c.id).trim(),
        ).length;
        const hidden = usedRows.get(t.row) || 0;
        if (hidden >= populated - 1) return false;
        usedRows.set(t.row, hidden + 1);
      }
      return true;
    })
    .slice(0, limit);
}
export function structuredUnitId(cardId: string, targetId: string) {
  return JSON.stringify([cardId, targetId]);
}
export function parseStructuredUnit(id: string): [string, string] | null {
  try {
    const parsed = JSON.parse(id);
    return Array.isArray(parsed) &&
      parsed.length === 2 &&
      parsed.every((v) => typeof v === "string")
      ? [parsed[0], parsed[1]]
      : null;
  } catch {
    return null;
  }
}
export function changedKnowledge(oldAnswer: string, newAnswer: string) {
  return (
    oldAnswer.normalize("NFC").trim() !== newAnswer.normalize("NFC").trim()
  );
}
export function structuredSignature(value: StructuredCard) {
  return JSON.stringify(structuredTargets(value).map((t) => [t.id, t.answer]));
}
/** Validate before save and before accepting imported structures. */
export function validStructure(value: unknown): value is StructuredCard {
  if (!value || typeof value !== "object") return false;
  const v = value as StructuredCard;
  if (v.version !== 1 || typeof v.title !== "string" || v.title.length > 1000)
    return false;
  const validId = (id: unknown): id is string =>
    typeof id === "string" &&
    id.length > 0 &&
    id.length <= 180 &&
    !id.includes(":");
  const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);
  if (v.type === "occlusion") {
    if (
      typeof v.image !== "string" ||
      !v.image ||
      !Array.isArray(v.regions) ||
      v.regions.length < 1 ||
      v.regions.length > 200
    )
      return false;
    const ids = new Set<string>();
    for (const r of v.regions) {
      if (
        !r ||
        !validId(r.id) ||
        ids.has(r.id) ||
        typeof r.answer !== "string" ||
        !r.answer.trim() ||
        r.answer.length > 10000 ||
        (r.color !== undefined && (typeof r.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(r.color))) ||
        (r.socket !== undefined && !["left","right","top","bottom"].includes(r.socket)) ||
        (r.anchor !== undefined && (!r.anchor || ![r.anchor.x, r.anchor.y].every(n => finite(n) && n >= 0 && n <= 1))) ||
        ![r.x, r.y, r.width, r.height].every(finite) ||
        r.x < 0 ||
        r.y < 0 ||
        r.width < 0.015 ||
        r.height < 0.015 ||
        r.x + r.width > 1.000001 ||
        r.y + r.height > 1.000001
      )
        return false;
      ids.add(r.id);
    }
    return true;
  }
  if (
    v.type !== "table" ||
    !Array.isArray(v.rows) ||
    !Array.isArray(v.columns) ||
    !v.cells ||
    typeof v.cells !== "object" ||
    Array.isArray(v.cells) ||
    v.rows.length < 1 ||
    v.rows.length > 100 ||
    v.columns.length < 1 ||
    v.columns.length > 20
  )
    return false;
  if (
    [v.headerRow, v.headerColumn, v.gridLines].some(
      (flag) => typeof flag !== "boolean",
    )
  )
    return false;
  for (const axis of [v.rows, v.columns]) {
    const ids = new Set<string>();
    for (const a of axis) {
      if (
        !a ||
        !validId(a.id) ||
        (a.name !== undefined && (typeof a.name !== "string" || a.name.length > 1000)) ||
        ids.has(a.id) ||
        !finite(a.size) ||
        a.size < 24 ||
        a.size > 640
      )
        return false;
      ids.add(a.id);
    }
  }
  const legal = new Set(
    v.rows.flatMap((r) => v.columns.map((c) => structuredCellKey(r.id, c.id))),
  );
  if(v.images!==undefined && (!v.images || typeof v.images!=="object" || Array.isArray(v.images) || Object.entries(v.images).some(([key,name])=>!legal.has(key)||typeof name!=="string"||!name)))return false;
  if(v.textPositions!==undefined && (!v.textPositions || typeof v.textPositions!=="object" || Array.isArray(v.textPositions) || Object.entries(v.textPositions).some(([key,p])=>!legal.has(key)||!p||![p.x,p.y].every(n=>finite(n)&&n>=0&&n<=640))))return false;
  if(v.imageLayouts!==undefined && (!v.imageLayouts || typeof v.imageLayouts!=="object" || Array.isArray(v.imageLayouts) || Object.entries(v.imageLayouts).some(([key,l])=>!v.images?.[key] || !l || ![l.x,l.y,l.width].every(finite) || l.x<0 || l.x>640 || l.y<0 || l.y>640 || l.width<24 || l.width>640)))return false;
  if(Object.values(v.imageLayouts||{}).some(l=>l.crop!==undefined && (!l.crop || ![l.crop.x,l.crop.y,l.crop.width,l.crop.height].every(finite) || l.crop.x<0 || l.crop.y<0 || l.crop.width<.05 || l.crop.height<.05 || l.crop.x+l.crop.width>1.000001 || l.crop.y+l.crop.height>1.000001)))return false;
  if (
    Object.entries(v.cells).some(
      ([key, value]) =>
        !legal.has(key) || typeof value !== "string" || value.length > 10000,
    )
  )
    return false;
  if (v.formats !== undefined) {
    if (!v.formats || typeof v.formats !== "object" || Array.isArray(v.formats))
      return false;
    const styleValid = (style: unknown, cell: boolean): boolean => {
      if (!style || typeof style !== "object" || Array.isArray(style))
        return false;
      return Object.entries(style).every(([key, item]) => {
        if (["bold", "italic", "underline", "strike"].includes(key))
          return typeof item === "boolean";
        if (key === "color" || (cell && key === "background"))
          return typeof item === "string" && /^#[0-9a-f]{6}$/i.test(item);
        if (cell && key === "align")
          return ["left", "center", "right"].includes(item);
        return cell && key === "runs";
      });
    };
    for (const [key, format] of Object.entries(v.formats)) {
      if (!legal.has(key) || !styleValid(format, true)) return false;
      if (format.runs !== undefined) {
        if (!Array.isArray(format.runs) || format.runs.length > 10000)
          return false;
        let end = 0;
        for (const run of format.runs) {
          if (
            !run ||
            !Number.isInteger(run.start) ||
            !Number.isInteger(run.end) ||
            run.start < end ||
            run.end <= run.start ||
            run.end > (v.cells[key] || "").length ||
            !styleValid(run.style, false)
          )
            return false;
          end = run.end;
        }
      }
    }
  }
  return structuredTargets(v).length > 0;
}
export function structureContent(value: StructuredCard) {
  return value.type === "occlusion"
    ? [value.title, ...value.regions.map((r) => r.answer)].join(" ")
    : [value.title, ...Object.values(value.cells)].join(" ");
}
