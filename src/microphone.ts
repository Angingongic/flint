import {useCallback,useEffect,useRef,useState} from "react";

export function inputLevel(samples:Float32Array) {
  let energy=0,peak=0;
  for(const sample of samples){energy+=sample*sample;peak=Math.max(peak,Math.abs(sample));}
  const rms=Math.sqrt(energy/Math.max(1,samples.length));
  return {level:Math.min(1,rms*5),label:peak>=.98?"Clipping":rms<.004?"Silence":rms<.025?"Quiet":"Normal"};
}

/** Monitoring owns no recorder and never creates a stored audio asset. */
export function useMicrophone() {
  const [devices,setDevices]=useState<MediaDeviceInfo[]>([]),
    [selected,setSelected]=useState(()=>localStorage.getItem("flint-microphone")||""),
    [active,setActive]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),
    [meter,setMeter]=useState({level:0,label:"Microphone not enabled"});
  const stream=useRef<MediaStream|null>(null),context=useRef<AudioContext|null>(null),
    frame=useRef(0),request=useRef(0),live=useRef(true);
  const release=useCallback(()=>{
    cancelAnimationFrame(frame.current);
    stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;
    void context.current?.close().catch(()=>{});context.current=null;
  },[]);
  const stop=useCallback(()=>{request.current++;release();if(live.current){setActive(false);setBusy(false);setMeter({level:0,label:"Microphone stopped"});}},[release]);
  const scan=useCallback(async()=>{
    try {const found=await navigator.mediaDevices?.enumerateDevices?.();if(live.current && found)setDevices(found.filter(d=>d.kind==="audioinput"));}
    catch {if(live.current)setError("Cannot list microphones. Enable microphone access, then rescan.");}
  },[]);
  useEffect(()=>{live.current=true;void scan();navigator.mediaDevices?.addEventListener?.("devicechange",scan);return()=>{live.current=false;request.current++;release();navigator.mediaDevices?.removeEventListener?.("devicechange",scan);};},[release,scan]);
  const acquire=async(id=selected):Promise<MediaStream>=>{
    if(stream.current?.active && id===selected)return stream.current;
    const token=++request.current;release();setBusy(true);setError("");setActive(false);
    try {
      if(!navigator.mediaDevices?.getUserMedia)throw Error("Microphone access is unavailable. Import an audio file instead.");
      let mic:MediaStream;
      try {mic=await navigator.mediaDevices.getUserMedia({audio:id?{deviceId:{exact:id}}:true});}
      catch(reason){
        if(!id || !(reason instanceof DOMException) || !["NotFoundError","OverconstrainedError"].includes(reason.name))throw reason;
        mic=await navigator.mediaDevices.getUserMedia({audio:true});
        if(live.current && token===request.current){setSelected("");localStorage.removeItem("flint-microphone");setError("Selected microphone is unavailable. Using the system default.");}
      }
      if(!live.current || token!==request.current){mic.getTracks().forEach(t=>t.stop());throw Error("Microphone request cancelled.");}
      stream.current=mic;setActive(true);void scan();
      mic.getTracks().forEach(track=>track.addEventListener?.("ended",()=>{if(stream.current===mic){stop();setError("Microphone disconnected. Reconnect it or choose another input.");}}));
      if(typeof AudioContext!=="undefined"){
        const audio=new AudioContext();context.current=audio;await audio.resume();
        if(!live.current || token!==request.current){void audio.close().catch(()=>{});throw Error("Microphone request cancelled.");}
        const analyser=audio.createAnalyser();analyser.fftSize=512;
        audio.createMediaStreamSource(mic).connect(analyser);
        const data=new Float32Array(analyser.fftSize);let last=0;
        const tick=(now:number)=>{if(!live.current||token!==request.current)return;if(now-last>=70){analyser.getFloatTimeDomainData(data);setMeter(inputLevel(data));last=now;}frame.current=requestAnimationFrame(tick);};
        frame.current=requestAnimationFrame(tick);
      }else setMeter({level:0,label:"Live level display unavailable"});
      return mic;
    }catch(reason){
      if(live.current && token===request.current){release();setActive(false);setError(reason instanceof DOMException && reason.name==="NotAllowedError" ? "Microphone permission denied. Allow microphone access to record, or import audio." : String(reason));}
      throw reason;
    }finally{if(live.current && token===request.current)setBusy(false);}
  };
  const select=(id:string)=>{setSelected(id);localStorage.setItem("flint-microphone",id);if(active)void acquire(id).catch(()=>{});};
  return {devices,selected,active,busy,error,meter,acquire,select,scan,stop};
}
