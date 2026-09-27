import { expect, test } from "bun:test";
import { opaqueU, windowU } from "./cvc-thermal-tools.js";
const source = { document: "Synthetic arithmetic reference" };
const q = (value: number) => ({ value, source, verification: "project-declared" });
test("desktop wall tool uses audited arithmetic and refuses unsourced layers", () => {
  const input = { elementId: "wall", elementKind: "opaque", direction: "horizontal", rsi: q(0.13), rse: q(0.04), layers: [{ kind: "conductive", name: "test", thicknessM: 0.1, lambdaWmK: 0.04, source }] };
  expect(opaqueU(input).result.uWm2K).toBeCloseTo(1 / 2.67, 12);
  expect(() => opaqueU({ ...input, layers: [{ ...input.layers[0], source: undefined }] })).toThrow();
});
test("desktop window tool distinguishes whole window U from glass U", () => {
  const result = windowU({ elementId: "window", glazing: { areaM2: 1.8, uWm2K: q(1.1) }, frame: { areaM2: 0.6, uWm2K: q(1.6) }, spacer: { perimeterM: 6, psiWmK: q(0.04) } });
  expect(result.result.uWm2K).toBeCloseTo(1.325, 12);
});
