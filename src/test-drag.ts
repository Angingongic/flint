import { fireEvent } from "@testing-library/react";
export function mouseDrag(source: Element, target: Element, edge = false) {
  const oldPointer = window.PointerEvent,
    oldHit = document.elementFromPoint,
    oldRect = target.getBoundingClientRect;
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: MouseEvent,
  });
  document.elementFromPoint = () => target;
  target.getBoundingClientRect = () => ({
    top: 0,
    left: 0,
    bottom: 200,
    right: 200,
    width: 200,
    height: 200,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  try {
    fireEvent.pointerDown(source, { button: 0, clientX: 300, clientY: 300 });
    fireEvent.pointerMove(window, { clientX: 100, clientY: edge ? 10 : 100 });
    fireEvent.pointerUp(window, { clientX: 100, clientY: edge ? 10 : 100 });
  } finally {
    Object.defineProperty(window, "PointerEvent", {
      configurable: true,
      value: oldPointer,
    });
    document.elementFromPoint = oldHit;
    target.getBoundingClientRect = oldRect;
  }
}
