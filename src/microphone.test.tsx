// @vitest-environment jsdom
import {act,cleanup,renderHook,waitFor} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {inputLevel,useMicrophone} from "./microphone";
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();localStorage.clear();});
it("distinguishes silence, quiet speech, normal speech and clipping",()=>{
  expect(inputLevel(new Float32Array(10)).label).toBe("Silence");
  expect(inputLevel(new Float32Array(10).fill(.01)).label).toBe("Quiet");
  expect(inputLevel(new Float32Array(10).fill(.1)).label).toBe("Normal");
  expect(inputLevel(new Float32Array([1,-1])).label).toBe("Clipping");
});
it("enumerates real devices, remembers selection, monitors without recording and releases streams",async()=>{
  vi.stubGlobal("AudioContext",undefined);
  const stop=vi.fn(),track={stop,addEventListener:vi.fn()};
  const mic={active:true,getTracks:()=>[track]};
  const acquire=vi.fn().mockResolvedValue(mic);
  Object.defineProperty(navigator,"mediaDevices",{configurable:true,value:{getUserMedia:acquire,enumerateDevices:vi.fn().mockResolvedValue([{kind:"audioinput",deviceId:"usb",label:"USB mic"}])}});
  const hook=renderHook(useMicrophone);
  await waitFor(()=>expect(hook.result.current.devices).toHaveLength(1));
  act(()=>hook.result.current.select("usb"));
  await act(async()=>{await hook.result.current.acquire();});
  expect(acquire).toHaveBeenCalledWith({audio:{deviceId:{exact:"usb"}}});
  expect(hook.result.current.active).toBe(true);
  expect(localStorage.getItem("flint-microphone")).toBe("usb");
  hook.unmount();expect(stop).toHaveBeenCalledOnce();
});
it("releases a microphone granted after its recorder was closed",async()=>{
  const stop=vi.fn();let resolve!:(value:unknown)=>void;
  Object.defineProperty(navigator,"mediaDevices",{configurable:true,value:{getUserMedia:()=>new Promise(r=>resolve=r)}});
  const hook=renderHook(useMicrophone);let pending!:Promise<unknown>;
  act(()=>{pending=hook.result.current.acquire().catch(e=>e);});
  hook.unmount();resolve({getTracks:()=>[{stop}]});await pending;
  expect(stop).toHaveBeenCalledOnce();
});
