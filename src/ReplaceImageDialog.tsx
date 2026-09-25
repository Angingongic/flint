import { Modal } from "./ui";

/** Replacement is explicit; cancelling never stores or retires media. */
export function ReplaceImageDialog({onCancel,onReplace}:{onCancel:()=>void;onReplace:()=>void}) {
  return <Modal title="Replace existing image?" onClose={onCancel}>
    <p>This field can contain one image. Its text will stay unchanged.</p>
    <div className="dialog-actions">
      <button type="button" autoFocus className="secondary" onClick={onCancel}>Cancel</button>
      <button type="button" className="primary" onClick={onReplace}>Replace</button>
    </div>
  </Modal>;
}
