import { useEffect, useRef, useState } from "react";
import { mediaUrl, saveVideoBytes, videoPosterUrl } from "./native";
import { Maximize, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useStudyMediaSize } from "./media-layout";
const videoTime = (value:number) => `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2,"0")}`;
export function VideoPlayer({
  name,
  src: provided,
  label = "Video",
  active = true,
  autoplay = false,
  mode = "study",
}: {
  name?: string | null;
  src?: string;
  label?: string;
  active?: boolean;
  autoplay?: boolean;
  mode?: "study"|"choice"|"preview";
}) {
  const ref = useRef<HTMLVideoElement>(null),
    frame = useRef<HTMLDivElement>(null),
    identity = useRef({});
  const [playing,setPlaying] = useState(false), [time,setTime] = useState(0),
    [duration,setDuration] = useState(0), [volume,setVolume] = useState(1), [muted,setMuted] = useState(false);
  const toggle = () => {
    const video=ref.current;
    if(!video || !active)return;
    if(video.paused)void video.play().catch(()=>setError("Playback could not start. Try Play again."));
    else video.pause();
  };
  const seek = (value:number) => {
    const video=ref.current;
    if(video && Number.isFinite(video.duration)) {
      video.currentTime=Math.max(0,Math.min(video.duration,value));
      setTime(video.currentTime);
    }
  };
  const fullscreen = async () => {
    try {
      if(document.fullscreenElement===frame.current)await document.exitFullscreen();
      else if(frame.current?.requestFullscreen)await frame.current.requestFullscreen();
      else setError("Fullscreen is unavailable in this view.");
    } catch { setError("Fullscreen is unavailable in this view."); }
  };
  const [src, setSrc] = useState(""),
    [poster, setPoster] = useState(""),
    [error, setError] = useState("");
  const [dimensions,setDimensions]=useState({src:"",width:0,height:0});
  const size=useStudyMediaSize(frame,dimensions.src===src?dimensions.width:0,dimensions.src===src?dimensions.height:0,"video",undefined,mode);
  useEffect(() => {
    let live = true;
    setSrc("");
    setError("");
    setPoster("");
    setTime(0); setDuration(0); setPlaying(false);
    void (provided ? Promise.resolve(provided) : mediaUrl(name))
      .then((value) => {
        if (live) setSrc(value);
      })
      .catch(() => {
        if (live) setError("Video unavailable");
      });
    return () => {
      live = false;
    };
  }, [name, provided]);
  useEffect(()=>{
    if(!name||provided)return;
    let live=true,requested=false;
    const load=()=>{if(requested)return;requested=true;void videoPosterUrl(name).then(value=>{if(live)setPoster(value);}).catch(()=>{});};
    const observer=typeof IntersectionObserver!=="undefined"?new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){load();observer?.disconnect();}},{rootMargin:"200px"}):null;
    if(observer&&ref.current)observer.observe(ref.current);else load();
    return()=>{live=false;observer?.disconnect();};
  },[name,provided]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reset = () => {
      el.pause();
      el.currentTime = 0;
    };
    const other = (e: Event) => {
      if ((e as CustomEvent).detail !== identity.current) reset();
    };
    window.addEventListener("flint-audio-play", other);
    const observer =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver((entries) => {
            if (!entries[0].isIntersecting) el.pause();
          })
        : null;
    observer?.observe(el);
    if (active && autoplay && src)
      void el.play().catch(() => {
        /* Autoplay may be denied; Play remains available. */
      });
    if (!active) reset();
    return () => {
      reset();
      observer?.disconnect();
      window.removeEventListener("flint-audio-play", other);
    };
  }, [src, active, autoplay]);
  if (!name && !provided) return null;
  return (
    <div
      ref={frame}
      tabIndex={0}
      role="group"
      aria-label={label + " player"}
      className="video-player"
      style={{width:size?.width||"100%",maxWidth:"100%"}}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if(e.ctrlKey || e.metaKey || e.altKey || e.nativeEvent.isComposing)return;
        // Native button/range keys retain their usual accessible behavior.
        if((e.target as HTMLElement).closest("button,input"))return;
        if(e.key===" "){e.preventDefault();toggle();}
        else if(e.key==="ArrowLeft" || e.key==="ArrowRight") {e.preventDefault();seek((ref.current?.currentTime||0)+(e.key==="ArrowRight"?5:-5));}
        else if(e.key.toLowerCase()==="m" && ref.current){e.preventDefault();ref.current.muted=!ref.current.muted;}
        else if(e.key.toLowerCase()==="f"){e.preventDefault();void fullscreen();}
      }}
    >
      <div className="video-viewport" style={{aspectRatio:dimensions.src===src&&dimensions.width?`${dimensions.width} / ${dimensions.height}`:undefined}}>
      <video
        ref={ref}
        src={src || undefined}
        poster={poster || undefined}
        playsInline
        preload="metadata"
        aria-label={label}
        onClick={toggle}
        onLoadedMetadata={e=>{setDuration(Number.isFinite(e.currentTarget.duration)?e.currentTarget.duration:0);setDimensions({src,width:e.currentTarget.videoWidth,height:e.currentTarget.videoHeight});}}
        onDurationChange={e=>setDuration(Number.isFinite(e.currentTarget.duration)?e.currentTarget.duration:0)}
        onTimeUpdate={e=>setTime(e.currentTarget.currentTime)}
        onPause={()=>setPlaying(false)}
        onEnded={()=>setPlaying(false)}
        onVolumeChange={e=>{setMuted(e.currentTarget.muted);setVolume(e.currentTarget.volume);}}
        onPlay={(e) => {
          if (!active) {
            e.currentTarget.pause();
            return;
          }
          setPlaying(true);setError("");
          window.dispatchEvent(
            new CustomEvent("flint-audio-play", { detail: identity.current }),
          );
        }}
        onError={() =>
          setError(
            "Video codec unavailable on this device. Try H.264 MP4 or VP8/VP9 WebM.",
          )
        }
      />
      {!playing && <button type="button" className="video-center-play" aria-label={"Play " + label} disabled={!active || !src} onClick={toggle}><Play/></button>}
      </div>
      <div className="video-controls">
        <button type="button" aria-label={playing?"Pause video":"Play video"} disabled={!active || !src} onClick={toggle}>{playing?<Pause/>:<Play/>}</button>
        <span className="video-time">{videoTime(time)} / {videoTime(duration)}</span>
        <input type="range" className="video-seek" aria-label="Video progress" min={0} max={duration||1} step={0.1} value={Math.min(time,duration||1)} disabled={!duration} onChange={e=>seek(Number(e.target.value))}
          onPointerDown={e=>{if(!duration)return;e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);const rect=e.currentTarget.getBoundingClientRect();seek((e.clientX-rect.left)/rect.width*duration);}}
          onPointerMove={e=>{if(!e.currentTarget.hasPointerCapture(e.pointerId))return;const rect=e.currentTarget.getBoundingClientRect();seek((e.clientX-rect.left)/rect.width*duration);}}
          onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}/>
        <button type="button" aria-label={muted?"Unmute video":"Mute video"} onClick={()=>{if(ref.current)ref.current.muted=!ref.current.muted;}}>{muted||volume===0?<VolumeX/>:<Volume2/>}</button>
        <input className="video-volume" type="range" aria-label="Video volume" min={0} max={1} step={0.05} value={muted?0:volume} onChange={e=>{if(ref.current){ref.current.volume=Number(e.target.value);ref.current.muted=false;}}}/>
        <button type="button" aria-label="Video fullscreen" onClick={()=>void fullscreen()}><Maximize/></button>
      </div>
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
export function VideoField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string | null;
  onChange: (value: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null),
    lock = useRef(false);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const attach = async (file?: File) => {
    if (!file || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      onChange(await saveVideoBytes(file));
    } catch (e) {
      setError(String(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <div
      className="video-field"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void attach(e.dataTransfer.files[0]);
      }}
    >
      <input
        ref={input}
        type="file"
        hidden
        accept=".mp4,.webm,video/mp4,video/webm"
        aria-label={"Upload " + label}
        onChange={(e) => {
          void attach(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {value && <VideoPlayer name={value} label={label} />}
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy ? "Attaching…" : value ? "Replace video" : "Add video"}
      </button>
      {value && (
        <button
          type="button"
          aria-label={"Remove " + label}
          onClick={() => onChange(null)}
        >
          Remove
        </button>
      )}
      <small>MP4 · WebM · up to 25 MB · codec support varies</small>
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
