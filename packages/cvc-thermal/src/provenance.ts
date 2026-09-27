/**
 * Provenance for every number a CVC calculation module consumes or returns.
 *
 * WHY THIS FILE EXISTS
 *
 * A calculation module that returns a number without saying where the number comes from cannot be
 * reviewed. A reviewer can check arithmetic; a reviewer cannot check a coefficient that arrived
 * from nowhere. So every normative value that crosses this package's boundary carries:
 *
 *   - the document it comes from, and the edition where one is known;
 *   - how far that claim has actually been checked.
 *
 * THE VERIFICATION FIELD IS THE HONEST ONE
 *
 * "verified-against-standard-text" is a caller declaration that a human read the licensed standard and confirmed the
 * value and its clause. This package does not authenticate that declaration. An application must
 * bind it to its own trusted review record before presenting it as verified. Nothing in this package sets it. A module written from public summaries of
 * a standard must never claim it, which is why the catalogue entries below are marked
 * "inherited-from-existing-engine": they are transcribed from values already documented in this
 * repository, and this package has NOT consulted the standard text.
 *
 * Consequence, stated plainly: **no result of this package is evidence of regulatory compliance.**
 */

/** How far a value's source claim has actually been checked. */
export type CoefficientVerification =
  /** The project declares the value for this study. The value is the engineer's, not the module's. */
  | "project-declared"
  /** Transcribed from a value already documented in this repository. The standard text was not read. */
  | "inherited-from-existing-engine"
  /** A human read the licensed standard text and confirmed this value and clause. */
  | "verified-against-standard-text";

/**
 * The three allowed verification statuses, AS DATA.
 *
 * Written after a package-wide sweep of declared literals found that **21 of the 30 modules that read a
 * Sourced value accepted any string at all** in this field. The consequence is worse here than for an
 * ordinary discriminant, because this field is not an input the module acts on: it is the module's own
 * provenance claim, echoed into the result and printed in a note de calcul. A project file spelling
 * `"verified-against-standard-text"` as `"verified"` would have produced a result that reports a
 * standard-text verification - the one status this package's own docblock says nothing in it may set.
 */
export const COEFFICIENT_VERIFICATIONS: readonly CoefficientVerification[] = Object.freeze([
  "project-declared",
  "inherited-from-existing-engine",
  "verified-against-standard-text",
]);

/** True when a run-time value is one of the three allowed statuses. A union in a type is not a check. */
export function isCoefficientVerification(value: unknown): value is CoefficientVerification {
  return typeof value === "string" && (COEFFICIENT_VERIFICATIONS as readonly string[]).includes(value);
}

/** A document a value or method comes from. */
export interface SourceReference {
  /** Document title or number, as it should be cited in a note de calcul. */
  readonly document: string;
  /** Edition or year, when it is known. Omitted rather than guessed. */
  readonly edition?: string;
  /** Clause, table or section, when it is known. */
  readonly clause?: string;
  /** Anything a reviewer needs to judge the value independently. */
  readonly note?: string;
}

/**
 * A value together with the source that justifies it.
 *
 * @typeParam T - the value's type; scalar for coefficients, structured for catalogues.
 */
export interface Sourced<T> {
  readonly value: T;
  readonly source: SourceReference;
  readonly verification: CoefficientVerification;
}

/** Render a source the way a note de calcul cites it. */
export function formatSource(source: SourceReference): string {
  const parts = [source.document];
  if (source.edition !== undefined && source.edition.trim() !== "") parts.push(`(${source.edition})`);
  if (source.clause !== undefined && source.clause.trim() !== "") parts.push(source.clause);
  return parts.join(" ");
}

/** One line explaining what a reviewer may and may not conclude from a value's verification. */
export function describeVerification(verification: CoefficientVerification): string {
  switch (verification) {
    case "project-declared":
      return "declared by the project; review the project's own justification";
    case "inherited-from-existing-engine":
      return "inherited from this repository's existing engine; the standard text was not consulted";
    case "verified-against-standard-text":
      return "declared as confirmed against the standard text; reviewer evidence must be checked separately";
  }
}
