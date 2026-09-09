import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type { Deck } from "./lib";
import { inTauri } from "./native";
import { Modal } from "./ui";
import { SetCover } from "./covers";
import { notify } from "./motion";
export type PortablePreview = {
  token: string;
  deck: Deck;
  media: Record<string, number[]>;
};
export function importConflicts(deck: Deck, decks: Deck[]) {
  return {
    id: decks.some((d) => d.id === deck.id),
    name: decks.some(
      (d) =>
        d.title.normalize("NFC").trim().toLowerCase() ===
        deck.title.normalize("NFC").trim().toLowerCase(),
    ),
  };
}
export function PortableSets({
  decks,
  onImported,
  onBusy,
}: {
  decks: Deck[];
  onImported: (deck: Deck) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [paths, setPaths] = useState<string[]>([]),
    [preview, setPreview] = useState<PortablePreview | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    onBusy(!!preview || busy || !!error || !!paths.length);
  }, [preview, busy, error, paths.length, onBusy]);
  useEffect(() => {
    if (!inTauri()) return;
    let active = true;
    let stop: (() => void) | undefined;
    const drain = async () => {
      try {
        const incoming = await invoke<string[]>("opened_sets");
        if (active) setPaths((old) => [...old, ...incoming]);
      } catch (e) {
        if (active) setError(String(e));
      }
    };
    void listen("flint-opened", drain)
      .then((unlisten) => {
        if (!active) unlisten();
        else {
          stop = unlisten;
          void drain();
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    const choose = async () => {
      try {
        const path = await open({
          multiple: false,
          filters: [{ name: "Flint study set", extensions: ["flint"] }],
        });
        if (active && typeof path === "string")
          setPaths((old) => [...old, path]);
      } catch (e) {
        if (active) setError(String(e));
      }
    };
    window.addEventListener("flint-import", choose);
    return () => {
      active = false;
      stop?.();
      window.removeEventListener("flint-import", choose);
    };
  }, []);
  useEffect(() => {
    if (!paths.length || preview || error) return;
    let active = true;
    setBusy(true);
    void invoke<PortablePreview>("preview_flint", { path: paths[0] })
      .then((result) => {
        if (active) setPreview(result);
      })
      .catch((e) => {
        if (active) setError(String(e));
      })
      .finally(() => {
        if (active) {
          setPaths((old) => old.slice(1));
          setBusy(false);
        }
      });
    return () => {
      active = false;
    };
  }, [paths[0], preview, error]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const next = Object.fromEntries(
      Object.entries(preview?.media || {}).map(([name, bytes]) => [
        name,
        URL.createObjectURL(
          new Blob([new Uint8Array(bytes)], {
            type: name.toLowerCase().endsWith("png")
              ? "image/png"
              : name.toLowerCase().endsWith("webp")
                ? "image/webp"
                : "image/jpeg",
          }),
        ),
      ]),
    );
    setUrls(next);
    return () => Object.values(next).forEach((url) => URL.revokeObjectURL(url));
  }, [preview]);
  const close = async () => {
    if (lock.current) return;
    try {
      if (preview) await invoke("cancel_flint", { token: preview.token });
      setPreview(null);
      setError("");
    } catch (e) {
      setError(String(e));
    }
  };
  if (!preview && !error)
    return busy ? (
      <div className="portable-loading" role="status">
        Reading Flint set…
      </div>
    ) : null;
  const conflict = preview && importConflicts(preview.deck, decks);
  return (
    <Modal
      title={preview ? "Import Flint set" : "Couldn't import set"}
      onClose={() => {
        void close();
      }}
    >
      {error && <p role="alert">{error}</p>}
      {preview && (
        <div className="portable-import">
          <h2>{preview.deck.title}</h2>
          <p>
            {preview.deck.cards.length} cards · {preview.deck.subject}
          </p>
          {preview.deck.coverImage && urls[preview.deck.coverImage] ? (
            <img
              className="portable-cover"
              src={urls[preview.deck.coverImage]}
              alt="Set cover"
            />
          ) : (
            <SetCover deck={preview.deck} />
          )}
          <p>{preview.deck.meta?.description}</p>
          <p>{preview.deck.meta?.tags?.join(" · ")}</p>
          {(conflict?.id || conflict?.name) && (
            <p role="status">
              An existing set has the same{" "}
              {conflict.id && conflict.name
                ? "name and ID"
                : conflict.id
                  ? "ID"
                  : "name"}
              . Importing creates a separate copy.
            </p>
          )}
          <p>
            Nothing will be overwritten. This is one portable set, not a
            full-library backup.
          </p>
          <div className="portable-preview">
            {preview.deck.cards.slice(0, 5).map((c) => (
              <div key={c.id}>
                <b>{c.question}</b>
                {c.questionImage && (
                  <img src={urls[c.questionImage]} alt="Term visual" />
                )}
                <p>{c.answer}</p>
                {c.answerImage && (
                  <img src={urls[c.answerImage]} alt="Definition visual" />
                )}
              </div>
            ))}
          </div>
          <button
            className="primary"
            disabled={busy}
            onClick={async () => {
              if (lock.current) return;
              lock.current = true;
              setBusy(true);
              setError("");
              try {
                const deck = await invoke<Deck>("import_flint", {
                  token: preview.token,
                });
                onImported({
                  ...deck,
                  cards: deck.cards.map((c) => ({
                    ...c,
                    due: new Date(c.dueAt || 0) <= new Date(),
                  })),
                });
                setPreview(null);
                notify("Set imported as a new copy");
              } catch (e) {
                setError(String(e));
              } finally {
                lock.current = false;
                setBusy(false);
              }
            }}
          >
            Import as new set
          </button>
        </div>
      )}
      <button
        className="secondary"
        disabled={busy}
        onClick={() => {
          void close();
        }}
      >
        Cancel
      </button>
    </Modal>
  );
}
