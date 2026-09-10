import { useState } from "react";
import { Modal } from "./ui";
export const modifierLabel = () =>
  /Mac|iPhone|iPad/.test(navigator.platform) ? "Cmd" : "Ctrl";
export function Commands({
  items,
  onClose,
}: {
  items: { label: string; run: () => void }[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const found = items
    .filter((i) => i.label.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 15);
  return (
    <Modal title="Command palette" onClose={onClose}>
      <input
        autoFocus
        aria-label="Search commands"
        placeholder="Search commands and sets…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && found[0]) {
            e.preventDefault();
            onClose();
            found[0].run();
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            e.currentTarget.parentElement
              ?.querySelector<HTMLButtonElement>(".command-list button")
              ?.focus();
          }
        }}
      />
      <div className="command-list">
        {found.map((item) => (
          <button
            key={item.label}
            className="secondary"
            onClick={() => {
              onClose();
              item.run();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </Modal>
  );
}
export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const mod = modifierLabel();
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <dl className="shortcut-list">
        {[
          [mod + "+K", "Command palette"],
          [mod + "+N", "New set"],
          ["/", "Focus search"],
          ["Esc", "Close, cancel or back"],
          [mod + "+Enter", "Add card in editor"],
          [mod + "+S", "Save set"],
          [mod + "+Z", "Undo edit or library action"],
          ["Space / ↑ / ↓", "Flip flashcard"],
          ["← / →", "Previous / next flashcard"],
          ["1–4", "Learn multiple-choice answer"],
          ["Enter", "Check / continue"],
          ["↑ / ↓ on handle", "Reorder matching answer"],
          ["?", "Show this reference"],
        ].map(([key, action]) => (
          <div key={key}>
            <dt>
              <kbd>{key}</kbd>
            </dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
      <p>
        Typing fields keep their normal keys. Editor save/add/undo shortcuts
        apply only to the editor.
      </p>
    </Modal>
  );
}
