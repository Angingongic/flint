import { useEffect, useState } from "react";
import type { Deck } from "./lib";
import { mediaUrl } from "./native";
import { Modal } from "./ui";
import { Shuffle, Grid2X2 } from "lucide-react";

// Original vector artwork, bundled with Flint. No remote assets or per-frame filters.
const palettes = [
  ["Ember", "Sunset", "#24142d", "#fa692c", "#ffcb73"],
  ["Tidal", "Ocean", "#081e39", "#178fab", "#9ee4df"],
  ["Iris", "Gradient", "#171b44", "#7454ce", "#e3a9ec"],
  ["Fern", "Botanical", "#102d28", "#4e9871", "#c9d9a0"],
  ["Atlas", "Topographic", "#17253a", "#37677c", "#c1cbab"],
  ["Lunar", "Monochrome", "#20242e", "#626c82", "#d7dce3"],
  ["Spectrum", "Gradient", "#233786", "#c755a8", "#ffb355"],
  ["Lagoon", "Ocean", "#102d3e", "#289e97", "#d2e6ac"],
  ["Terracotta", "Paper", "#492b29", "#b97658", "#ead4ac"],
  ["Orbit", "Space", "#111a36", "#41467d", "#97c1ed"],
  ["Blueprint", "Academic grid", "#142645", "#3163a0", "#abc8e8"],
  ["Petal", "Botanical", "#3e294d", "#a06998", "#f5c3bf"],
  ["Solstice", "Sunset", "#482638", "#e45b4c", "#ffc077"],
  ["Alpine", "Topographic", "#153536", "#5c8880", "#d3e0c4"],
  ["Cobalt", "Geometric", "#0c2549", "#2865c4", "#91bce7"],
  ["Saffron", "Paper", "#473823", "#b18942", "#f6e0a0"],
  ["Aurora", "Space", "#152947", "#6a4b97", "#7ecec0"],
  ["Ripple", "Ocean", "#202454", "#5c65ac", "#b4cdf7"],
  ["Meadow", "Botanical", "#1d3829", "#7a9851", "#d5d992"],
  ["Graphite", "Academic grid", "#252a30", "#59656b", "#bfc6be"],
  ["Prism", "Geometric", "#352545", "#a65779", "#ffb08b"],
  ["Cloud", "Gradient", "#303956", "#839aaf", "#e4d9d2"],
  ["Contour", "Topographic", "#402930", "#a46863", "#e9b69d"],
  ["Parchment", "Paper", "#4c4839", "#a79e7e", "#e6ddbc"],
] as const;
export const presets = palettes.map(([name, style, a, b, c], i) => {
  let shapes = "";
  if (style === "Topographic")
    shapes = Array.from(
      { length: 13 },
      (_, n) =>
        `<ellipse cx="${370 + n * 3}" cy="115" rx="${60 + n * 28}" ry="${25 + n * 19}" fill="none" stroke="${c}" stroke-opacity=".25" stroke-width="2" transform="rotate(-24 370 115)"/>`,
    ).join("");
  else if (style === "Academic grid")
    shapes = `<pattern id="p" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="${c}" stroke-opacity=".18"/></pattern><rect width="640" height="400" fill="url(#p)"/><circle cx="440" cy="180" r="110" fill="none" stroke="${c}" stroke-opacity=".35"/><path d="M330 180H550M440 70V290" stroke="${c}" stroke-opacity=".3"/>`;
  else if (style === "Space")
    shapes =
      Array.from(
        { length: 48 },
        (_, n) =>
          `<circle cx="${(n * 137 + 31) % 640}" cy="${(n * 71 + 19) % 400}" r="${n % 4 === 0 ? 2 : 1}" fill="${c}" opacity="${0.25 + (n % 5) * 0.12}"/>`,
      ).join("") +
      `<circle cx="450" cy="160" r="78" fill="${b}"/><ellipse cx="450" cy="160" rx="150" ry="30" fill="none" stroke="${c}" stroke-opacity=".3" transform="rotate(-28 450 160)"/>`;
  else if (style === "Botanical")
    shapes = Array.from(
      { length: 8 },
      (_, n) =>
        `<ellipse cx="${230 + n * 34}" cy="${300 - n * 25}" rx="75" ry="23" transform="rotate(${n % 2 ? 30 : -35} ${230 + n * 34} ${300 - n * 25})" fill="${n % 2 ? b : c}" opacity=".4"/>`,
    ).join("");
  else if (style === "Geometric")
    shapes = `<path d="M290 0L600 400H80Z" fill="${c}" opacity=".22"/><circle cx="440" cy="140" r="105" fill="${b}" opacity=".6"/><path d="M0 330L640 90V145L0 385Z" fill="${c}" opacity=".24"/>`;
  else if (style === "Ocean")
    shapes = Array.from(
      { length: 6 },
      (_, n) =>
        `<path d="M-20 ${155 + n * 46} Q140 ${35 + n * 46} 320 ${155 + n * 46} T660 ${155 + n * 46} V420H-20Z" fill="${n % 2 ? b : c}" opacity=".17"/>`,
    ).join("");
  else if (style === "Paper")
    shapes =
      `<path d="M0 300L250 65 440 400H0Z" fill="${c}" opacity=".2"/><path d="M640 0L315 90 470 400H640Z" fill="${b}" opacity=".45"/>` +
      Array.from(
        { length: 100 },
        (_, n) =>
          `<circle cx="${(n * 173) % 640}" cy="${(n * 89) % 400}" r="1" fill="${c}" opacity=".2"/>`,
      ).join("");
  else
    shapes = `<ellipse cx="470" cy="90" rx="240" ry="175" fill="url(#h)"/><ellipse cx="110" cy="360" rx="250" ry="190" fill="url(#h)" opacity=".6"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><radialGradient id="h"><stop stop-color="${c}"/><stop offset="1" stop-color="${b}" stop-opacity="0"/></radialGradient></defs><rect width="640" height="400" fill="url(#g)"/>${shapes}</svg>`;
  return {
    id: "flint:preset/" + name.toLowerCase(),
    name,
    style,
    accent: c,
    url: "data:image/svg+xml," + encodeURIComponent(svg),
    index: i,
  };
});
export function presetFor(deck: Pick<Deck, "id" | "coverImage">) {
  const explicit = presets.find((p) => p.id === deck.coverImage);
  let hash = 2166136261;
  for (const char of deck.id)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return explicit || presets[(hash >>> 0) % presets.length];
}
export function normalizeCover(deck: Deck): Deck {
  return { ...deck, coverImage: deck.coverImage || presetFor(deck).id };
}
export function freshCover(id: string, neighbor?: Deck) {
  const preset = presetFor({ id });
  return neighbor && presetFor(neighbor).id === preset.id
    ? presets[(preset.index + 1) % presets.length].id
    : preset.id;
}
export function SetCover({
  deck,
  className = "",
}: {
  deck: Pick<Deck, "id" | "title" | "coverImage">;
  className?: string;
}) {
  const preset = presetFor(deck),
    [upload, setUpload] = useState<{ name: string; url: string } | null>(null);
  useEffect(() => {
    let active = true;
    setUpload(null);
    if (deck.coverImage && !deck.coverImage.startsWith("flint:preset/"))
      void mediaUrl(deck.coverImage)
        .then((url) => {
          if (active) setUpload({ name: deck.coverImage!, url });
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [deck.coverImage]);
  return (
    <img
      className={"set-art " + className}
      src={upload && upload.name === deck.coverImage ? upload.url : preset.url}
      alt={deck.title + " cover"}
      onError={() => setUpload(null)}
    />
  );
}
export function CoverPicker({
  deck,
  onChange,
}: {
  deck: Pick<Deck, "id" | "title" | "coverImage">;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="cover-picker">
      <SetCover deck={deck} />
      <div>
        <p className="eyebrow">FLINT ORIGINALS</p>
        <h3>
          {deck.coverImage && !deck.coverImage.startsWith("flint:")
            ? "Your image"
            : presetFor(deck).name}
        </h3>
        <p>Give this set a world of its own.</p>
        <div className="button-row">
          <button className="secondary" onClick={() => setOpen(true)}>
            <Grid2X2 size={16} /> Choose preset
          </button>
          <button
            className="secondary"
            onClick={() => {
              const current = presetFor(deck).index;
              onChange(
                presets[
                  (current +
                    1 +
                    Math.floor(Math.random() * (presets.length - 1))) %
                    presets.length
                ].id,
              );
            }}
          >
            <Shuffle size={16} /> Randomize
          </button>
        </div>
      </div>
      {open && (
        <Modal title="Choose a Flint cover" onClose={() => setOpen(false)}>
          <p>
            24 original covers. Click to preview; your choice is saved with the
            set.
          </p>
          <div className="preset-grid">
            {presets.map((p) => (
              <button
                key={p.id}
                aria-label={p.name + " " + p.style}
                className={presetFor(deck).id === p.id ? "selected" : ""}
                aria-pressed={presetFor(deck).id === p.id}
                onClick={() => onChange(p.id)}
              >
                <img src={p.url} alt="" />
                <b>{p.name}</b>
                <small>{p.style}</small>
              </button>
            ))}
          </div>
          <button className="primary" onClick={() => setOpen(false)}>
            Done
          </button>
        </Modal>
      )}
    </div>
  );
}
