// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  createGrid,
  pasteGrid,
  gridResize,
  removeGridAxis,
  setCell,
  structuredCellKey,
  validStructure,
} from "./structured";
import { FormattedCell, formatCells } from "./table-format";
afterEach(cleanup);
const sample = () =>
  pasteGrid(createGrid(2, 2), "Name\tValue\nExample\tabcdef", 0, 0);
describe("persistent table formatting", () => {
  it("removes stale formats when shrinking either axis", () => {
    let grid = formatCells(sample(), [0, 0], [1, 1], { bold: true });
    expect(Object.keys(grid.formats!)).toHaveLength(4);
    grid = gridResize(grid, "rows", 1);
    expect(Object.keys(grid.formats!)).toHaveLength(2);
    grid = removeGridAxis(grid, "columns", 1);
    expect(Object.keys(grid.formats!)).toHaveLength(1);
  });
  it("keeps formatting and ranges through serialization and source edits", () => {
    let grid = formatCells(
      sample(),
      [1, 1],
      [1, 1],
      { italic: true },
      { start: 2, end: 5 },
    );
    grid = JSON.parse(JSON.stringify(grid));
    expect(validStructure(grid)).toBe(true);
    grid = setCell(grid, 1, 1, "a");
    expect(validStructure(grid)).toBe(true);
    expect(
      grid.formats![structuredCellKey(grid.rows[1].id, grid.columns[1].id)]
        .runs,
    ).toEqual([]);
  });
  it("lets text runs turn off whole-cell bold and underline", () => {
    render(
      <FormattedCell
        text="abc def"
        format={{
          bold: true,
          underline: true,
          runs: [
            { start: 4, end: 7, style: { bold: false, underline: false } },
          ],
        }}
      />,
    );
    expect(screen.getByText("abc").style.fontWeight).toBe("700");
    expect(screen.getByText("def").style.fontWeight).toBe("400");
    expect(screen.getByText("def").style.textDecoration).toBe("none");
    expect(screen.getByText("def").parentElement!.style.textDecoration).toBe(
      "",
    );
  });
  it("rejects invalid styles, stale coordinates, and overlapping ranges", () => {
    const grid = sample(),
      key = structuredCellKey(grid.rows[1].id, grid.columns[1].id);
    for (const format of [
      { color: "url(bad)" },
      { bold: "yes" },
      { runs: [{ start: 0, end: 7, style: { bold: true } }] },
      {
        runs: [
          { start: 0, end: 3, style: {} },
          { start: 2, end: 4, style: {} },
        ],
      },
    ]) {
      expect(validStructure({ ...grid, formats: { [key]: format } })).toBe(
        false,
      );
    }
    expect(
      validStructure({ ...grid, formats: { missing: { bold: true } } }),
    ).toBe(false);
  });
});
