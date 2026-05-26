/**
 * "Tiers" line — tsnuke's unique angle over react-doctor. Shows which of the four
 * emission tiers actually fired in this run, at a glance.
 *
 *   Tiers   SYN ●●●  TYP ●●  GRAPH ─  CFG ─
 *
 * `●` per distinct rule (capped at 5 so a long tail of SYN rules doesn't wrap),
 * `─` when the tier was clean. Pure string; the colour comes from the theme helpers.
 */
import type { TierBreakdown } from "./format-agent.js";
import { dim, gray } from "./theme.js";

const DOT_CAP = 5;

function tierCell(name: string, rules: number, color: boolean): string {
  if (rules === 0) return `${name} ${gray(color, "─")}`;
  const dots = "●".repeat(Math.min(rules, DOT_CAP));
  const tail = rules > DOT_CAP ? gray(color, `+${rules - DOT_CAP}`) : "";
  return `${name} ${dots}${tail}`;
}

/** Render the tier line. Empty string when everything is clean. */
export function renderTierLine(breakdown: TierBreakdown, color: boolean): string {
  const total =
    breakdown.SYN.rules +
    breakdown.TYP.rules +
    breakdown.GRAPH.rules +
    breakdown.CFG.rules;
  if (total === 0) return "";
  return (
    `  ${dim(color, "Tiers")}   ` +
    [
      tierCell("SYN", breakdown.SYN.rules, color),
      tierCell("TYP", breakdown.TYP.rules, color),
      tierCell("GRAPH", breakdown.GRAPH.rules, color),
      tierCell("CFG", breakdown.CFG.rules, color),
    ].join("  ")
  );
}
