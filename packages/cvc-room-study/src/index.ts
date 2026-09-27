import { z } from "zod";

const text = z.string().trim().min(1).max(2000);
const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/);
const provenance = z.strictObject({
  kind: z.enum(["supplied", "sourced", "assumed"]),
  detail: text,
});

function quantity<U extends string>(unit: U, value: z.ZodNumber) {
  return z.strictObject({ value, unit: z.literal(unit), provenance });
}

const positive = z.number().finite().positive();
const nonnegative = z.number().finite().nonnegative();
const temperature = quantity("degC", z.number().finite().gt(-273.15));
const area = quantity("m2", positive);
const thermalTransmittance = quantity("W/(m2.K)", positive);
const opening = z.strictObject({ id, name: text, area, thermalTransmittance });
const surface = z.strictObject({
  id,
  name: text,
  kind: z.enum(["wall", "ceiling", "floor"]),
  boundaryId: id,
  grossArea: area,
  thermalTransmittance,
  openings: z.array(opening).max(100),
});
const bridge = z.strictObject({
  id,
  name: text,
  // The bridge inherits the named temperature condition of this surface.
  surfaceId: id,
  linearTransmittance: quantity("W/(m.K)", nonnegative),
  length: quantity("m", positive),
});

/** Compensated area sum, with only a floating-point rounding allowance.
 * This is not a measurement tolerance and must not hide oversized openings.
 */
export function netOpaqueAreaM2(grossArea: number, openingAreas: readonly number[]): number {
  if (!Number.isFinite(grossArea) || grossArea <= 0) throw new Error("Invalid gross area");
  let sum = 0;
  let compensation = 0;
  for (const area of openingAreas) {
    if (!Number.isFinite(area) || area <= 0) throw new Error("Invalid opening area");
    const corrected = area - compensation;
    const next = sum + corrected;
    compensation = (next - sum) - corrected;
    sum = next;
  }
  if (!Number.isFinite(sum)) throw new Error("Opening area overflow");
  const net = grossArea - sum;
  const roundingAllowance = 16 * Number.EPSILON * Math.max(grossArea, sum);
  if (net < -roundingAllowance) throw new Error("Openings exceed gross area");
  return Math.max(0, net);
}

/** Ready-to-calculate input. Drafts stay untrusted until this schema succeeds. */
export const roomStudyInputSchema = z.strictObject({
  schemaVersion: z.literal(1),
  projectId: id,
  revisionId: id,
  room: z.strictObject({ id, name: text }),
  method: z.literal("steady-state-room-loss-v1"),
  indoorTemperature: temperature,
  boundaries: z.array(z.strictObject({ id, kind: z.enum(["outdoor", "adjacent-room"]), temperature })).min(1).max(200),
  surfaces: z.array(surface).min(1).max(200),
  envelopeDescription: text,
  airExchange: z.strictObject({
    // One combined incoming outdoor-air flow, with no heat recovery or double counting.
    mode: z.literal("declared-outdoor-flow-no-recovery"),
    flow: quantity("m3/h", nonnegative),
    boundaryId: id,
    density: quantity("kg/m3", positive),
    specificHeat: quantity("J/(kg.K)", positive),
    scopeDescription: text,
  }),
  thermalBridges: z.discriminatedUnion("mode", [
    z.strictObject({ mode: z.literal("included"), items: z.array(bridge).min(1).max(500) }),
    z.strictObject({ mode: z.literal("excluded"), reason: text }),
  ]),
}).superRefine((input, ctx) => {
  const seen = new Set<string>();
  const unique = (value: string, path: (string | number)[]) => {
    if (seen.has(value)) ctx.addIssue({ code: "custom", path, message: "Identifiant dupliqué dans la pièce." });
    seen.add(value);
  };
  const boundaries = new Map(input.boundaries.map((item) => [item.id, item]));
  const boundaryIds = new Set<string>();
  input.boundaries.forEach((item, index) => {
    if (boundaryIds.has(item.id)) ctx.addIssue({ code: "custom", path: ["boundaries", index, "id"], message: "Identifiant de condition dupliqué." });
    boundaryIds.add(item.id);
    if (item.temperature.value > input.indoorTemperature.value) ctx.addIssue({ code: "custom", path: ["boundaries", index, "temperature"], message: "Une limite plus chaude que la pièce est hors du périmètre de cette méthode." });
  });
  input.surfaces.forEach((item, index) => {
    unique(item.id, ["surfaces", index, "id"]);
    if (!boundaries.has(item.boundaryId)) ctx.addIssue({ code: "custom", path: ["surfaces", index, "boundaryId"], message: "Condition de temperature introuvable." });
    item.openings.forEach((window, openingIndex) => unique(window.id, ["surfaces", index, "openings", openingIndex, "id"]));
    try {
      netOpaqueAreaM2(item.grossArea.value, item.openings.map((window) => window.area.value));
    } catch {
      ctx.addIssue({ code: "custom", path: ["surfaces", index, "openings"], message: "La surface des ouvertures dépasse la surface brute de la paroi." });
    }
  });
  if (boundaries.get(input.airExchange.boundaryId)?.kind !== "outdoor") ctx.addIssue({ code: "custom", path: ["airExchange", "boundaryId"], message: "Le debit doit referencer une condition exterieure declaree." });
  if (input.thermalBridges.mode === "included") {
    const surfaceIds = new Set(input.surfaces.map((item) => item.id));
    input.thermalBridges.items.forEach((item, index) => {
      unique(item.id, ["thermalBridges", "items", index, "id"]);
      if (!surfaceIds.has(item.surfaceId)) ctx.addIssue({ code: "custom", path: ["thermalBridges", "items", index, "surfaceId"], message: "La paroi de référence du pont thermique est introuvable." });
    });
  }
});

export type RoomStudyInput = z.infer<typeof roomStudyInputSchema>;

/** Structured issues let the assistant request data without inventing defaults. */
export type RoomStudyValidation =
  | { ready: true; input: RoomStudyInput; issues: [] }
  | { ready: false; issues: { path: string; code: string; message: string; question: string }[] };

export function validateRoomStudy(candidate: unknown): RoomStudyValidation {
  const parsed = roomStudyInputSchema.safeParse(candidate);
  if (parsed.success) return { ready: true, input: parsed.data, issues: [] };
  return {
    ready: false,
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      code: issue.code,
      message: issue.message,
      question: `Veuillez renseigner ou corriger « ${issue.path.map(String).join(".")} ».`,
    })),
  };
}

const contributionFields = {
  inputId: id,
  coefficientWK: nonnegative,
  deltaTK: nonnegative,
  heatLossW: nonnegative,
};
const contribution = z.discriminatedUnion("kind", [
  z.strictObject({ ...contributionFields, kind: z.literal("opaque"), netAreaM2: nonnegative }),
  z.strictObject({ ...contributionFields, kind: z.literal("opening"), areaM2: positive }),
  z.strictObject({ ...contributionFields, kind: z.literal("thermal-bridge"), lengthM: positive }),
  z.strictObject({ ...contributionFields, kind: z.literal("air-exchange"), flowM3s: nonnegative }),
]);

/** Transport contract only: schema validation does not authenticate a calculation.
 * The future run service must compute results, bind them to a snapshot/hash and
 * enforce immutability. Never accept model-authored values as engine output.
 */
export const roomStudyRunSchema = z.strictObject({
  schemaVersion: z.literal(1),
  runId: id,
  createdAt: z.iso.datetime(),
  inputSnapshot: roomStudyInputSchema,
  method: z.strictObject({
    id: z.literal("steady-state-room-loss-v1"),
    version: z.literal("1.0.0"),
    implementationVersion: text,
    referenceIds: z.array(text).min(1),
  }),
  contributions: z.array(contribution).min(1),
  totals: z.strictObject({ transmissionW: nonnegative, thermalBridgesW: nonnegative, airExchangeW: nonnegative, heatLossW: nonnegative }),
  // Includes a prefix around a source reason (which may itself be 2000 chars).
  warnings: z.array(z.string().trim().min(1).max(4096)),
  applicability: z.literal("preliminary-study-not-regulatory-sizing"),
}).superRefine((run, ctx) => {
  const expected = new Set<string>(["air-exchange:air-exchange"]);
  for (const surface of run.inputSnapshot.surfaces) {
    expected.add(`opaque:${surface.id}`);
    for (const opening of surface.openings) expected.add(`opening:${opening.id}`);
  }
  if (run.inputSnapshot.thermalBridges.mode === "included") {
    for (const bridge of run.inputSnapshot.thermalBridges.items) expected.add(`thermal-bridge:${bridge.id}`);
  }
  const seen = new Set<string>();
  run.contributions.forEach((item, index) => {
    const key = `${item.kind}:${item.inputId}`;
    if (!expected.has(key) || seen.has(key)) ctx.addIssue({ code: "custom", path: ["contributions", index, "inputId"], message: "Contribution inconnue ou dupliquée pour cet instantané." });
    seen.add(key);
  });
  if ([...expected].some((key) => !seen.has(key))) ctx.addIssue({ code: "custom", path: ["contributions"], message: "Des contributions de cet instantané sont manquantes." });
  if (run.inputSnapshot.thermalBridges.mode === "excluded" && run.warnings.length === 0) ctx.addIssue({ code: "custom", path: ["warnings"], message: "L'exclusion des ponts thermiques doit être signalée." });
});

export type RoomStudyRun = z.infer<typeof roomStudyRunSchema>;
