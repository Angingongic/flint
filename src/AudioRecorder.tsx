import { useEffect, useRef, useState } from "react";
import { Modal } from "./ui";
import { AudioPlayer, audioTime } from "./Audio";
import { saveAudioBytes } from "./native";
import { useMicrophone } from "./microphone";
export function AudioRecorder({
  onUse,
  close,
}: {
  onUse: (name: string) => void;
  close: () => void;
}) {
  const microphone=useMicrophone();
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    live = useRef(true),
    saving = useRef(false),
    chunks = useRef<Blob[]>([]),
    blob = useRef<Blob | null>(null);
  const [recording, setRecording] = useState(false),
    [paused,setPaused]=useState(false),
    [seconds, setSeconds] = useState(0),
    [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const stopTracks = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    microphone.stop();
  };
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
      stopTracks();
    };
  }, []);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  useEffect(() => {
    if (!recording || paused) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording,paused]);
  const start = async () => {
    setError("");
    setBusy(true);
    setUrl("");
    blob.current = null;
    chunks.current = [];
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw Error(
          "Recording is unavailable on this device. Import an audio file instead.",
        );
      const mic = await microphone.acquire();
      if (!live.current) {
        mic.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = mic;
      const mime = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mime)
        throw Error(
          "No supported recording format. Import an audio file instead.",
        );
      const r = new MediaRecorder(mic, { mimeType: mime });
      recorder.current = r;
      mic.getTracks().forEach(track=>track.addEventListener?.("ended",()=>{if(r.state!=="inactive")r.stop();}));
      let bytes = 0;
      r.ondataavailable = (e) => {
        if (e.data.size) {
          bytes += e.data.size;
          chunks.current.push(e.data);
          if (bytes > 24 * 1024 * 1024 && r.state === "recording") r.stop();
        }
      };
      r.onerror = () => {
        stopTracks();
        if (live.current) {
          setRecording(false);
          setError("Recording failed. Please try again.");
        }
      };
      r.onstop = () => {
        stopTracks();
        if (!live.current) return;
        blob.current = new Blob(chunks.current, { type: mime.split(";")[0] });
        setUrl(URL.createObjectURL(blob.current));
        setRecording(false);
      };
      r.start(250);
      setPaused(false);
      setSeconds(0);
      setRecording(true);
    } catch (e) {
      stopTracks();
      if (live.current)
        setError(
          e instanceof DOMException && e.name === "NotAllowedError"
            ? "Microphone permission denied. Allow microphone access to record, or import audio."
            : String(e),
        );
    } finally {
      if (live.current) setBusy(false);
    }
  };
  return (
    <Modal
      title="Record audio"
      onClose={() => {
        if (!saving.current) close();
      }}
    >
      <label>Microphone<select aria-label="Microphone" value={microphone.selected} disabled={recording || busy || microphone.busy} onChange={e=>microphone.select(e.target.value)}>
        <option value="">System default</option>{microphone.devices.map((device,index)=><option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index+1}`}</option>)}
      </select></label>
      {!recording && <div className="recorder-tools"><button disabled={busy || microphone.busy} onClick={()=>void microphone.scan()}>Rescan microphones</button><button disabled={busy || microphone.busy} onClick={()=>microphone.active?microphone.stop():void microphone.acquire().catch(()=>{})}>{microphone.active?"Stop monitoring":"Enable microphone"}</button></div>}
      <div className="microphone-meter" role="meter" aria-label="Microphone input level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(microphone.meter.level*100)} aria-valuetext={microphone.meter.label}><span style={{transform:`scaleX(${microphone.meter.level})`}}/></div>
      <small>{microphone.meter.label}</small>
      {microphone.error && microphone.error!==error && <p role="alert">{microphone.error}</p>}
      <p aria-live="polite">
        {recording
          ? (paused?"Paused ":"● Recording ") + audioTime(seconds)
          : url
            ? "Preview your recording"
            : "Record locally. Nothing is uploaded."}
      </p>
      {url && <AudioPlayer src={url} label="Recording preview" />}
      {error && <p role="alert">{error}</p>}
      <div className="modal-actions">
        <button disabled={saving.current} onClick={close}>
          Cancel
        </button>
        {recording ? (
          <><button onClick={()=>{const r=recorder.current;if(!r)return;if(r.state==="recording"){r.pause();setPaused(true);}else if(r.state==="paused"){r.resume();setPaused(false);}}}>{paused?"Resume":"Pause"}</button><button onClick={() => recorder.current?.stop()}>Stop</button></>
        ) : (
          <button disabled={busy || microphone.busy} onClick={() => void start()}>
            {url ? "Re-record" : "Start recording"}
          </button>
        )}
        {url && (
          <>
            <button
              disabled={busy}
              onClick={() => {
                blob.current = null;
                setUrl("");
              }}
            >
              Remove recording
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                if (!blob.current || saving.current) return;
                saving.current = true;
                setBusy(true);
                try {
                  const ext =
                    blob.current.type === "audio/mp4"
                      ? "m4a"
                      : blob.current.type === "audio/ogg"
                        ? "ogg"
                        : "webm";
                  const name = await saveAudioBytes(
                    new File([blob.current], "recording." + ext, {
                      type: blob.current.type,
                    }),
                  );
                  onUse(name);
                  close();
                } catch (e) {
                  saving.current = false;
                  setError(String(e));
                  setBusy(false);
                }
              }}
            >
              Use recording
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
