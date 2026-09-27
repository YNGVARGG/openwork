import { z } from "zod";
import { computeOpaqueWall, computeWindow } from "@cvc/thermal";
const source = z.strictObject({ document: z.string().trim().min(1), edition: z.string().optional(), clause: z.string().optional() });
const sourced = z.strictObject({ value: z.number().finite().nonnegative(), source, verification: z.literal("project-declared") });
export const opaqueUArgs = z.strictObject({
  elementId: z.string().min(1), elementKind: z.literal("opaque"), direction: z.enum(["upward", "horizontal", "downward"]),
  rsi: sourced, rse: sourced,
  layers: z.array(z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("conductive"), name: z.string().min(1), thicknessM: z.number().positive(), lambdaWmK: z.number().positive(), source }),
    z.strictObject({ kind: z.literal("resistive"), name: z.string().min(1), resistanceM2KW: z.number().nonnegative(), source }),
  ])).min(1).max(50),
});
export const windowUArgs = z.strictObject({
  elementId: z.string().min(1),
  glazing: z.strictObject({ areaM2: z.number().positive(), uWm2K: sourced }),
  frame: z.strictObject({ areaM2: z.number().nonnegative(), uWm2K: sourced }),
  spacer: z.strictObject({ perimeterM: z.number().nonnegative(), psiWmK: sourced.extend({ value: z.number().finite() }) }),
});
export function opaqueU(raw: unknown) {
  const input = opaqueUArgs.parse(raw);
  return { method: "opaque-u-v1", status: "preliminary", inputSnapshot: input, result: computeOpaqueWall(input),
    nextAction: "Proposer ce U à l’utilisateur puis enregistrer une nouvelle révision avec ses sources. Ne pas modifier un calcul existant." };
}
export function windowU(raw: unknown) {
  const input = windowUArgs.parse(raw);
  return { method: "window-u-v1", status: "preliminary", inputSnapshot: input, result: computeWindow(input),
    nextAction: "Utiliser Uw pour la baie entière, pas Ug. Conserver les dimensions et sources dans la nouvelle révision." };
}
