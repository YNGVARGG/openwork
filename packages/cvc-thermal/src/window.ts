/**
 * Module 02 - thermal transmittance of a window, door or other bay.
 *
 * PURPOSE
 *
 * Build the U of a complete window from its parts - glazing, frame and the glazing/frame junction -
 * instead of treating the glazing's U as the window's. The roadmap names this specific error: a
 * window is a frame plus a glazing plus the spacer between them, and its U is an area-weighted
 * combination of the three, not the glazing figure.
 *
 * SUPPORTED CASES
 *
 *   - one window, door or curtain-wall unit described by its glazing area, frame area and glazing
 *     perimeter, each with its own U and its own source;
 *   - the degenerate single-pane case with no frame (Af = 0, lg = 0), which correctly reduces to
 *     Uw = Ug;
 *   - a negative linear transmittance for the spacer, which is physically possible for a warm-edge
 *     product and must not be clamped to zero.
 *
 * EXPLICIT EXCLUSIONS
 *
 *   - Uf and psi_g are NOT computed here. EN ISO 10077-2 computes them numerically from the frame
 *     geometry and materials; that is a different method and a different module. This module takes
 *     them as declared, sourced inputs, and says in its result which ones came in unverified;
 *   - solar and light properties: the solar factor g, the light transmittance and the shading
 *     factor are separate quantities used by the solar-gain module. A thermal U says nothing about
 *     them, and a low U does not imply a good solar factor;
 *   - shading devices, overhangs and reveals: they change the incident radiation, not the U;
 *   - installation thermal bridges around the bay (module 03);
 *   - air permeability of the bay, which belongs with the air-change calculation;
 *   - curved, shaped or heavily subdivided units: the area-weighted sum still holds, but the
 *     glazing perimeter must then count every glazing edge, including those against a mullion. The
 *     rectangle helper below is offered only for a single rectangular glazing and says so.
 *
 * METHOD
 *
 *   Uw = (Ag x Ug + Af x Uf + lg x psi_g) / (Ag + Af)
 *
 *   Ag      glazing area, m2
 *   Ug      glazing U, W/(m2*K)
 *   Af      frame area, m2
 *   Uf      frame U, W/(m2*K)
 *   lg      glazing perimeter against the frame, m
 *   psi_g   linear thermal transmittance of the glazing/frame junction, W/(m*K)
 *
 * SOURCE POSITION
 *
 * The EN ISO 10077-1 text has NOT been consulted while writing this module. The equation above is
 * the classical area-weighted form; whether the edition in force states it exactly this way, and
 * what it says about the treatment of a mullion or a transom, is for a reviewer holding the text
 * to confirm. Nothing here asserts a coefficient: Ug, Uf and psi_g all arrive from the project.
 *
 * NOTHING IN THIS MODULE IS EVIDENCE OF REGULATORY COMPLIANCE.
 */

import { firstNonFinite, firstNonFiniteIn } from "./guards.js";
import type { CoefficientVerification, SourceReference } from "./provenance.js";
import type { RoundingRule } from "./opaque-wall.js";

/** One sourced performance value for a window part. */
export interface SourcedWindowValue {
  /** The value, in the unit named by the field that holds it. */
  readonly value: number;
  /** Where it comes from: a manufacturer document, a test report, a calculation. */
  readonly source: SourceReference;
  /** How far that claim has been checked. */
  readonly verification: CoefficientVerification;
}

/** Everything the module needs to describe one bay. */
export interface WindowElementInput {
  /** Identifies the bay in the result and in any error message. */
  readonly elementId: string;
  /** Glazing area, m2, and the glazing U, W/(m2*K). */
  readonly glazing: {
    readonly areaM2: number;
    readonly uWm2K: SourcedWindowValue;
  };
  /** Frame area, m2, and the frame U, W/(m2*K). Zero area is allowed for a frameless unit. */
  readonly frame: {
    readonly areaM2: number;
    readonly uWm2K: SourcedWindowValue;
  };
  /** Glazing perimeter against the frame, m, and the junction's linear transmittance, W/(m*K). */
  readonly spacer: {
    readonly perimeterM: number;
    readonly psiWmK: SourcedWindowValue;
  };
  /** Optional rounding for reporting. The exact U is always returned too. */
  readonly rounding?: RoundingRule;
}

/** The three contributions and the resulting U, with the units of each term. */
export interface WindowElementResult {
  readonly elementId: string;
  /** Ag + Af, m2. */
  readonly totalAreaM2: number;
  /** Af / (Ag + Af), dimensionless. A large frame fraction is why Uw can sit well above Ug. */
  readonly frameFraction: number;
  /** Ag x Ug, W/K. */
  readonly glazingContributionWK: number;
  /** Af x Uf, W/K. */
  readonly frameContributionWK: number;
  /** lg x psi_g, W/K. May be negative for a warm-edge spacer. */
  readonly spacerContributionWK: number;
  /** The sum of the three, W/K. */
  readonly totalContributionWK: number;
  /** totalContribution / totalArea, W/(m2*K). Exact; never rounded in place. */
  readonly uWm2K: number;
  /** The rounded U, or null when no rounding rule was given. */
  readonly uRoundedWm2K: number | null;
  /** The glazing U as declared, so the two can be compared without reopening the input. */
  readonly glazingUWm2K: number;
  /** True when the declared Uw equals the declared Ug, which is only correct for a frameless unit. */
  readonly equalsGlazingU: boolean;
  /** What this U does NOT include. Printed so a reader cannot mistake it for a complete bay. */
  readonly exclusions: readonly string[];
}

/** Everything a window U leaves out. */
export const WINDOW_EXCLUSIONS: readonly string[] = Object.freeze([
  "the frame and spacer properties themselves (EN ISO 10077-2); they are declared inputs here",
  "solar factor, light transmittance and shading; a thermal U says nothing about summer behaviour",
  "shading devices, overhangs and reveals, which change incident radiation rather than U",
  "installation thermal bridges around the bay (module 03)",
  "air permeability of the bay, which belongs with the air-change calculation",
]);

/** Why a window input was refused. Codes are stable so a caller can branch on them. */
export type WindowIssueCode =
  | "missing-element-id"
  | "non-finite-value"
  | "negative-area"
  | "non-positive-glazing-area"
  | "non-positive-total-area"
  | "negative-u-value"
  | "negative-perimeter"
  | "missing-source"
  | "unknown-verification"
  /** The arithmetic produced something that is not a physical result. See guards.ts. */
  | "non-finite-result"
  | "invalid-rounding";

/** A refused window input, naming the exact field. Never a silent default. */
export class WindowInputError extends Error {
  override readonly name = "WindowInputError";
  constructor(
    readonly code: WindowIssueCode,
    readonly path: string,
    detail: string,
  ) {
    super(`${path}: ${detail} [${code}]`);
  }
}

function finite(value: unknown, path: string, code: WindowIssueCode = "non-finite-value"): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new WindowInputError(code, path, `expected a finite number, received ${JSON.stringify(value)}`);
  }
  return value;
}

function sourcedValue(raw: SourcedWindowValue | undefined, path: string, allowNegative: boolean): number {
  if (raw === null || typeof raw !== "object") {
    throw new WindowInputError("missing-source", path, "expected { value, source, verification }");
  }
  const value = finite(raw.value, `${path}.value`);
  if (!allowNegative && value < 0) {
    throw new WindowInputError("negative-u-value", `${path}.value`, `must be >= 0, received ${value}`);
  }
  if (raw.source === null || typeof raw.source !== "object" || typeof raw.source.document !== "string" || raw.source.document.trim() === "") {
    throw new WindowInputError("missing-source", `${path}.source`, "a declared performance value must name its source");
  }
  const verification = raw.verification;
  if (verification !== "project-declared" && verification !== "inherited-from-existing-engine" && verification !== "verified-against-standard-text") {
    throw new WindowInputError("unknown-verification", `${path}.verification`, `unknown verification status ${JSON.stringify(verification)}`);
  }
  return value;
}

/**
 * Compute the area-weighted U of one bay.
 *
 * Deterministic: same input, same output, no clock, no I/O, no model. Every term of the sum is
 * returned separately so a reviewer can re-add them by hand.
 *
 * @throws WindowInputError when any input is missing, non-finite or out of domain.
 */
export function computeWindow(input: WindowElementInput): WindowElementResult {
  const elementId = input?.elementId;
  if (typeof elementId !== "string" || elementId.trim() === "") {
    throw new WindowInputError("missing-element-id", "elementId", "expected a non-empty string");
  }

  const glazingAreaM2 = finite(input?.glazing?.areaM2, "glazing.areaM2");
  if (glazingAreaM2 <= 0) {
    throw new WindowInputError("non-positive-glazing-area", "glazing.areaM2", `must be > 0, received ${glazingAreaM2}`);
  }
  const frameAreaM2 = finite(input?.frame?.areaM2, "frame.areaM2");
  if (frameAreaM2 < 0) {
    throw new WindowInputError("negative-area", "frame.areaM2", `must be >= 0, received ${frameAreaM2}`);
  }
  const perimeterM = finite(input?.spacer?.perimeterM, "spacer.perimeterM");
  if (perimeterM < 0) {
    throw new WindowInputError("negative-perimeter", "spacer.perimeterM", `must be >= 0, received ${perimeterM}`);
  }

  const ug = sourcedValue(input?.glazing?.uWm2K, "glazing.uWm2K", false);
  const uf = sourcedValue(input?.frame?.uWm2K, "frame.uWm2K", false);
  // A warm-edge spacer has a negative psi_g. It must pass through, not be clamped.
  const psi = sourcedValue(input?.spacer?.psiWmK, "spacer.psiWmK", true);

  const totalAreaM2 = glazingAreaM2 + frameAreaM2;
  if (!(totalAreaM2 > 0)) {
    throw new WindowInputError("non-positive-total-area", "glazing.areaM2", "glazing plus frame area must be > 0");
  }

  const glazingContributionWK = glazingAreaM2 * ug;
  const frameContributionWK = frameAreaM2 * uf;
  const spacerContributionWK = perimeterM * psi;
  const totalContributionWK = glazingContributionWK + frameContributionWK + spacerContributionWK;
  if (totalContributionWK < 0) {
    throw new WindowInputError("negative-u-value", "total", `the summed contribution is negative (${totalContributionWK} W/K); review psi_g and the declared areas`);
  }
  const uWm2K = totalContributionWK / totalAreaM2;

  // The result guard: every figure above may be finite while the arithmetic leaves the double range.
  // With 1e308 m2 on both sides the sum overflows and the quotient is NaN, which propagates silently
  // through every later comparison. See guards.ts for why this is shared and not written per module.
  const offender = firstNonFinite({ totalAreaM2, totalContributionWK, glazingContributionWK, frameContributionWK, spacerContributionWK, uWm2K });
  if (offender !== null) {
    throw new WindowInputError(
      "non-finite-result",
      "uWm2K",
      `the window's arithmetic produced ${offender}, which is not a physical result. Every declared figure is finite, so this is an arithmetic limit and not a declaration error: check the areas, because a frame area or a glazed area that large is a unit or a decimal point rather than a window`,
    );
  }

  let uRoundedWm2K: number | null = null;
  const rounding = input?.rounding;
  if (rounding !== undefined) {
    const decimals = rounding?.decimals;
    if (typeof decimals !== "number" || !Number.isInteger(decimals) || decimals < 0 || decimals > 12) {
      throw new WindowInputError("invalid-rounding", "rounding.decimals", "expected an integer between 0 and 12");
    }
    const factor = 10 ** decimals;
    // The identical rounding path to module 01, with the identical defect, found by the same review:
    // see the comment there for why an overflowed scaling means the rounding is a no-op rather than a
    // reason to refuse.
    const scaled = uWm2K * factor;
    uRoundedWm2K = Number.isFinite(scaled) ? Math.round(scaled) / factor : uWm2K;
  }

  const result: WindowElementResult = {
    elementId,
    totalAreaM2,
    frameFraction: frameAreaM2 / totalAreaM2,
    glazingContributionWK,
    frameContributionWK,
    spacerContributionWK,
    totalContributionWK,
    uWm2K,
    uRoundedWm2K,
    glazingUWm2K: ug,
    // Exact equality only matters for the frameless case; near-equality with a frame present is a
    // sign the caller passed Ug straight through, which the result makes visible.
    equalsGlazingU: uWm2K === ug,
    exclusions: WINDOW_EXCLUSIONS,
  };

  // The final guard on the finished result: the rounded U is produced after the checks above, and
  // "after the guard" is where the class survives. Same walk as module 01, same reason.
  const roundedOffender = firstNonFiniteIn(result);
  if (roundedOffender !== null) {
    throw new WindowInputError(
      "non-finite-result",
      "result",
      `the finished result contains ${roundedOffender}, which is not a physical value. Every declared figure is finite and every intermediate checked above passed, so this is an arithmetic limit rather than a declaration error`,
    );
  }

  return result;
}

/**
 * The glazing perimeter of ONE rectangular glazing, m: 2 x (width + height).
 *
 * Offered because it is the common case and because writing it by hand is where a factor of two
 * goes missing. NOT valid for a subdivided unit: a mullion or a transom adds glazing edges, and
 * those edges carry their own junction. Use the declared perimeter for anything but a single pane.
 */
export function rectangularGlazingPerimeterM(widthM: number, heightM: number): number {
  const width = finite(widthM, "widthM");
  const height = finite(heightM, "heightM");
  if (width <= 0) throw new WindowInputError("non-positive-glazing-area", "widthM", `must be > 0, received ${width}`);
  if (height <= 0) throw new WindowInputError("non-positive-glazing-area", "heightM", `must be > 0, received ${height}`);
  const perimeter = 2 * (width + height);
  if (!Number.isFinite(perimeter)) {
    throw new WindowInputError(
      "non-finite-result",
      "rectangularGlazingPerimeterM",
      "the perimeter arithmetic overflowed; check the declared dimensions against their units",
    );
  }
  return perimeter;
}
