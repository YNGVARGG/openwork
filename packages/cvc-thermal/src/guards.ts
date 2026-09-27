/**
 * The result guard, shared by every module that produces numbers.
 *
 * WHY THIS FILE EXISTS
 *
 * The independent review of PR #1 found module 01 returning U = 0 for finite inputs whose resistance
 * overflowed. Reviewing modules 01 to 06 as one batch found the same class of defect in four more of
 * them: module 02 returned uWm2K = Infinity and, in another shape, NaN; module 03 returned an
 * infinite total; module 05 returned infinite coefficients and an infinite heat loss; module 06
 * returned an infinite room total. **None of the per-module input checks can see any of it**, because
 * every input is finite and every input passes its own validation - it is the ARITHMETIC that leaves
 * the range of the double type.
 *
 * A NaN is worse than a wrong number, because a wrong number can be argued with. NaN propagates
 * silently through every later comparison, so an "if (loss > limit)" test on it is false and the
 * report simply omits the finding. That is how a non-physical result reaches a note de calcul.
 *
 * WHAT IT DOES NOT DO
 *
 * It does not check the MAGNITUDE of a result, and it must not: a plausible-looking wrong U-value is a
 * question of method, not of arithmetic, and no guard can catch it. All this does is refuse a number
 * that cannot exist. The modules keep their own error classes and codes; this only answers the
 * question "is any of these not a finite number, and which one".
 */

/** The first entry that is not a finite number, as "name = value", or null when all are finite. */
export function firstNonFinite(values: Readonly<Record<string, number | null>>): string | null {
  for (const [name, value] of Object.entries(values)) {
    if (value !== null && !Number.isFinite(value)) return `${name} = ${value}`;
  }
  return null;
}

/**
 * The same question asked of a whole RESULT, walking nested objects and arrays.
 *
 * Written after guarding six modules one field list at a time showed the cost of the alternative: a
 * hand-written list has to be kept in step with the result type, and a field added later is silently
 * unguarded. This walks whatever the module actually returns, so the guard cannot fall behind the
 * result - and it names the path it found, so the message stays useful.
 *
 * Nulls are skipped, because several modules return a null for "not applicable" by design. A
 * DELIBERATELY infinite value is not skipped: a module that means to return Infinity for a declared
 * reason should say so at its own call site rather than have this walker guess.
 */
export function firstNonFiniteIn(value: unknown, path = "result", _depth = 0): string | null {
  // Results can be deeper than an arbitrary recursion cutoff, and recursive traversal also risks a
  // call-stack failure on a deeply nested result. Visit each object once so cyclic result graphs do
  // not loop forever; a repeated object was already examined at its first reachable path.
  const seen = new WeakSet<object>();
  const pending: Array<{ readonly value: unknown; readonly path: string }> = [{ value, path }];

  while (pending.length > 0) {
    const current = pending.pop()!;
    if (typeof current.value === "number") {
      if (!Number.isFinite(current.value)) return `${current.path} = ${current.value}`;
      continue;
    }
    if (current.value === null || typeof current.value !== "object") continue;
    if (seen.has(current.value)) continue;
    seen.add(current.value);

    if (Array.isArray(current.value)) {
      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        pending.push({ value: current.value[index], path: `${current.path}[${index}]` });
      }
      continue;
    }

    const entries = Object.entries(current.value as Record<string, unknown>);
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const [key, child] = entries[index]!;
      pending.push({ value: child, path: `${current.path}.${key}` });
    }
  }

  return null;
}
