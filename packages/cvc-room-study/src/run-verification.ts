import { isDeepStrictEqual } from "node:util";
import { calculateRoomStudy } from "./calculator.ts";
import { roomStudyRunSchema, type RoomStudyRun } from "./index.ts";

/** Recompute before displaying/exporting stored numbers. A schema alone is not
 * evidence that the values came from this calculator. Unsupported historical
 * implementation versions require an explicit migration/verification path.
 */
export function verifySavedRun(candidate: unknown): RoomStudyRun {
  const run = roomStudyRunSchema.parse(candidate);
  const expected = calculateRoomStudy(run.inputSnapshot, { runId: run.runId, createdAt: run.createdAt });
  if (!isDeepStrictEqual(run, expected)) {
    throw new Error("Le calcul enregistré ne correspond pas à son instantané ou à la version de calcul prise en charge.");
  }
  return run;
}
