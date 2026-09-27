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

const displayUnits: Record<string, string> = { degC: '°C', m2: 'm²', 'm3/h': 'm³/h', 'kg/m3': 'kg/m³', 'W/(m2.K)': 'W/(m².K)' };
function formatQuantity(quantity: Quantity): string {
  return `${escapeHtml(formatNumber(quantity.value))} ${escapeHtml(displayUnits[quantity.unit] ?? quantity.unit)}`;
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
      ? `${escapeHtml(boundary.id)} (${escapeHtml(boundary.kind === 'outdoor' ? 'Extérieur' : 'Local adjacent')})<br>${formatQuantity(boundary.temperature)}`
      : escapeHtml(surface.boundaryId);
    rows.push([
      `${escapeHtml(surface.name)}<br><small>${escapeHtml(surface.id)} · ${escapeHtml({ wall: 'Mur', ceiling: 'Plafond', floor: 'Plancher' }[surface.kind])}</small>`,
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
      escapeHtml({ opaque: 'Paroi opaque', opening: 'Ouverture', 'thermal-bridge': 'Pont thermique', 'air-exchange': 'Air extérieur' }[contribution.kind]),
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
    :root { color-scheme: light; font-family: Arial, sans-serif; color: #232824; background: #fff; }
    * { box-sizing: border-box; }
    body { margin: 0 auto; max-width: 900px; padding: 36px; line-height: 1.5; font-size: 12px; }
    .masthead { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #253e35; padding-bottom: 14px; margin-bottom: 30px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
    .status { letter-spacing: 0; color: #685832; }
    h1 { font-size: 29px; font-weight: 500; letter-spacing: -.04em; margin: 0 0 8px; line-height: 1.15; }
    .room { font-size: 16px; margin: 0 0 20px; color: #556158; }
    h2 { font-size: 15px; color: #253e35; margin: 28px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #dce2dc; break-after: avoid; }
    p { margin: 8px 0; }
    .hero { background: #f1f5f0; padding: 20px 24px; margin: 20px 0; border-left: 3px solid #446c55; break-inside: avoid; }
    .hero-label { display: block; text-transform: uppercase; font-size: 10px; letter-spacing: .08em; color: #52644f; }
    .hero-value { font-size: 42px; font-weight: 500; letter-spacing: -.04em; }
    .hero-unit { font-size: 18px; color: #52644f; }
    .summary { display: flex; gap: 28px; margin-top: 12px; font-size: 11px; }
    .summary strong { display:block; font-size: 15px; font-weight: 500; }
    table { border-collapse: collapse; width: 100%; margin: 10px 0 18px; font-size: 10px; table-layout: fixed; }
    tr { break-inside: avoid; } thead { display: table-header-group; }
    th, td { border-bottom: 1px solid #dce2dc; padding: 8px 6px; text-align: left; vertical-align: top; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
    th { background: #f3f5f2; color: #52644f; font-size: 9px; font-weight: 600; }
    small { color: #6b736c; font-size: 9px; }
    .meta { display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 6px 16px; overflow-wrap: anywhere; font-size: 10px; }
    .meta strong { font-weight: 500; color: #626c63; }
    .total { font-weight: 700; }
    .scope { color: #626c63; font-size: 11px; max-width: 680px; }
    .annex { break-before: auto; }
    @page { size: A4; margin: 14mm 13mm 18mm; }
    @media print { body { max-width: none; padding: 0; font-size: 10px; } h2 { break-after: avoid; } }
  </style>
</head>
<body>
  <div class="masthead"><strong>CVC Studio</strong><span class="status">Étude préliminaire · à vérifier</span></div>
  <h1>Déperditions hivernales</h1>
  <p class="room">${escapeHtml(input.room.name)}</p>
  <p class="scope">Note de calcul — étude stationnaire d’une pièce. Ce document ne constitue ni une étude réglementaire ni un dimensionnement d’équipement.</p>
  <div class="hero"><span class="hero-label">Déperditions totales</span><span class="hero-value">${escapeHtml(formatNumber(run.totals.heatLossW))}</span> <span class="hero-unit">W</span>
  <div class="summary"><span>Parois et ouvertures<strong>${escapeHtml(formatNumber(run.totals.transmissionW))} W</strong></span><span>Ponts thermiques<strong>${escapeHtml(formatNumber(run.totals.thermalBridgesW))} W</strong></span><span>Renouvellement d’air<strong>${escapeHtml(formatNumber(run.totals.airExchangeW))} W</strong></span></div></div>

  <h2>Hypothèses, périmètre et avertissements</h2>
  <p>${escapeHtml(input.envelopeDescription)}</p>
  ${renderWarnings(run)}

  <h2>Conditions et entrée d'air</h2>
  <p><strong>Température intérieure :</strong> ${formatQuantity(input.indoorTemperature)}</p>
  ${table(
    ["ID", "Type", "Température"],
    input.boundaries.map((boundary) => [escapeHtml(boundary.id), escapeHtml(boundary.kind === 'outdoor' ? 'Extérieur' : 'Local adjacent'), formatQuantity(boundary.temperature)]),
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
  <h2 class="annex">Provenance de toutes les données</h2>
  ${renderProvenance(run)}
  <h2>Identification et traçabilité</h2>
  <div class="meta">
    <strong>Projet</strong><span>${escapeHtml(input.projectId)}</span>
    <strong>Pièce</strong><span>${escapeHtml(input.room.name)} (${escapeHtml(input.room.id)})</span>
    <strong>Révision d'entrée</strong><span>${escapeHtml(input.revisionId)}</span>
    <strong>Exécution</strong><span>${escapeHtml(run.runId)}</span>
    <strong>Créée le</strong><span>${escapeHtml(run.createdAt)}</span>
    <strong>Méthode</strong><span>${escapeHtml(run.method.id)} — v${escapeHtml(run.method.version)}</span>
    <strong>Modèle de note</strong><span>cvc-note-v2</span>
    <strong>Implémentation</strong><span>${escapeHtml(run.method.implementationVersion)}</span>
    <strong>Références de méthode</strong><span>${run.method.referenceIds.map(escapeHtml).join(", ")}</span>
    <strong>Applicabilité</strong><span>${escapeHtml(run.applicability)}</span>
  </div>


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
