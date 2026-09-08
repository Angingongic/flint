import { describe, it, expect } from "vitest";
import { presets, presetFor, normalizeCover } from "./covers";
describe("bundled cover identity", () => {
  it("ships 24 unique original SVG covers with no remote references", () => {
    expect(presets).toHaveLength(24);
    expect(new Set(presets.map((p) => p.url)).size).toBe(24);
    expect(presets.every((p) => p.url.startsWith("data:image/svg+xml,"))).toBe(
      true,
    );
  });
  it("deterministically migrates existing coverless sets and respects selections", () => {
    const deck = {
      id: "existing-color-set",
      title: "Colors",
      subject: "",
      color: "",
      cards: [],
    };
    const migrated = normalizeCover(deck);
    expect(normalizeCover(migrated)).toEqual(migrated);
    expect(presetFor(deck).id).toBe(migrated.coverImage);
    expect(presetFor({ ...deck, coverImage: presets[4].id }).id).toBe(
      presets[4].id,
    );
    expect(
      normalizeCover({ ...deck, coverImage: "upload.png" }).coverImage,
    ).toBe("upload.png");
  });
});
