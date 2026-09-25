import { ReactNode, useEffect, useRef } from "react";
import { X } from "lucide-react";
export function Modal({
  title,
  children,
  onClose,
  dismissOutside = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  dismissOutside?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current,
      previous = document.activeElement as HTMLElement | null;
    dialog?.showModal?.();
    return () => {
      dialog?.close?.();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      open={
        typeof HTMLDialogElement === "undefined" ||
        !HTMLDialogElement.prototype.showModal
          ? true
          : undefined
      }
      className="flint-modal"
      aria-label={title}
      onClick={event=>{
        if(!dismissOutside||event.target!==event.currentTarget)return;
        const rect=event.currentTarget.getBoundingClientRect();
        if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeRef.current();
      }}
      onCancel={(e) => {
        e.preventDefault();
        // React delegates cancel events: a nested editor must not cancel its parent draft.
        e.stopPropagation();
        closeRef.current();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon" aria-label="Close dialog" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
