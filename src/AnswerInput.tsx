import { useRef, type InputHTMLAttributes } from "react";
import type { Card } from "./lib";

export function sessionCharacters(cards: Card[]): string[] {
  return [
    ...new Set(
      cards
        .flatMap((c) => Array.from((c.question + c.answer).normalize("NFC")))
        .filter((c) => /[^\x00-\x7f]/u.test(c) && /[\p{L}\p{S}]/u.test(c)),
    ),
  ].sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!);
}
export function AnswerInput({
  cards,
  value,
  onValue,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  cards: Card[];
  value: string;
  onValue: (value: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const selection = useRef({ start: value.length, end: value.length });
  const chars = sessionCharacters(cards);
  return (
    <div className="answer-input">
      <input
        {...props}
        ref={input}
        value={value}
        onChange={(e) => onValue(e.target.value)}
        onSelect={(e) => {
          selection.current = {
            start: e.currentTarget.selectionStart ?? value.length,
            end: e.currentTarget.selectionEnd ?? value.length,
          };
        }}
      />
      {!!chars.length && (
        <div
          className="character-palette"
          role="group"
          aria-label="Study characters"
        >
          {chars.map((char) => (
            <button
              type="button"
              className="secondary"
              key={char}
              disabled={props.disabled || props.readOnly}
              aria-label={`Insert ${char}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const { start, end } = selection.current;
                onValue(value.slice(0, start) + char + value.slice(end));
                requestAnimationFrame(() => {
                  input.current?.focus();
                  input.current?.setSelectionRange(
                    start + char.length,
                    start + char.length,
                  );
                });
              }}
            >
              {char}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
export function CanonicalAnswer({ answer }: { answer: string }) {
  return (
    <p className="expected-answer">
      Correct answer: <mark>{answer}</mark>
    </p>
  );
}
