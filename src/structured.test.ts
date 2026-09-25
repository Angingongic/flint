import { describe, expect, it } from "vitest";
import {
  addRegion,
  cellValue,
  clampRegion,
  clearGridCells,
  createGrid,
  createOcclusion,
  gridResize,
  normalizeRect,
  parseStructuredUnit,
  pasteGrid,
  removeGridAxis,
  removeRegion,
  resizeAxis,
  selectTargets,
  setCell,
  structuredTargets,
  structuredUnitId,
  targetChoices,
  updateRegion,
  validStructure,
} from "./structured";

const table = () =>
  pasteGrid(
    createGrid(),
    "Element\tSymbol\tNumber\nHydrogen\tH\t1\nCarbon\tC\t6\nOxygen\tO\t8",
    0,
    0,
  );

describe("structured source knowledge", () => {
  it("stores normalized regions without modifying the image", () => {
    const original = "data:image/png;base64,original";
    let card = addRegion(
      { ...createOcclusion(), image: original },
      normalizeRect({ x: 0.8, y: 0.7 }, { x: 0.2, y: 0.1 }),
    );
    expect(card.regions[0].x).toBe(0.2);
    card = updateRegion(card, card.regions[0].id, {
      answer: "Nucleus",
      x: 0.9,
    });
    expect(card.regions[0].x + card.regions[0].width).toBe(1);
    expect(card.image).toBe(original);
    const restored = JSON.parse(JSON.stringify(card));
    expect(validStructure(restored)).toBe(true);
    expect(restored).toEqual(card);
    expect(removeRegion(card, card.regions[0].id).regions).toEqual([]);
  });
  it("rejects empty and invalid regions, and clamps resizing to image bounds", () => {
    const card = createOcclusion();
    expect(addRegion(card, { x: 0, y: 0, width: 0.001, height: 0.3 })).toBe(
      card,
    );
    expect(addRegion(card, { x: NaN, y: 0, width: 0.2, height: 0.3 })).toBe(
      card,
    );
    expect(validStructure(card)).toBe(false);
    const region = clampRegion({
      id: "region",
      answer: "Cell",
      x: -2,
      y: 2,
      width: 3,
      height: 0.5,
    });
    expect(region).toMatchObject({ x: 0, y: 0.5, width: 1, height: 0.5 });
    expect(
      validStructure({ ...card, image: "cell.png", regions: [region, region] }),
    ).toBe(false);
  });
  it("retains stable cell IDs and layout through resizing, paste and serialization", () => {
    const grid = table(),
      firstRow = grid.rows[1].id;
    let edited = gridResize(grid, "columns", 4);
    edited = resizeAxis(edited, "columns", edited.columns[1].id, 230);
    edited = removeGridAxis(edited, "rows", 2);
    expect(edited.rows[1].id).toBe(firstRow);
    expect(cellValue(edited, 1, 1)).toBe("H");
    expect(cellValue(edited, 2, 1)).toBe("O");
    expect(edited.columns[1].size).toBe(230);
    expect(validStructure(JSON.parse(JSON.stringify(edited)))).toBe(true);
    expect(cellValue(grid, 2, 1)).toBe("C");
  });
  it("pastes trailing blank cells and whitespace faithfully", () => {
    const grid = pasteGrid(table(), " label \t\r\n", 1, 0);
    expect(cellValue(grid, 1, 0)).toBe(" label ");
    expect(cellValue(grid, 1, 1)).toBe("");
    expect(cellValue(grid, 1, 2)).toBe("1");
    expect(grid.rows).toHaveLength(4);
    expect(pasteGrid(grid, "x", -1, 0)).toBe(grid);
  });
  it("clears rectangular selections without destroying axes or headers", () => {
    const grid = table(),
      cleared = clearGridCells(grid, [2, 2], [1, 1]);
    expect(cellValue(cleared, 1, 1)).toBe("");
    expect(cellValue(cleared, 2, 2)).toBe("");
    expect(cellValue(cleared, 0, 1)).toBe("Symbol");
    expect(cleared.rows).toBe(grid.rows);
    expect(gridResize(grid, "rows", NaN)).toBe(grid);
  });
  it("rejects unsupported versions, malformed layouts and orphan cells", () => {
    const grid = table();
    for (const invalid of [
      null,
      {},
      { ...grid, version: 2 },
      { ...grid, cells: { orphan: "bad" } },
      { ...grid, rows: [null] },
      { ...grid, columns: [{ id: "x:y", size: 40 }] },
    ])
      expect(validStructure(invalid)).toBe(false);
  });
});

describe("derived study targets", () => {
  it("uses knowledge cells without blanking headers or removing identifying context", () => {
    const grid = table(),
      targets = structuredTargets(grid);
    expect(targets).toHaveLength(6);
    expect(targets.map((t) => t.answer)).toEqual([
      "H",
      "1",
      "C",
      "6",
      "O",
      "8",
    ]);
    const chosen = selectTargets(grid, undefined, () => 0.5);
    expect(chosen).toHaveLength(2);
    // A midpoint random draw requests two targets; row headers retain context.
    expect(chosen.every(t=>targets.some(candidate=>candidate.id===t.id))).toBe(true);
    expect(chosen.every(t=>t.label.includes(" · "))).toBe(true);
    expect(targets[0].label).toBe("Hydrogen · Symbol");
  });
  it("does not derive ambiguous cells or cells without context", () => {
    const ambiguous = pasteGrid(
      createGrid(3, 2),
      "Element\tSymbol\nSame\tA\nSame\tB",
      0,
      0,
    );
    expect(structuredTargets(ambiguous)).toEqual([]);
    const isolated = setCell(createGrid(), 1, 1, "Unknown");
    expect(structuredTargets(isolated)).toEqual([]);
  });
  it("offers unique distractors of the same column, including the correct answer", () => {
    const targets = structuredTargets(table());
    expect(
      targetChoices([...targets, targets[0]], targets[0], () => 0.1).sort(),
    ).toEqual(["C", "H", "O"]);
    const id = structuredUnitId("parent", targets[0].id);
    expect(parseStructuredUnit(id)).toEqual(["parent", targets[0].id]);
    expect(parseStructuredUnit("ordinary-card-id")).toBeNull();
  });
});
