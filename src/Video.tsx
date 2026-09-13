import { useEffect, useRef, useState } from "react";
import { mediaUrl, saveVideoBytes } from "./native";
export function VideoPlayer({
  name,
  src: provided,
  label = "Video",
  active = true,
  autoplay = false,
}: {
  name?: string | null;
  src?: string;
  label?: string;
  active?: boolean;
  autoplay?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null),
    identity = useRef({});
  const [src, setSrc] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setSrc("");
    setError("");
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
            if (!entries[0].isIntersecting) reset();
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
      className="video-player"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <video
        ref={ref}
        src={src || undefined}
        controls
        playsInline
        preload="none"
        aria-label={label}
        onPlay={(e) => {
          if (!active) {
            e.currentTarget.pause();
            return;
          }
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
