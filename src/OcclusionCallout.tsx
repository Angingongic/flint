import { regionAnchor, regionConnector, regionColor, type Region } from "./structured";
import type { CSSProperties } from "react";

/** Shared normalized geometry: resizing the image scales labels and connectors together. */
export function OcclusionLeader({ region }: { region: Region }) {
  const anchor = regionAnchor(region);
  const end = regionConnector(region);
  return <svg className="occlusion-leader" style={{"--callout-color":regionColor(region)} as CSSProperties} viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true" data-leader-id={region.id}>
    <line x1={anchor.x * 1000} y1={anchor.y * 1000} x2={end.x * 1000} y2={end.y * 1000} />
  </svg>;
}

export const calloutStyle = (region: Region) => ({
  "--callout-color":regionColor(region),
  left: `${region.x * 100}%`, top: `${region.y * 100}%`,
  width: `${region.width * 100}%`, minHeight: `${region.height * 100}%`,
} as CSSProperties);
export const anchorStyle = (region: Region) => {
  const anchor = regionAnchor(region);
  return { "--callout-color":regionColor(region),left: `${anchor.x * 100}%`, top: `${anchor.y * 100}%` } as CSSProperties;
};
