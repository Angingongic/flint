import { describe, expect, it } from "vitest";
import { addCallout, createOcclusion, regionAnchor, regionConnector, regionColor, regionColors, structuredSignature, updateRegion, validStructure, type ImageOcclusion } from "./structured";

describe("persistent callout geometry", () => {
  const legacy: ImageOcclusion = {...createOcclusion(), image:"original.png", regions:[{id:"stable",answer:"Nucleus",x:.2,y:.3,width:.2,height:.1}]};
  it("reads legacy rectangles without rewriting their schema or target identity", () => {
    const before = JSON.stringify(legacy);
    expect(regionAnchor(legacy.regions[0]).x).toBeCloseTo(.3);
    expect(JSON.stringify(legacy)).toBe(before);
    expect(validStructure(legacy)).toBe(true);
    const moved = updateRegion(legacy,"stable",{x:.7});
    expect(regionAnchor(moved.regions[0])).toEqual(regionAnchor(legacy.regions[0]));
    expect(structuredSignature(moved)).toBe(structuredSignature(legacy));
  });
  it("stores the initial click as anchor and moves endpoints independently", () => {
    let card = addCallout({...createOcclusion(),image:"original.png"},{x:.95,y:.03});
    const id = card.regions[0].id;
    card = updateRegion(card,id,{answer:"Corner",x:.1});
    expect(card.regions[0].anchor).toEqual({x:.95,y:.03});
    const bounds = {...card.regions[0]};
    card = updateRegion(card,id,{anchor:{x:.8,y:.2}});
    expect(card.regions[0]).toMatchObject({x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height});
    const restored = JSON.parse(JSON.stringify(card));
    expect(validStructure(restored)).toBe(true);
    expect(restored).toEqual(card);
  });
  it("rejects malformed anchors and invalid pointer coordinates", () => {
    for (const anchor of [{x:NaN,y:.5},{x:2,y:.1},{x:.1,y:-1}]) {
      expect(addCallout(legacy,anchor)).toBe(legacy);
      expect(updateRegion(legacy,"stable",{anchor})).toBe(legacy);
      expect(validStructure({...legacy,regions:[{...legacy.regions[0],anchor}]})).toBe(false);
    }
    expect(validStructure({...legacy,regions:[{...legacy.regions[0],anchor:null}]})).toBe(false);
  });
  it("persists random initial colors, explicit colors and a stable connector socket",()=>{
    let card=addCallout({...createOcclusion(),image:"original.png"},{x:.8,y:.5});
    const id=card.regions[0].id;
    expect(regionColors).toContain(regionColor(card.regions[0]));
    card=updateRegion(card,id,{answer:"Target",color:"#ff55aa",socket:"bottom"});
    const original=card.regions[0], from=regionConnector(original);
    card=updateRegion(card,id,{anchor:{x:.1,y:.1}});
    expect(regionConnector(card.regions[0])).toEqual(from);
    card=updateRegion(card,id,{x:.2,y:.3});
    expect(regionConnector(card.regions[0])).toEqual({x:.2+original.width/2,y:.3+original.height});
    expect(JSON.parse(JSON.stringify(card)).regions[0]).toMatchObject({color:"#ff55aa",socket:"bottom"});
    expect(validStructure(card)).toBe(true);
    expect(updateRegion(card,id,{color:"url(unsafe)"})).toBe(card);
    expect(validStructure({...card,regions:[{...card.regions[0],color:"url(unsafe)"}]})).toBe(false);
  });
});
