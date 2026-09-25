import { describe,it,expect } from "vitest";
import { flintFormatName,formatIssueMessage } from "./flint-format";
describe("permanent musical format identities",()=>{
  it("keeps numeric generation order and leaves unknown versions unnamed",()=>{
    expect(Array.from({length:8},(_,i)=>flintFormatName(i+1))).toEqual(["Prelude","Aria","Cadence","Sonata","Nocturne","Coda","Chorus","Rhapsody"]);
    for(const value of [0,9,-1,1.5,NaN])expect(flintFormatName(value)).toBeNull();
  });
  it("shows known format and actual minimum requirement without inventing one",()=>{
    expect(formatIssueMessage({kind:"unsupported",version:5,detail:"",minimumFlintVersion:"2.3.0"})).toContain("Nocturne");
    expect(formatIssueMessage({kind:"unsupported",version:99,detail:""})).not.toContain("Requires Flint");
    expect(formatIssueMessage({kind:"unsupported",version:99,detail:""})).toContain("This set uses a newer Flint file format.");
    expect(formatIssueMessage({kind:"unsupported",detail:""})).toContain("unidentified Flint file format");
  });
});
