/**
 * Module 01 - thermal resistance and U-value of an opaque wall.
 *
 * PURPOSE
 *
 * Turn a declared layer build-up into the thermal resistance of every layer, the total resistance
 * of the element and its steady-state thermal transmittance U. This is the first input the winter
 * heat-loss chain needs: without a U for each opaque element there is no transmission coefficient,
 * and every downstream figure inherits whatever this module got wrong.
 *
 * SUPPORTED CASES
 *
 *   - plane, opaque, thermally homogeneous elements: walls, roofs, floors above outside air;
 *   - any number of layers, each either a conductive layer (thickness + conductivity) or a
 *     layer declared by its resistance alone (thin products, air cavities, membranes);
 *   - the three heat-flow directions, because the internal surface resistance depends on them.
 *
 * EXPLICIT EXCLUSIONS - each one is a different method and belongs to a different module
 *
 *   - windows, doors and other transparent elements (EN ISO 10077-1): module 02. This module does
 *     not accept a "window" whose U is fed in as a layer, because a window's U is not a sum of
 *     layer resistances;
 *   - linear and point thermal bridges at junctions: module 03. The U returned here is the
 *     one-dimensional U of the undisturbed element; it is NOT corrected for junctions, and the
 *     result says so;
 *   - elements in contact with the ground (EN ISO 13370): module 05. A floor on grade is not an
 *     element exchanging heat with outside air, and treating it as one is the specific error the
 *     roadmap calls out;
 *   - moisture-dependent conductivity corrections (EN ISO 10456): a corrected lambda may be
 *     supplied by the project, but this module does not compute one;
 *   - mechanical fasteners, inverted roofs and other corrections that raise U above the
 *     one-dimensional value: excluded, not approximated;
 *   - unheated adjacent spaces: module 04 solves the buffer temperature, which changes the
 *     temperature difference, not the U;
 *   - dynamic, inertia and summer behaviour: a steady-state U has nothing to say about them.
 *
 * METHOD
 *
 *   R_layer     = e / lambda                                  [m2*K/W], e in m, lambda in W/(m*K)
 *   R_total     = R_si + sum(R_layer) + R_se                  [m2*K/W]
 *   U           = 1 / R_total                                 [W/(m2*K)]
 *
 * These three lines are the whole method, and they are not in dispute; what has to be declared is
 * the pair (R_si, R_se) and the conductivity of each layer. Both are treated as sourced inputs
 * here rather than as constants baked into the code, because a U is only as defensible as the
 * values that produced it.
 *
 * SOURCE POSITION - READ THIS BEFORE USING A RESULT
 *
 * The catalogue below is transcribed from values this repository already documents and cites
 * (see packages/kernel/src/loads.ts). **The EN ISO 6946 text itself has not been consulted while
 * writing this module**, so those entries are marked "inherited-from-existing-engine". They are
 * offered as a convenience, never as an authority: a study that needs a defensible surface
 * resistance should pass its own pair with its own source and mark it "verified-against-standard-
 * text". The catalogue also fixes no edition, because none is established here.
 *
 * NOTHING IN THIS MODULE IS EVIDENCE OF REGULATORY COMPLIANCE.
 */

import { firstNonFiniteIn } from "./guards.js";
import type { CoefficientVerification, SourceReference, Sourced } from "./provenance.js";

/** The direction heat crosses the element, which selects the internal surface resistance. */
export type HeatFlowDirection = "upward" | "horizontal" | "downward";

/** Applied to a result only when a study asks for it; no rounding convention is assumed. */
export interface RoundingRule {
  /** Decimal places kept on the rounded U-value. */
  readonly decimals: number;
}

/** One layer of a build-up. */
export type WallLayer =
  | {
      /** A product of known thickness and conductivity. */
      readonly kind: "conductive";
      /** Name as it appears on the product document. */
      readonly name: string;
      /** Thickness, m. Must be > 0. */
      readonly thicknessM: number;
      /** Declared thermal conductivity lambda, W/(m*K). Must be > 0. */
      readonly lambdaWmK: number;
      /** Where lambda comes from. Omitted means the project did not say. */
      readonly source?: SourceReference;
    }
  | {
      /** A layer declared by its resistance, for products that are not a simple e/lambda. */
      readonly kind: "resistive";
      /** Name as it appears on the product document. */
      readonly name: string;
      /** Thermal resistance, m2*K/W. Must be >= 0. */
      readonly resistanceM2KW: number;
      /** Where the resistance comes from. Omitted means the project did not say. */
      readonly source?: SourceReference;
    };

/** Everything the module needs. Nothing is optional: a missing value is a refusal, not a default. */
export interface OpaqueWallInput {
  /** Identifies the element in the result and in any error message. */
  readonly elementId: string;
  /** Heat-flow direction, which selects the internal surface resistance. */
  readonly direction: HeatFlowDirection;
  /** Internal surface resistance and its source. */
  readonly rsi: Sourced<number>;
  /** External surface resistance and its source. */
  readonly rse: Sourced<number>;
  /** Layers in the order heat crosses them. At least one. */
  readonly layers: readonly WallLayer[];
  /**
   * What is being declared. Omitted means "opaque", which is what this module's arithmetic assumes.
   *
   * A "window" or a "door" is REFUSED here rather than approximated: a glazing is not a layer stack,
   * and module 02 composes its Ug, Uf and psi_g. See `requireOpaqueElementKind` for why this guard
   * exists - this repository has already made that mistake once, with a quantified consequence.
   */
  readonly elementKind?: "opaque" | "window" | "door" | undefined;
  /** Optional rounding for reporting. The exact U is always returned too. */
  readonly rounding?: RoundingRule;
}

/** The resistance one layer contributes, and what it was computed from. */
export interface LayerResistance {
  readonly name: string;
  readonly kind: WallLayer["kind"];
  /** Thickness in m, or null for a layer declared by resistance. */
  readonly thicknessM: number | null;
  /** Conductivity in W/(m*K), or null for a layer declared by resistance. */
  readonly lambdaWmK: number | null;
  /** This layer's resistance, m2*K/W. */
  readonly resistanceM2KW: number;
  /** The layer's own source, or null when the project declared none. */
  readonly source: SourceReference | null;
}

/** The full result, with every intermediate a reviewer needs to re-derive it. */
export interface OpaqueWallResult {
  readonly elementId: string;
  readonly direction: HeatFlowDirection;
  readonly layers: readonly LayerResistance[];
  /** Sum of the layer resistances only, m2*K/W. */
  readonly rLayersM2KW: number;
  /** Internal surface resistance used, m2*K/W. */
  readonly rsiM2KW: number;
  /** External surface resistance used, m2*K/W. */
  readonly rseM2KW: number;
  /** R_si + sum(R_layer) + R_se, m2*K/W. */
  readonly rTotalM2KW: number;
  /** 1 / R_total, W/(m2*K). Exact; never rounded in place. */
  readonly uWm2K: number;
  /** The rounded U, or null when no rounding rule was given. */
  readonly uRoundedWm2K: number | null;
  /** What the surface resistances are worth as evidence. */
  readonly surfaceResistanceVerification: CoefficientVerification;
  readonly surfaceResistanceSource: SourceReference;
  /** What this U does NOT include. Printed so a reader cannot mistake it for a complete element. */
  readonly exclusions: readonly string[];
}

/** Everything a U-value of an undisturbed opaque element leaves out. */
export const OPAQUE_WALL_EXCLUSIONS: readonly string[] = Object.freeze([
  "junctions and linear/point thermal bridges (module 03); this is the one-dimensional U",
  "ground contact and buried walls: the ground method is roadmap item 10 and is BLOCKED pending reference, so no module in this package treats them yet - a floor on grade is not an outside-air element",
  "moisture-dependent conductivity correction (EN ISO 10456)",
  "mechanical fasteners, inverted roofs and other corrections that raise U above the one-dimensional value (EN ISO 6946's own corrections, which are coefficients this module will not invent)",
  "glazing and doors declared as layer stacks: REFUSED, because a glazing is not a homogeneous build-up (module 02 composes Ug, Uf and psi_g)",
  "unheated adjacent spaces, which change the temperature difference rather than the U (module 04)",
  "dynamic and inertia effects; a steady-state U does not describe them",
]);

/**
 * Internal surface resistance by heat-flow direction, and the external value.
 *
 * TRANSCRIBED, NOT CONSULTED. These are the values this repository's existing engine applies and
 * cites to EN ISO 6946. They are reproduced here so a new module can be written and tested without
 * silently depending on the engine, and they are marked as inherited for exactly that reason.
 */
export const SURFACE_RESISTANCES_CATALOGUE: Readonly<Record<HeatFlowDirection, Sourced<number>>> =
  Object.freeze({
    upward: Object.freeze({
      value: 0.1,
      source: Object.freeze({
        document: "EN ISO 6946",
        note: "internal surface resistance, heat flow upward, as applied by packages/kernel/src/loads.ts",
      }),
      verification: "inherited-from-existing-engine" as const,
    }),
    horizontal: Object.freeze({
      value: 0.13,
      source: Object.freeze({
        document: "EN ISO 6946",
        note: "internal surface resistance, horizontal heat flow, as applied by packages/kernel/src/loads.ts",
      }),
      verification: "inherited-from-existing-engine" as const,
    }),
    downward: Object.freeze({
      value: 0.17,
      source: Object.freeze({
        document: "EN ISO 6946",
        note: "internal surface resistance, heat flow downward, as applied by packages/kernel/src/loads.ts",
      }),
      verification: "inherited-from-existing-engine" as const,
    }),
  });

/** The external surface resistance, identical in the three directions. */
export const EXTERNAL_SURFACE_RESISTANCE: Sourced<number> = Object.freeze({
  value: 0.04,
  source: Object.freeze({
    document: "EN ISO 6946",
    note: "external surface resistance, all directions, as applied by packages/kernel/src/loads.ts",
  }),
  verification: "inherited-from-existing-engine" as const,
});

/** Why an input was refused. Codes are stable so a caller can branch on them. */
export type OpaqueWallIssueCode =
  | "missing-element-id"
  | "unknown-direction"
  | "missing-layers"
  | "layer-not-an-object"
  | "unknown-layer-kind"
  | "missing-layer-name"
  | "non-finite-value"
  | "non-positive-thickness"
  | "non-positive-conductivity"
  | "negative-resistance"
  | "invalid-surface-resistance"
  /** A glazing or a door declared as a layer stack, which ISO 6946 does not describe. */
  | "not-an-opaque-element"
  /** The arithmetic produced something that is not a physical result. See the guard below. */
  | "non-finite-result"
  | "invalid-rounding";

/** A refused input, naming the exact field. Never a silent default. */
export class OpaqueWallInputError extends Error {
  override readonly name = "OpaqueWallInputError";
  constructor(
    readonly code: OpaqueWallIssueCode,
    readonly path: string,
    detail: string,
  ) {
    super(`${path}: ${detail} [${code}]`);
  }
}

function requireFinite(value: unknown, path: string, code: OpaqueWallIssueCode): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new OpaqueWallInputError(code, path, `expected a finite number, received ${JSON.stringify(value)}`);
  }
  return value;
}

function requireNonEmptyString(value: unknown, path: string, code: OpaqueWallIssueCode): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new OpaqueWallInputError(code, path, "expected a non-empty string");
  }
  return value;
}

/**
 * Compute the layer resistances, the total resistance and the U-value.
 *
 * Deterministic: same input, same output, no clock, no I/O, no model. Every arithmetic step is
 * returned in the result so an independent reader can reproduce it by hand.
 *
 * @throws OpaqueWallInputError when any input is missing, non-finite or out of domain.
 */
export function computeOpaqueWall(input: OpaqueWallInput): OpaqueWallResult {
  const elementId = requireNonEmptyString(input?.elementId, "elementId", "missing-element-id");

  const direction = input?.direction;
  if (direction !== "upward" && direction !== "horizontal" && direction !== "downward") {
    throw new OpaqueWallInputError("unknown-direction", "direction", `unknown heat-flow direction ${JSON.stringify(direction)}`);
  }

  // The SAME validator the JSON parser uses: a caller that reaches this function directly is held to
  // the same provenance rule, because the result publishes these fields as its own evidence.
  const rsiSourced = requireSourcedResistance(input?.rsi, "rsi");
  const rseSourced = requireSourcedResistance(input?.rse, "rse");
  const rsi = rsiSourced.value;
  const rse = rseSourced.value;

  // ITEM 6'S VERIFICATION NOTE, AND A DEFECT THIS REPOSITORY HAS ALREADY HAD.
  //
  // The note says ISO 6946 "does not treat glazing, floors and all complex walls indistinctly", and
  // the existing engine refuses `layers` on a window or a door outright. Its docblock records why,
  // and it is not hypothetical: every fixture in this repository once declared its windows as
  // `layers: [{thicknessM: 0,004, lambdaWmK: 1}]` - four millimetres of glass - under the label
  // "double vitrage". A glazing unit is not a homogeneous layer stack (its performance lives in the
  // cavity and the coating), so that build-up computed to U = 5,747 W/(m2*K), a SINGLE-glazed value,
  // and it accounted for 62 % of one room's transmission. The engine was faithful and the document
  // was nonsense.
  //
  // This module is the other place that mistake can be made, so it refuses it for the same reason
  // and with the same words: a window is module 02's subject.
  const elementKind = requireOpaqueElementKind(input?.elementKind);

  const layers = input?.layers;
  if (!Array.isArray(layers) || layers.length === 0) {
    throw new OpaqueWallInputError("missing-layers", "layers", "an opaque element needs at least one layer");
  }

  const resolved: LayerResistance[] = [];
  let rLayersM2KW = 0;

  layers.forEach((layer, index) => {
    const path = `layers[${index}]`;
    if (layer === null || typeof layer !== "object") {
      throw new OpaqueWallInputError("layer-not-an-object", path, "expected an object");
    }
    const name = requireNonEmptyString(layer.name, `${path}.name`, "missing-layer-name");
    if (layer.kind === "conductive") {
      const thicknessM = requireFinite(layer.thicknessM, `${path}.thicknessM`, "non-finite-value");
      if (thicknessM <= 0) {
        throw new OpaqueWallInputError("non-positive-thickness", `${path}.thicknessM`, `must be > 0, received ${thicknessM}`);
      }
      const lambdaWmK = requireFinite(layer.lambdaWmK, `${path}.lambdaWmK`, "non-finite-value");
      if (lambdaWmK <= 0) {
        throw new OpaqueWallInputError("non-positive-conductivity", `${path}.lambdaWmK`, `must be > 0, received ${lambdaWmK}`);
      }
      const resistanceM2KW = thicknessM / lambdaWmK;
      rLayersM2KW += resistanceM2KW;
      resolved.push({
        name,
        kind: "conductive",
        thicknessM,
        lambdaWmK,
        resistanceM2KW,
        source: layer.source ?? null,
      });
      return;
    }
    if (layer.kind === "resistive") {
      const resistanceM2KW = requireFinite(layer.resistanceM2KW, `${path}.resistanceM2KW`, "non-finite-value");
      if (resistanceM2KW < 0) {
        throw new OpaqueWallInputError("negative-resistance", `${path}.resistanceM2KW`, `must be >= 0, received ${resistanceM2KW}`);
      }
      rLayersM2KW += resistanceM2KW;
      resolved.push({
        name,
        kind: "resistive",
        thicknessM: null,
        lambdaWmK: null,
        resistanceM2KW,
        source: layer.source ?? null,
      });
      return;
    }
    throw new OpaqueWallInputError("unknown-layer-kind", `${path}.kind`, `unknown layer kind ${JSON.stringify(layer.kind)}`);
  });

  const rTotalM2KW = rsi + rLayersM2KW + rse;

  // THE RESULT IS GUARDED, NOT ONLY THE INPUTS. Every individual figure above can be finite while the
  // SUM is not: a layer of thickness 1e308 and conductivity 0,5 has a resistance of 2e308, which is
  // Infinity in double precision, and the old "must be > 0" test was satisfied by it - so U came back
  // as 1/Infinity = 0, a physically impossible value that no reader would question because zero looks
  // like a perfectly good number. The guard covers the sum overflowing, the sum underflowing to a
  // denormal, and the reciprocal overflowing, in one place and for any future layer kind.
  if (!(rTotalM2KW > 0)) {
    // Only reachable when every resistance is zero, which cannot happen with a positive layer
    // resistance but can with a single resistive layer declared as 0 and zero surface resistances.
    throw new OpaqueWallInputError("invalid-surface-resistance", "rTotal", "total resistance must be > 0");
  }
  if (!Number.isFinite(rTotalM2KW)) {
    throw new OpaqueWallInputError(
      "non-finite-result",
      "rTotal",
      `the build-up's total resistance overflows to ${rTotalM2KW} m2*K/W. The individual figures are finite, so this is an arithmetic limit and not a declaration error: check the layer thicknesses and conductivities against their units, because a thickness in millimetres or a conductivity in mW/(m*K) produces exactly this`,
    );
  }
  const uWm2K = 1 / rTotalM2KW;
  if (!Number.isFinite(uWm2K) || uWm2K <= 0) {
    throw new OpaqueWallInputError(
      "non-finite-result",
      "uWm2K",
      `the U-value computed from a total resistance of ${rTotalM2KW} m2*K/W is ${uWm2K} W/(m2*K), which is not a physical result. A resistance that small is a declaration error rather than a very good wall`,
    );
  }

  const rounding = input?.rounding;
  let uRoundedWm2K: number | null = null;
  if (rounding !== undefined) {
    const decimals = rounding?.decimals;
    if (typeof decimals !== "number" || !Number.isInteger(decimals) || decimals < 0 || decimals > 12) {
      throw new OpaqueWallInputError("invalid-rounding", "rounding.decimals", "expected an integer between 0 and 12");
    }
    const factor = 10 ** decimals;
    // ROUNDING MUST NOT BE ABLE TO CREATE A NUMBER THAT CANNOT EXIST. The previous version computed
    // Math.round(uWm2K * factor) / factor unconditionally, and the independent review of round 2 found
    // the consequence: a finite uWm2K of 3,33e299 rounded to 12 decimals came back as Infinity,
    // because the scaling itself overflowed. The exact U was right and the rounded one was not.
    //
    // When the scaling overflows, the rounding is a NO-OP and this is not a fudge to avoid the
    // overflow: at |x| * 10^decimals > 2^1024 we have |x| > 1,8e296, where consecutive doubles are
    // about 1e280 apart - some 292 orders of magnitude coarser than the 10^-decimals step being asked
    // for. x is therefore already an exact multiple of that step (x = m x 2^e with e >= 252, and
    // x * 10^decimals = m x 2^(e+decimals) x 5^decimals is an integer), so x IS its own rounded value.
    // Returning it is more correct than refusing, and the result guard below still refuses anything
    // that is not finite.
    const scaled = uWm2K * factor;
    uRoundedWm2K = Number.isFinite(scaled) ? Math.round(scaled) / factor : uWm2K;
  }

  const result: OpaqueWallResult = {
    elementId,
    direction,
    layers: Object.freeze(resolved),
    rLayersM2KW,
    rsiM2KW: rsi,
    rseM2KW: rse,
    rTotalM2KW,
    uWm2K,
    uRoundedWm2K,
    surfaceResistanceVerification: rsiSourced.verification,
    surfaceResistanceSource: rsiSourced.source,
    exclusions: OPAQUE_WALL_EXCLUSIONS,
  };

  // THE FINAL GUARD, ON THE FINISHED RESULT AND NOT ON A HAND-WRITTEN LIST OF FIELDS. The checks
  // above cover the resistance and the exact U, which is what the round 1 finding was about; the
  // rounded value is produced after them, and the round 2 finding was exactly that - uRoundedWm2K
  // reached Infinity while every field checked above was finite. Walking the returned object means a
  // field added later cannot be forgotten, which is why this is a walk and not five more names.
  const offender = firstNonFiniteIn(result);
  if (offender !== null) {
    throw new OpaqueWallInputError(
      "non-finite-result",
      "result",
      `the finished result contains ${offender}, which is not a physical value. Every declared figure is finite and every intermediate checked above passed, so this is an arithmetic limit rather than a declaration error: report the input to the maintainer rather than rounding it away`,
    );
  }

  return result;
}

/**
 * Build a validated input from parsed JSON, so a project file cannot reach the calculation with a
 * missing lambda or a string where a number belongs.
 *
 * Deliberately narrow: it validates the fields this module defines, and refuses rather than
 * repairs. A layer that lost its lambda between the project file and here is an error, because a
 * silently defaulted layer is a silently wrong U. It ignores unrelated keys, so a project file may
 * carry study metadata alongside the build-up.
 */
export function parseOpaqueWallInput(value: unknown): OpaqueWallInput {
  if (value === null || typeof value !== "object") {
    throw new OpaqueWallInputError("missing-layers", "$", "expected an object");
  }
  const record = value as Record<string, unknown>;

  const elementId = requireNonEmptyString(record["elementId"], "elementId", "missing-element-id");
  // The SAME rule as the compute path, through the same function: a project file declaring a window
  // as a build-up is refused here for the same reason, and the two cannot drift.
  const elementKind = requireOpaqueElementKind(record["elementKind"]);

  const direction = record["direction"];
  if (direction !== "upward" && direction !== "horizontal" && direction !== "downward") {
    throw new OpaqueWallInputError("unknown-direction", "direction", `unknown heat-flow direction ${JSON.stringify(direction)}`);
  }

  const rsi = parseSourced(record["rsi"], "rsi");
  const rse = parseSourced(record["rse"], "rse");

  const rawLayers = record["layers"];
  if (!Array.isArray(rawLayers) || rawLayers.length === 0) {
    throw new OpaqueWallInputError("missing-layers", "layers", "an opaque element needs at least one layer");
  }
  const layers: WallLayer[] = rawLayers.map((raw, index) => parseLayer(raw, `layers[${index}]`));

  const rawRounding = record["rounding"];
  if (rawRounding === undefined) {
    return elementKind === "opaque" ? { elementId, direction, rsi, rse, layers } : { elementId, elementKind, direction, rsi, rse, layers };
  }
  if (rawRounding === null || typeof rawRounding !== "object") {
    throw new OpaqueWallInputError("invalid-rounding", "rounding", "expected an object");
  }
  const decimals = (rawRounding as Record<string, unknown>)["decimals"];
  if (typeof decimals !== "number" || !Number.isInteger(decimals) || decimals < 0 || decimals > 12) {
    throw new OpaqueWallInputError("invalid-rounding", "rounding.decimals", "expected an integer between 0 and 12");
  }
  return { elementId, direction, rsi, rse, layers, rounding: { decimals } };
}

function parseLayer(raw: unknown, path: string): WallLayer {
  if (raw === null || typeof raw !== "object") {
    throw new OpaqueWallInputError("layer-not-an-object", path, "expected an object");
  }
  const record = raw as Record<string, unknown>;
  const name = requireNonEmptyString(record["name"], `${path}.name`, "missing-layer-name");
  const kind = record["kind"];
  const source = parseOptionalSource(record["source"], `${path}.source`);
  if (kind === "conductive") {
    const thicknessM = requireFinite(record["thicknessM"], `${path}.thicknessM`, "non-finite-value");
    const lambdaWmK = requireFinite(record["lambdaWmK"], `${path}.lambdaWmK`, "non-finite-value");
    return source === null
      ? { kind, name, thicknessM, lambdaWmK }
      : { kind, name, thicknessM, lambdaWmK, source };
  }
  if (kind === "resistive") {
    const resistanceM2KW = requireFinite(record["resistanceM2KW"], `${path}.resistanceM2KW`, "non-finite-value");
    return source === null
      ? { kind, name, resistanceM2KW }
      : { kind, name, resistanceM2KW, source };
  }
  throw new OpaqueWallInputError("unknown-layer-kind", `${path}.kind`, `unknown layer kind ${JSON.stringify(kind)}`);
}

/**
 * THE ONE VALIDATOR FOR A DECLARED SURFACE RESISTANCE, USED BY BOTH ENTRY POINTS.
 *
 * The independent review of PR #1 found that parseOpaqueWallInput refused a surface resistance with
 * no source or an unknown verification level while computeOpaqueWall, called directly, accepted both
 * and then read `input.rsi.source` and `input.rsi.verification` into the result. A caller could
 * therefore obtain a U-value whose own provenance fields were undefined while the declared type said
 * they were a SourceReference.
 *
 * Writing the same rules twice is what allowed the two to drift, so they are written once. Any future
 * requirement added here applies at both entry points by construction.
 */
/**
 * The one validator for the element kind, used by BOTH entry points - the same anti-drift rule that
 * `requireSourcedResistance` follows, and for the same reason: a rule written twice drifts.
 *
 * Omitted means "opaque", which is what this module's arithmetic assumes. "window" and "door" are
 * refused: see the call site for why a glazing declared as a layer stack is a mistake this repository
 * has already made once.
 */
export function requireOpaqueElementKind(raw: unknown): "opaque" | "window" | "door" {
  if (raw === undefined) return "opaque";
  if (raw !== "opaque" && raw !== "window" && raw !== "door") {
    throw new OpaqueWallInputError("not-an-opaque-element", "elementKind", `expected "opaque", "window" or "door", received ${JSON.stringify(raw)}`);
  }
  if (raw !== "opaque") {
    throw new OpaqueWallInputError(
      "not-an-opaque-element",
      "elementKind",
      `this element is declared as a ${raw}, and a ${raw} is not described by a layer stack: a glazing unit's performance lives in its cavity and its coating, not in the conductivity of its glass. Four millimetres of glass declared as a layer computes to about 5,7 W/(m2*K), a single-glazed value, which is a mistake this repository has already made once. Use module 02, which composes Ug, Uf and psi_g`,
    );
  }
  return "opaque";
}

export function requireSourcedResistance(raw: unknown, path: string): Sourced<number> {
  if (raw === null || typeof raw !== "object") {
    throw new OpaqueWallInputError("invalid-surface-resistance", path, "expected { value, source, verification }");
  }
  const record = raw as Record<string, unknown>;
  const value = requireFinite(record["value"], `${path}.value`, "invalid-surface-resistance");
  if (value < 0) throw new OpaqueWallInputError("invalid-surface-resistance", `${path}.value`, "must be >= 0");
  const source = parseOptionalSource(record["source"], `${path}.source`);
  if (source === null) {
    throw new OpaqueWallInputError("invalid-surface-resistance", `${path}.source`, "a surface resistance must name its source");
  }
  const verification = record["verification"];
  if (verification !== "project-declared" && verification !== "inherited-from-existing-engine" && verification !== "verified-against-standard-text") {
    throw new OpaqueWallInputError("invalid-surface-resistance", `${path}.verification`, "unknown verification status");
  }
  return { value, source, verification };
}

/** Kept as the parser's own name so the JSON path reads the same as it did. */
function parseSourced(raw: unknown, path: string): Sourced<number> {
  return requireSourcedResistance(raw, path);
}

function parseOptionalSource(raw: unknown, path: string): SourceReference | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object") {
    throw new OpaqueWallInputError("invalid-surface-resistance", path, "expected an object");
  }
  const record = raw as Record<string, unknown>;
  const document = requireNonEmptyString(record["document"], `${path}.document`, "invalid-surface-resistance");
  const edition = record["edition"];
  const clause = record["clause"];
  const note = record["note"];
  return {
    document,
    ...(typeof edition === "string" && edition.trim() !== "" ? { edition } : {}),
    ...(typeof clause === "string" && clause.trim() !== "" ? { clause } : {}),
    ...(typeof note === "string" && note.trim() !== "" ? { note } : {}),
  };
}
