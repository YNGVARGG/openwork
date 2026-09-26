import {
  netOpaqueAreaM2,
  roomStudyInputSchema,
  roomStudyRunSchema,
  type RoomStudyInput,
  type RoomStudyRun,
} from "./index.ts";

type ProvenancedInput = {
  provenance: {
    kind: "supplied" | "sourced" | "assumed";
    detail: string;
  };
};

type RunIdentity = {
  runId: string;
  createdAt: string;
};

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Résultat non fini pour ${label}.`);
  }
  return value;
}

function temperatureDifference(indoorTemperature: number, boundaryTemperature: number, label: string): number {
  const deltaTK = finite(indoorTemperature - boundaryTemperature, `${label} (écart de température)`);
  if (deltaTK < 0) {
    throw new RangeError(`Condition plus chaude que la pièce pour ${label}.`);
  }
  return deltaTK;
}

function addAssumption(assumptions: string[], label: string, input: ProvenancedInput): void {
  if (input.provenance.kind === "assumed") {
    assumptions.push(`${label}: ${input.provenance.detail}`);
  }
}

function collectAssumptions(input: RoomStudyInput): string[] {
  const assumptions: string[] = [];
  addAssumption(assumptions, "Température intérieure", input.indoorTemperature);

  for (const boundary of input.boundaries) {
    addAssumption(assumptions, `Condition ${boundary.id}`, boundary.temperature);
  }

  for (const surface of input.surfaces) {
    addAssumption(assumptions, `Surface ${surface.id}, aire brute`, surface.grossArea);
    addAssumption(assumptions, `Surface ${surface.id}, U`, surface.thermalTransmittance);
    for (const opening of surface.openings) {
      addAssumption(assumptions, `Ouverture ${opening.id}, aire`, opening.area);
      addAssumption(assumptions, `Ouverture ${opening.id}, U`, opening.thermalTransmittance);
    }
  }

  addAssumption(assumptions, "Débit d'air", input.airExchange.flow);
  addAssumption(assumptions, "Masse volumique de l'air", input.airExchange.density);
  addAssumption(assumptions, "Chaleur spécifique de l'air", input.airExchange.specificHeat);

  if (input.thermalBridges.mode === "included") {
    for (const bridge of input.thermalBridges.items) {
      addAssumption(assumptions, `Pont thermique ${bridge.id}, psi`, bridge.linearTransmittance);
      addAssumption(assumptions, `Pont thermique ${bridge.id}, longueur`, bridge.length);
    }
  }

  return assumptions;
}

/**
 * Calculates the narrowly scoped, steady-state sensible heat-loss method.
 * It deliberately has no I/O, clock, random, or model-dependent behaviour.
 */
export function calculateRoomStudy(candidate: unknown, identity: RunIdentity): RoomStudyRun {
  const input = roomStudyInputSchema.parse(candidate);
  const inputSnapshot = structuredClone(input);
  const boundaries = new Map(input.boundaries.map((boundary) => [boundary.id, boundary]));
  const surfaces = new Map(input.surfaces.map((surface) => [surface.id, surface]));
  const contributions: RoomStudyRun["contributions"] = [];
  let transmissionW = 0;
  let thermalBridgesW = 0;
  let airExchangeW = 0;

  const boundaryTemperature = (boundaryId: string, label: string): number => {
    const boundary = boundaries.get(boundaryId);
    if (!boundary) {
      throw new RangeError(`Condition introuvable pour ${label}.`);
    }
    return boundary.temperature.value;
  };

  for (const surface of input.surfaces) {
    const netAreaM2 = netOpaqueAreaM2(
      surface.grossArea.value,
      surface.openings.map((opening) => opening.area.value),
    );
    const deltaTK = temperatureDifference(
      input.indoorTemperature.value,
      boundaryTemperature(surface.boundaryId, surface.id),
      surface.id,
    );
    const coefficientWK = finite(surface.thermalTransmittance.value * netAreaM2, `coefficient de ${surface.id}`);
    const heatLossW = finite(coefficientWK * deltaTK, `déperdition de ${surface.id}`);
    contributions.push({
      inputId: surface.id,
      kind: "opaque",
      coefficientWK,
      deltaTK,
      heatLossW,
      netAreaM2,
    });
    transmissionW = finite(transmissionW + heatLossW, "total de transmission");

    for (const opening of surface.openings) {
      const openingCoefficientWK = finite(
        opening.thermalTransmittance.value * opening.area.value,
        `coefficient de ${opening.id}`,
      );
      const openingHeatLossW = finite(openingCoefficientWK * deltaTK, `déperdition de ${opening.id}`);
      contributions.push({
        inputId: opening.id,
        kind: "opening",
        coefficientWK: openingCoefficientWK,
        deltaTK,
        heatLossW: openingHeatLossW,
        areaM2: opening.area.value,
      });
      transmissionW = finite(transmissionW + openingHeatLossW, "total de transmission");
    }
  }

  if (input.thermalBridges.mode === "included") {
    for (const bridge of input.thermalBridges.items) {
      const surface = surfaces.get(bridge.surfaceId);
      if (!surface) {
        throw new RangeError(`Paroi introuvable pour le pont thermique ${bridge.id}.`);
      }
      const deltaTK = temperatureDifference(
        input.indoorTemperature.value,
        boundaryTemperature(surface.boundaryId, bridge.id),
        bridge.id,
      );
      const coefficientWK = finite(
        bridge.linearTransmittance.value * bridge.length.value,
        `coefficient de ${bridge.id}`,
      );
      const heatLossW = finite(coefficientWK * deltaTK, `déperdition de ${bridge.id}`);
      contributions.push({
        inputId: bridge.id,
        kind: "thermal-bridge",
        coefficientWK,
        deltaTK,
        heatLossW,
        lengthM: bridge.length.value,
      });
      thermalBridgesW = finite(thermalBridgesW + heatLossW, "total des ponts thermiques");
    }
  }

  const airBoundaryTemperature = boundaryTemperature(input.airExchange.boundaryId, "air entrant");
  const airDeltaTK = temperatureDifference(input.indoorTemperature.value, airBoundaryTemperature, "air entrant");
  const flowM3s = finite(input.airExchange.flow.value / 3600, "débit d'air en m3/s");
  const airCoefficientWK = finite(
    input.airExchange.density.value * input.airExchange.specificHeat.value * flowM3s,
    "coefficient d'air",
  );
  airExchangeW = finite(airCoefficientWK * airDeltaTK, "déperdition d'air");
  contributions.push({
    inputId: "air-exchange",
    kind: "air-exchange",
    coefficientWK: airCoefficientWK,
    deltaTK: airDeltaTK,
    heatLossW: airExchangeW,
    flowM3s,
  });

  const heatLossW = finite(transmissionW + thermalBridgesW + airExchangeW, "déperdition totale");
  const warnings = [
    "Étude préliminaire stationnaire, non réglementaire et non destinée au dimensionnement.",
  ];

  if (input.thermalBridges.mode === "excluded") {
    warnings.push(`Ponts thermiques exclus: ${input.thermalBridges.reason}`);
  }

  const assumptions = collectAssumptions(input);
  if (assumptions.length > 0) {
    warnings.push(
      `${assumptions.length} entrée(s) technique(s) sont déclarées comme hypothèses; voir leur provenance dans l'instantané d'entrée.`,
    );
  }

  return roomStudyRunSchema.parse({
    schemaVersion: 1,
    runId: identity.runId,
    createdAt: identity.createdAt,
    inputSnapshot,
    method: {
      id: "steady-state-room-loss-v1",
      version: "1.0.0",
      implementationVersion: "calculator-v1",
      referenceIds: ["docs/cvc/room-heat-loss-reference.md"],
    },
    contributions,
    totals: {
      transmissionW,
      thermalBridgesW,
      airExchangeW,
      heatLossW,
    },
    warnings,
    applicability: "preliminary-study-not-regulatory-sizing",
  });
}
