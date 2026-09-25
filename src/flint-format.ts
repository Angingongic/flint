export const FLINT_FORMAT_NAMES = ["Prelude", "Aria", "Cadence", "Sonata", "Nocturne", "Coda", "Chorus", "Rhapsody"] as const;
export const SUPPORTED_FLINT_FORMAT = 4;
export function flintFormatName(version: number): string | null {
  return Number.isInteger(version) ? FLINT_FORMAT_NAMES[version - 1] || null : null;
}
export type FormatIssue = { kind: "unsupported" | "corrupt" | "not-flint"; version?: number; minimumFlintVersion?: string; detail: string; repairable?: boolean };
export function parseFormatIssue(error: string): FormatIssue | null {
  try { const value = JSON.parse(error); return ["unsupported","corrupt","not-flint"].includes(value.kind) ? value : null; } catch { return null; }
}
export function formatIssueMessage(issue: FormatIssue): string {
  const name = flintFormatName(issue.version || 0);
  if (issue.kind === "not-flint") return "This is not a recognized Flint set. " + issue.detail;
  if (issue.kind === "unsupported") return [
    name ? `This set uses Flint format: ${name}.` : issue.version && issue.version>SUPPORTED_FLINT_FORMAT ? "This set uses a newer Flint file format." : "This set uses an unidentified Flint file format.",
    `You're using Flint format: ${flintFormatName(SUPPORTED_FLINT_FORMAT)}. Your version of Flint cannot open it.`,
    issue.minimumFlintVersion ? `Requires Flint ${issue.minimumFlintVersion} or newer. Please update Flint.` : "Please update Flint.",
  ].join("\n\n");
  return `${name ? `This ${name} set` : "This Flint set"} appears to be damaged.\n\n${issue.detail}`;
}
