import { useEffect, useRef, useState } from "react";
import { Modal } from "./ui";
import { AudioPlayer, audioTime } from "./Audio";
import { saveAudioBytes } from "./native";
export function AudioRecorder({
  onUse,
  close,
}: {
  onUse: (name: string) => void;
  close: () => void;
}) {
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    live = useRef(true),
    saving = useRef(false),
    chunks = useRef<Blob[]>([]),
    blob = useRef<Blob | null>(null);
  const [recording, setRecording] = useState(false),
    [seconds, setSeconds] = useState(0),
    [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const stopTracks = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      if (recorder.current?.state === "recording") recorder.current.stop();
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
    if (!recording) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);
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
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
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
      <p aria-live="polite">
        {recording
          ? "● Recording " + audioTime(seconds)
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
          <button onClick={() => recorder.current?.stop()}>Stop</button>
        ) : (
          <button disabled={busy} onClick={() => void start()}>
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
