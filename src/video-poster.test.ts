// @vitest-environment jsdom
import {afterEach,expect,it,vi} from "vitest";
const {invoke,createVideoPoster}=vi.hoisted(()=>({invoke:vi.fn(),createVideoPoster:vi.fn()}));
vi.mock("@tauri-apps/api/core",()=>({invoke,convertFileSrc:(path:string)=>"asset:"+path}));
vi.mock("./video-poster",()=>({createVideoPoster}));
import {videoPosterUrl} from "./native";
afterEach(()=>{delete (window as unknown as Record<string,unknown>).__TAURI_INTERNALS__;vi.clearAllMocks();});
it("backfills a missing managed poster once for concurrent viewers, then loads the saved cache",async()=>{
  (window as unknown as Record<string,unknown>).__TAURI_INTERNALS__={};
  let saved=false;
  invoke.mockImplementation(async(command:string,args:{name:string})=>command==="video_poster"?(saved?"old.mp4.poster.jpg":null):command==="save_video_poster"?(saved=true):"managed/"+args.name);
  createVideoPoster.mockResolvedValue({arrayBuffer:async()=>new Uint8Array([255,216,255,217]).buffer});
  const result=await Promise.all([videoPosterUrl("old.mp4"),videoPosterUrl("old.mp4")]);
  expect(createVideoPoster).toHaveBeenCalledTimes(1);
  expect(invoke.mock.calls.filter(([command])=>command==="save_video_poster")).toHaveLength(1);
  expect(result[0]).toContain("old.mp4.poster.jpg");
  await videoPosterUrl("old.mp4");expect(createVideoPoster).toHaveBeenCalledTimes(1);
});
it("leaves original video untouched when a codec cannot yield a poster",async()=>{
  (window as unknown as Record<string,unknown>).__TAURI_INTERNALS__={};
  invoke.mockImplementation(async(command:string)=>command==="video_poster"?null:"managed/unsupported.webm");
  createVideoPoster.mockResolvedValue(null);
  expect(await videoPosterUrl("unsupported.webm")).toBe("");
  expect(invoke.mock.calls.some(([command])=>command==="save_video_poster")).toBe(false);
  expect(invoke.mock.calls.every(([command])=>["video_poster","media_path"].includes(command))).toBe(true);
});
