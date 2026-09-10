import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, Volume2, Upload, Trash2 } from "lucide-react";
import { mediaUrl, saveAudioBytes } from "./native";
const STOP_EVENT = "flint-audio-play";
export const audioTime = (seconds: number) =>
  Number.isFinite(seconds)
    ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`
    : "0:00";
export function AudioPlayer({
  name,
  src: provided,
  label = "Audio",
  active = true,
}: {
  name?: string | null;
  src?: string;
  label?: string;
  active?: boolean;
}) {
  const audio = useRef<HTMLAudioElement>(null),
    identity = useRef({});
  const [src, setSrc] = useState(""),
    [playing, setPlaying] = useState(false),
    [time, setTime] = useState(0),
    [duration, setDuration] = useState(0),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setSrc("");
    setTime(0);
    setDuration(0);
    setPlaying(false);
    setError("");
    void (provided ? Promise.resolve(provided) : mediaUrl(name))
      .then((url) => {
        if (live) setSrc(url);
      })
      .catch(() => {
        if (live) setError("Audio could not be loaded");
      });
    return () => {
      live = false;
    };
  }, [name, provided]);
  useEffect(() => {
    const element = audio.current;
    const stop = (e: Event) => {
      if ((e as CustomEvent).detail !== identity.current) {
        element?.pause();
        setPlaying(false);
      }
    };
    window.addEventListener(STOP_EVENT, stop);
    return () => {
      window.removeEventListener(STOP_EVENT, stop);
      element?.pause();
    };
  }, [src]);
  useEffect(() => {
    if (!active && audio.current) {
      audio.current.pause();
      audio.current.currentTime = 0;
      setTime(0);
      setPlaying(false);
    }
  }, [active]);
  if (!name && !provided) return null;
  const play = async () => {
    if (!active || !audio.current) return;
    window.dispatchEvent(
      new CustomEvent(STOP_EVENT, { detail: identity.current }),
    );
    try {
      await audio.current.play();
    } catch {
      setError("This audio format cannot play on this device. Try MP3 or WAV.");
    }
  };
  return (
    <div
      className={"audio-player " + (playing ? "is-playing" : "")}
      role="group"
      aria-label={label}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <audio
        ref={audio}
        src={src || undefined}
        preload="metadata"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() =>
          setError("Audio unavailable or unsupported on this device.")
        }
      />
      <button
        type="button"
        className="audio-play"
        aria-label={(playing ? "Pause " : "Play ") + label}
        disabled={!src || !active}
        onClick={() => {
          if (playing) audio.current?.pause();
          else void play();
        }}
      >
        {playing ? <Pause size={18} /> : <Play size={18} />}
      </button>
      <div className="audio-track">
        <div className="audio-caption">
          <span>
            <Volume2 size={13} /> {label}
          </span>
          <span className="audio-bars" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((i) => (
              <i key={i} style={{ animationDelay: `${i * 0.13}s` }} />
            ))}
          </span>
        </div>
        <input
          type="range"
          aria-label={"Seek " + label}
          min={0}
          max={Number.isFinite(duration) ? duration : 0}
          step={0.1}
          value={time}
          disabled={!duration || !active}
          onChange={(e) => {
            if (audio.current) {
              audio.current.currentTime = +e.target.value;
              setTime(+e.target.value);
            }
          }}
        />
        <small>
          {audioTime(time)} / {audioTime(duration)}
        </small>
      </div>
      <button
        type="button"
        className="icon"
        aria-label={"Replay " + label}
        disabled={!src || !active}
        onClick={() => {
          if (audio.current) audio.current.currentTime = 0;
          void play();
        }}
      >
        <RotateCcw size={16} />
      </button>
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
export function AudioField({
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
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [filename, setFilename] = useState("");
  const attach = async (file?: File) => {
    if (!file || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const name = await saveAudioBytes(file);
      onChange(name);
      setFilename(file.name);
    } catch (e) {
      setError(String(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <div
      className="audio-field"
      aria-label={label + " attachment"}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void attach(e.dataTransfer.files[0]);
      }}
    >
      <input
        ref={input}
        hidden
        aria-label={"Upload " + label}
        type="file"
        accept=".mp3,.m4a,.wav,.ogg,audio/mpeg,audio/mp4,audio/wav,audio/ogg"
        onChange={(e) => {
          void attach(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {value && <AudioPlayer name={value} label={label} />}
      <div className="button-row">
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <Upload size={14} />
          {busy ? "Attaching…" : value ? "Replace audio" : "Add audio"}
        </button>
        {value && (
          <button
            type="button"
            className="text-button"
            aria-label={"Remove " + label}
            disabled={busy}
            onClick={() => {
              onChange(null);
              setFilename("");
            }}
          >
            <Trash2 size={14} />
            Remove
          </button>
        )}
        <small>{filename || "MP3 · M4A · WAV · OGG · up to 25 MB"}</small>
      </div>
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
