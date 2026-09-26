import { type RoomStudyRun } from "./index.ts";
import { verifySavedRun } from "./run-verification.ts";

type Quantity = {
  value: number;
  unit: string;
  provenance: {
    kind: "supplied" | "sourced" | "assumed";
    detail: string;
  };
};

type ContributionChange = {
  kind: "opaque" | "opening" | "thermal-bridge" | "air-exchange";
  inputId: string;
  change: "added" | "removed" | "changed";
  beforeHeatLossW: number | null;
  afterHeatLossW: number | null;
  deltaHeatLossW: number;
};

export type RoomStudyRunComparison = {
  before: {
    runId: string;
    revisionId: string;
  };
  after: {
    runId: string;
    revisionId: string;
  };
  totals: {
    before: RoomStudyRun["totals"];
    after: RoomStudyRun["totals"];
    delta: RoomStudyRun["totals"];
  };
  contributions: ContributionChange[];
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatNumber(value: number): string {
  if (value !== 0 && Math.abs(value) < 0.001) return value.toExponential(3);
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(value);
}

function formatQuantity(quantity: Quantity): string {
  return `${escapeHtml(formatNumber(quantity.value))} ${escapeHtml(quantity.unit)}`;
}

function renderProvenance(run: RoomStudyRun): string {
  const input = run.inputSnapshot;
  const entries: [string, Quantity][] = [["Température intérieure", input.indoorTemperature]];
  for (const boundary of input.boundaries) entries.push([`Condition ${boundary.id}`, boundary.temperature]);
  for (const surface of input.surfaces) {
    entries.push([`${surface.name} — aire brute`, surface.grossArea], [`${surface.name} — U`, surface.thermalTransmittance]);
    for (const opening of surface.openings) entries.push([`${opening.name} — aire`, opening.area], [`${opening.name} — U`, opening.thermalTransmittance]);
  }
  entries.push(["Débit d'air", input.airExchange.flow], ["Masse volumique", input.airExchange.density], ["Chaleur spécifique", input.airExchange.specificHeat]);
  if (input.thermalBridges.mode === "included") for (const bridge of input.thermalBridges.items) entries.push([`${bridge.name} — ψ`, bridge.linearTransmittance], [`${bridge.name} — longueur`, bridge.length]);
  const labels = { assumed: "Hypothèse", supplied: "Donnée fournie", sourced: "Donnée sourcée" };
  return table(["Donnée", "Valeur", "Origine"], entries.map(([label, quantity]) => [escapeHtml(label), formatQuantity(quantity), `${labels[quantity.provenance.kind]} — ${escapeHtml(quantity.provenance.detail)}`]));
}

function table(headers: string[], rows: string[][]): string {
  return `<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function contributionMeasure(contribution: RoomStudyRun["contributions"][number]): string {
  if (contribution.kind === "opaque") return `${escapeHtml(formatNumber(contribution.netAreaM2))} m2 net`;
  if (contribution.kind === "opening") return `${escapeHtml(formatNumber(contribution.areaM2))} m2`;
  if (contribution.kind === "thermal-bridge") return `${escapeHtml(formatNumber(contribution.lengthM))} m`;
  return `${escapeHtml(formatNumber(contribution.flowM3s))} m3/s`;
}

function renderSurfaces(run: RoomStudyRun): string {
  const boundaryNames = new Map(run.inputSnapshot.boundaries.map((boundary) => [boundary.id, boundary]));
  const rows: string[][] = [];
  for (const surface of run.inputSnapshot.surfaces) {
    const boundary = boundaryNames.get(surface.boundaryId);
    const boundaryCell = boundary
      ? `${escapeHtml(boundary.id)} (${escapeHtml(boundary.kind)})<br>${formatQuantity(boundary.temperature)}`
      : escapeHtml(surface.boundaryId);
    rows.push([
      `${escapeHtml(surface.name)}<br><small>${escapeHtml(surface.id)} · ${escapeHtml(surface.kind)}</small>`,
      boundaryCell,
      formatQuantity(surface.grossArea),
      formatQuantity(surface.thermalTransmittance),
      surface.openings.length === 0 ? "Aucune" : surface.openings.map((opening) => `${escapeHtml(opening.id)} — ${escapeHtml(opening.name)}<br>${formatQuantity(opening.area)}<br>${formatQuantity(opening.thermalTransmittance)}`).join("<hr>"),
    ]);
  }
  return table(["Paroi", "Condition", "Aire brute", "U", "Ouvertures"], rows);
}

function renderBridges(run: RoomStudyRun): string {
  if (run.inputSnapshot.thermalBridges.mode === "excluded") {
    return `<p>Exclus : ${escapeHtml(run.inputSnapshot.thermalBridges.reason)}</p>`;
  }
  return table(
    ["ID", "Pont thermique", "Paroi de référence", "ψ", "Longueur"],
    run.inputSnapshot.thermalBridges.items.map((bridge) => [
      escapeHtml(bridge.id),
      escapeHtml(bridge.name),
      escapeHtml(bridge.surfaceId),
      formatQuantity(bridge.linearTransmittance),
      formatQuantity(bridge.length),
    ]),
  );
}

function renderContributions(run: RoomStudyRun): string {
  return table(
    ["Type", "Entrée", "Coefficient", "ΔT", "Mesure", "Déperdition"],
    run.contributions.map((contribution) => [
      escapeHtml(contribution.kind),
      escapeHtml(contribution.inputId),
      `${escapeHtml(formatNumber(contribution.coefficientWK))} W/K`,
      `${escapeHtml(formatNumber(contribution.deltaTK))} K`,
      contributionMeasure(contribution),
      `${escapeHtml(formatNumber(contribution.heatLossW))} W`,
    ]),
  );
}

function renderWarnings(run: RoomStudyRun): string {
  if (run.warnings.length === 0) return "<p>Aucun avertissement déclaré.</p>";
  return `<ul>${run.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`;
}

/** Renders a verified, self-contained French calculation note with no scripts or external assets. */
export function renderRoomStudyHtml(candidate: unknown): string {
  const run = verifySavedRun(candidate);
  const input = run.inputSnapshot;
  const airExchange = input.airExchange;
  const airBoundary = input.boundaries.find((boundary) => boundary.id === airExchange.boundaryId);
  const airBoundaryCell = airBoundary
    ? `${escapeHtml(airBoundary.id)} (${escapeHtml(airBoundary.kind)})<br>${formatQuantity(airBoundary.temperature)}`
    : escapeHtml(airExchange.boundaryId);

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Note de calcul — ${escapeHtml(input.room.name)}</title>
  <style>
    :root { color-scheme: light; font-family: Arial, sans-serif; color: #172033; background: #fff; }
    body { margin: 0 auto; max-width: 1000px; padding: 32px; line-height: 1.45; }
    h1, h2 { color: #0b3d6d; margin: 1.4em 0 0.45em; }
    h1 { margin-top: 0; }
    table { border-collapse: collapse; width: 100%; margin: 0.7em 0 1.2em; font-size: 14px; }
    tr { break-inside: avoid; } thead { display: table-header-group; }
    th, td { border: 1px solid #aeb7c2; padding: 7px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    th { background: #eaf1f8; }
    small { color: #425466; }
    .meta { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 6px 16px; overflow-wrap: anywhere; }
    .total { font-size: 1.2em; font-weight: 700; }
    @media print { body { max-width: none; padding: 12mm; } h2 { break-after: avoid; } }
  </style>
</head>
<body>
  <h1>Note de calcul — déperditions hivernales</h1>
  <p>Étude préliminaire stationnaire pour une pièce. Elle n'est pas une étude réglementaire ni un dimensionnement d'équipement.</p>
  <p class="total">Déperditions totales : ${escapeHtml(formatNumber(run.totals.heatLossW))} W</p>

  <h2>Identification et traçabilité</h2>
  <div class="meta">
    <strong>Projet</strong><span>${escapeHtml(input.projectId)}</span>
    <strong>Pièce</strong><span>${escapeHtml(input.room.name)} (${escapeHtml(input.room.id)})</span>
    <strong>Révision d'entrée</strong><span>${escapeHtml(input.revisionId)}</span>
    <strong>Exécution</strong><span>${escapeHtml(run.runId)}</span>
    <strong>Créée le</strong><span>${escapeHtml(run.createdAt)}</span>
    <strong>Méthode</strong><span>${escapeHtml(run.method.id)} — v${escapeHtml(run.method.version)}</span>
    <strong>Implémentation</strong><span>${escapeHtml(run.method.implementationVersion)}</span>
    <strong>Références de méthode</strong><span>${run.method.referenceIds.map(escapeHtml).join(", ")}</span>
    <strong>Applicabilité</strong><span>${escapeHtml(run.applicability)}</span>
  </div>

  <h2>Hypothèses, périmètre et avertissements</h2>
  <p>${escapeHtml(input.envelopeDescription)}</p>
  ${renderWarnings(run)}

  <h2>Conditions et entrée d'air</h2>
  <p><strong>Température intérieure :</strong> ${formatQuantity(input.indoorTemperature)}</p>
  ${table(
    ["ID", "Type", "Température"],
    input.boundaries.map((boundary) => [escapeHtml(boundary.id), escapeHtml(boundary.kind), formatQuantity(boundary.temperature)]),
  )}
  ${table(
    ["Air extérieur", "Valeur déclarée"],
    [
      ["Mode", "Débit extérieur déclaré sans récupération"],
      ["Débit", formatQuantity(airExchange.flow)],
      ["Condition", airBoundaryCell],
      ["Masse volumique", formatQuantity(airExchange.density)],
      ["Chaleur spécifique", formatQuantity(airExchange.specificHeat)],
      ["Périmètre", escapeHtml(airExchange.scopeDescription)],
    ],
  )}

  <h2>Parois et ouvertures</h2>
  <p>La contribution opaque utilise l'aire brute moins les ouvertures imbriquées. Chaque ouverture figure une seule fois avec son propre U.</p>
  ${renderSurfaces(run)}

  <h2>Ponts thermiques</h2>
  ${renderBridges(run)}

  <h2>Contributions calculées</h2>
  <p>Parois : Q = U × A nette × ΔT. Ponts thermiques : Q = ψ × L × ΔT. Air : Q = ρ × cp × débit / 3600 × ΔT. Les puissances sont en W ; les écarts de température sont en K.</p>
  <p>Affichage arrondi à trois décimales au maximum ; les enregistrements conservent la précision de calcul. Les apports solaires et internes, l'inertie, la relance et les effets dynamiques ne sont pas modélisés.</p>
  ${renderContributions(run)}
  ${table(
    ["Transmission", "Ponts thermiques", "Air", "Total"],
    [[
      `${escapeHtml(formatNumber(run.totals.transmissionW))} W`,
      `${escapeHtml(formatNumber(run.totals.thermalBridgesW))} W`,
      `${escapeHtml(formatNumber(run.totals.airExchangeW))} W`,
      `<span class="total">${escapeHtml(formatNumber(run.totals.heatLossW))} W</span>`,
    ]],
  )}
  <h2>Provenance de toutes les données</h2>
  ${renderProvenance(run)}
</body>
</html>`;
}

function contributionKey(contribution: RoomStudyRun["contributions"][number]): string {
  return `${contribution.kind}:${contribution.inputId}`;
}

function compareTotals(before: RoomStudyRun["totals"], after: RoomStudyRun["totals"]): RoomStudyRun["totals"] {
  return {
    transmissionW: after.transmissionW - before.transmissionW,
    thermalBridgesW: after.thermalBridgesW - before.thermalBridgesW,
    airExchangeW: after.airExchangeW - before.airExchangeW,
    heatLossW: after.heatLossW - before.heatLossW,
  };
}

/** Compares two independently verified runs of the same project, room, and method version. */
export function compareRoomStudyRuns(beforeCandidate: unknown, afterCandidate: unknown): RoomStudyRunComparison {
  const before = verifySavedRun(beforeCandidate);
  const after = verifySavedRun(afterCandidate);

  if (before.inputSnapshot.projectId !== after.inputSnapshot.projectId) {
    throw new RangeError("Les exécutions appartiennent à des projets différents.");
  }
  if (before.inputSnapshot.room.id !== after.inputSnapshot.room.id) {
    throw new RangeError("Les exécutions concernent des pièces différentes.");
  }
  if (before.method.id !== after.method.id || before.method.version !== after.method.version) {
    throw new RangeError("Les exécutions n'utilisent pas la même version de méthode.");
  }

  const beforeByKey = new Map(before.contributions.map((contribution) => [contributionKey(contribution), contribution]));
  const afterByKey = new Map(after.contributions.map((contribution) => [contributionKey(contribution), contribution]));
  const keys = new Set([...beforeByKey.keys(), ...afterByKey.keys()]);
  const contributions: ContributionChange[] = [];

  for (const key of [...keys].sort()) {
    const beforeContribution = beforeByKey.get(key);
    const afterContribution = afterByKey.get(key);
    if (!beforeContribution && afterContribution) {
      contributions.push({
        kind: afterContribution.kind,
        inputId: afterContribution.inputId,
        change: "added",
        beforeHeatLossW: null,
        afterHeatLossW: afterContribution.heatLossW,
        deltaHeatLossW: afterContribution.heatLossW,
      });
      continue;
    }
    if (beforeContribution && !afterContribution) {
      contributions.push({
        kind: beforeContribution.kind,
        inputId: beforeContribution.inputId,
        change: "removed",
        beforeHeatLossW: beforeContribution.heatLossW,
        afterHeatLossW: null,
        deltaHeatLossW: -beforeContribution.heatLossW,
      });
      continue;
    }
    if (beforeContribution && afterContribution && beforeContribution.heatLossW !== afterContribution.heatLossW) {
      contributions.push({
        kind: afterContribution.kind,
        inputId: afterContribution.inputId,
        change: "changed",
        beforeHeatLossW: beforeContribution.heatLossW,
        afterHeatLossW: afterContribution.heatLossW,
        deltaHeatLossW: afterContribution.heatLossW - beforeContribution.heatLossW,
      });
    }
  }

  return {
    before: { runId: before.runId, revisionId: before.inputSnapshot.revisionId },
    after: { runId: after.runId, revisionId: after.inputSnapshot.revisionId },
    totals: {
      before: { ...before.totals },
      after: { ...after.totals },
      delta: compareTotals(before.totals, after.totals),
    },
    contributions,
  };
}
