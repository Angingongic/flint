/** Decode one representative frame. Existing managed URLs avoid copying entire videos into memory. */
export function createVideoPoster(file: Blob | string): Promise<Blob | null> {
  if (typeof file!=="string" && !URL.createObjectURL) return Promise.resolve(null);
  return new Promise(resolve => {
    const video = document.createElement("video"), url = typeof file==="string"?file:URL.createObjectURL(file);
    let finished = false;
    const finish = (poster: Blob | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      video.onloadeddata = video.onseeked = video.onerror = null;
      video.removeAttribute("src"); video.load(); if(typeof file!=="string") URL.revokeObjectURL(url);
      resolve(poster);
    };
    const capture = () => {
      try {
        if (!video.videoWidth || !video.videoHeight) return finish(null);
        const scale = Math.min(1, 480 / Math.max(video.videoWidth, video.videoHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) return finish(null);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(finish, "image/jpeg", .75);
      } catch { finish(null); }
    };
    const timeout = setTimeout(() => finish(null), 5000);
    video.muted = true; video.preload = "auto"; video.playsInline = true;video.crossOrigin="anonymous";
    video.onerror = () => finish(null);
    video.onloadeddata = () => {
      if (Number.isFinite(video.duration) && video.duration > .2) {
        video.onseeked = capture; video.currentTime = Math.min(.5, video.duration / 2);
      } else capture();
    };
    video.src = url; video.load();
  });
}
