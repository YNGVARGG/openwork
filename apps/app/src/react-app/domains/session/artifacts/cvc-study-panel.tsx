/** @jsxImportSource react */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { RoomStudyInput, RoomStudyRun } from "@cvc/room-study";
import type { OpenworkServerClient } from "@/app/lib/openwork-server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { X, RefreshCw } from "lucide-react";

const number = (value: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(value);
const origin = { supplied: "Fournie", sourced: "Sourcée", assumed: "Hypothèse à vérifier" };
const boundaryName = (input: RoomStudyInput, id: string) => {
  const boundary = input.boundaries.find((item) => item.id === id);
  return boundary?.kind === "outdoor" ? "Extérieur" : `Local adjacent (${number(boundary?.temperature.value ?? 0)} °C)`;
};
function sourceRows(input: RoomStudyInput) {
  const rows: [string, RoomStudyInput["indoorTemperature"] | RoomStudyInput["airExchange"]["flow"] | RoomStudyInput["surfaces"][number]["grossArea"] | RoomStudyInput["surfaces"][number]["thermalTransmittance"] | RoomStudyInput["airExchange"]["density"] | RoomStudyInput["airExchange"]["specificHeat"]][] = [
    ["Température intérieure", input.indoorTemperature],
    ...input.boundaries.map((item): [string, RoomStudyInput["indoorTemperature"]] => [boundaryName(input, item.id), item.temperature]),
  ];
  for (const surface of input.surfaces) {
    rows.push([`${surface.name} · aire brute`, surface.grossArea], [`${surface.name} · U`, surface.thermalTransmittance]);
    for (const opening of surface.openings) rows.push([`${opening.name} · aire`, opening.area], [`${opening.name} · U`, opening.thermalTransmittance]);
  }
  rows.push(["Débit extérieur total", input.airExchange.flow], ["Masse volumique de l’air", input.airExchange.density], ["Chaleur spécifique de l’air", input.airExchange.specificHeat]);
  return rows;
}
function contributionName(input: RoomStudyInput, item: RoomStudyRun["contributions"][number]) {
  if (item.kind === "air-exchange") return "Renouvellement d’air";
  if (item.kind === "thermal-bridge") return input.thermalBridges.mode === "included" ? input.thermalBridges.items.find((bridge) => bridge.id === item.inputId)?.name ?? "Pont thermique" : "Pont thermique";
  if (item.kind === "opening") return input.surfaces.flatMap((surface) => surface.openings).find((opening) => opening.id === item.inputId)?.name ?? "Ouverture";
  return input.surfaces.find((surface) => surface.id === item.inputId)?.name ?? "Paroi";
}
export function CvcStudyPanel({ client, workspaceId, projectId, runId, revisionId, onClose }: {
  client: Pick<OpenworkServerClient, "cvcStudy" | "cvcStudyTemperature" | "cvcStudyNote">; workspaceId: string; projectId: string; runId?: string; revisionId?: string; onClose: () => void;
}) {
  const study = useQuery({ queryKey: ["cvc-study", workspaceId, projectId], queryFn: () => client.cvcStudy(workspaceId, projectId), refetchOnWindowFocus: true });
  const [selectedId, setSelectedId] = useState(runId ?? "");
  const [tab, setTab] = useState("results");
  const [temperature, setTemperature] = useState("");
  const [reason, setReason] = useState("");
  const [boundaryId, setBoundaryId] = useState("");
  const [notice, setNotice] = useState("");
  const [printReady, setPrintReady] = useState(false);
  const noteFrame = useRef<HTMLIFrameElement>(null);
  const runs = [...(study.data?.runs ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const selected = selectedId ? runs.find((run) => run.runId === selectedId) : (revisionId ? runs.filter((run) => run.inputSnapshot.revisionId === revisionId).at(-1) : runs.at(-1));
  const revisions = [...(study.data?.revisions ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.input.revisionId.localeCompare(b.input.revisionId));
  const input = selected?.inputSnapshot ?? (!selectedId && revisionId ? revisions.find((revision) => revision.input.revisionId === revisionId)?.input : !selectedId && !revisionId ? revisions.at(-1)?.input : undefined);
  const unavailable = !study.isPending && !study.isError && ((!!selectedId && !selected) || (!!revisionId && !selectedId && !input));
  const parentRevisionId = study.data?.revisions.find((revision) => revision.input.revisionId === selected?.inputSnapshot.revisionId)?.parentRevisionId;
  const previous = selected && parentRevisionId ? runs.filter((run) => run.inputSnapshot.room.id === selected.inputSnapshot.room.id && run.inputSnapshot.revisionId === parentRevisionId).at(-1) : undefined;
  const hasDraft = temperature !== "" || reason !== "";
  useEffect(() => { setTemperature(""); setReason(""); setBoundaryId(""); setPrintReady(false); }, [selected?.runId]);
  const change = useMutation({ mutationFn: async () => {
    if (!input || !temperature.trim() || !Number.isFinite(Number(temperature)) || !reason.trim()) throw new Error("Renseignez une température et sa source ou le motif de la modification.");
    const boundary = boundaryId || input.boundaries.find((item) => item.kind === "outdoor")?.id;
    if (!boundary) throw new Error("Sélectionnez une condition extérieure.");
    return client.cvcStudyTemperature(workspaceId, projectId, { revisionId: input.revisionId, boundaryId: boundary, temperature: Number(temperature), provenanceDetail: reason.trim() });
  }, onSuccess: async (result) => { await study.refetch(); setSelectedId(result.run.runId); setTemperature(""); setReason(""); setTab("results"); setNotice("Nouvelle révision enregistrée. Le calcul précédent est conservé."); } });
  const note = useQuery({ queryKey: ["cvc-note", workspaceId, projectId, selected?.runId], queryFn: () => {
    if (!selected) throw new Error("Aucun calcul enregistré.");
    return client.cvcStudyNote(workspaceId, projectId, selected.runId);
  }, enabled: tab === "note" && !!selected });
  return <section className="flex h-full min-h-0 flex-col bg-background text-foreground" aria-label="Étude thermique">
    <header className="flex items-center gap-2 border-b px-4 py-3">
      <div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">Étude thermique</p><h2 className="truncate text-sm font-medium">{input?.room.name ?? study.data?.project.name ?? "Étude enregistrée"}</h2></div>
      <Button variant="ghost" size="icon-sm" aria-label="Actualiser l’étude" onClick={() => void study.refetch()}><RefreshCw className={study.isFetching ? "animate-spin" : ""} /></Button>
      <Button variant="ghost" size="icon-sm" aria-label="Fermer l’étude" onClick={onClose}><X /></Button>
    </header>
    {study.isPending ? <div role="status" aria-label="Chargement de l’étude" className="m-4 h-32 animate-pulse rounded bg-muted" /> : null}
    {study.isError ? <p role="alert" className="p-4">Impossible de vérifier l’étude. {study.error.message} Utilisez Actualiser pour réessayer.</p> : null}
    {unavailable ? <p role="alert" className="p-4">Le calcul demandé est introuvable. Consultez l’historique ; aucun autre calcul ne le remplace automatiquement.</p> : null}
    {notice ? <p role="status" className="px-4 pt-3 text-sm">{notice}</p> : null}
    {input ? <Tabs value={tab} onValueChange={(value) => setTab(String(value))} className="min-h-0 flex-1 gap-0">
      <TabsList variant="line" className="mx-4 my-2 max-w-full overflow-x-auto"><TabsTrigger value="results">Résultats</TabsTrigger><TabsTrigger value="data">Données</TabsTrigger><TabsTrigger value="history">Historique</TabsTrigger><TabsTrigger value="note">Note de calcul</TabsTrigger></TabsList>
      <div className="min-h-0 flex-1 overflow-auto p-4">
      <p className="mb-4 text-xs text-muted-foreground">Étude préliminaire · aucune sélection d’équipement. {input.indoorTemperature.provenance.kind === "assumed" ? "Données supposées — à vérifier." : "Consultez les sources des données."}</p>
      {hasDraft ? <p role="status" className="mb-4 text-sm">Modification non calculée : les résultats affichés restent ceux de la révision enregistrée.</p> : null}
      <TabsContent value="results">
        {selected ? <><p className="text-sm text-muted-foreground">Déperditions hivernales</p><p className="my-2 text-4xl font-semibold tracking-tight">{number(selected.totals.heatLossW)} <span className="text-lg font-normal">W</span></p>
        <p className="mb-5 text-xs text-muted-foreground">Enregistré le {new Date(selected.createdAt).toLocaleString("fr-FR")}{selected.runId !== runs.at(-1)?.runId ? " · Calcul historique" : ""}</p>
        {previous ? <p className="mb-4 text-sm">Écart avec la révision parente : {selected.totals.heatLossW - previous.totals.heatLossW > 0 ? "+" : ""}{number(selected.totals.heatLossW - previous.totals.heatLossW)} W</p> : null}
        <dl className="mb-5 divide-y border-y">{[["Transmission", selected.totals.transmissionW], ["Ponts thermiques", selected.totals.thermalBridgesW], ["Renouvellement d’air", selected.totals.airExchangeW]].map(([label, value]) => <div key={label} className="flex justify-between gap-4 py-3 text-sm"><dt>{label}</dt><dd className="font-medium">{typeof value === "number" ? number(value) : value} W</dd></div>)}</dl>
        <h3 className="mb-2 text-sm font-medium">Contributions</h3>{selected.contributions.map((item) => <details key={`${item.kind}:${item.inputId}`} className="border-b py-3 text-sm"><summary className="cursor-pointer"><span>{contributionName(input, item)}</span><span className="float-right font-medium">{number(item.heatLossW)} W</span></summary><p className="mt-3 text-muted-foreground">{number(item.coefficientWK)} W/K × {number(item.deltaTK)} K = {number(item.heatLossW)} W</p><p className="text-muted-foreground">{item.kind === "opaque" ? `${number(item.netAreaM2)} m² nets, ouvertures déduites` : item.kind === "opening" ? `${number(item.areaM2)} m² d’ouverture` : item.kind === "thermal-bridge" ? `${number(item.lengthM)} m de liaison` : `${number(item.flowM3s * 3600)} m³/h d’air extérieur`}</p></details>)}
        <details className="mt-5 text-sm"><summary className="cursor-pointer">Méthode et avertissements</summary><ul className="mt-3 list-disc space-y-2 pl-5">{selected.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul><p className="mt-3 text-xs break-all">Calcul : {selected.runId} · {selected.method.id}</p></details></> : <p>Aucun calcul enregistré. Complétez les données dans la conversation puis demandez le calcul.</p>}
      </TabsContent>
      <TabsContent value="data">
        <form className="mb-6 space-y-3 border-b pb-5" onSubmit={(event) => { event.preventDefault(); change.mutate(); }}>
          <h3 className="text-sm font-medium">Modifier une température extérieure</h3>
          <label className="block text-sm">Condition<select className="mt-1 block w-full rounded-md border bg-background p-2" value={boundaryId || input.boundaries.find((item) => item.kind === "outdoor")?.id || ""} onChange={(event) => setBoundaryId(event.target.value)}>{input.boundaries.filter((item) => item.kind === "outdoor").map((item, index) => <option key={item.id} value={item.id}>Extérieur {index + 1} · actuellement {number(item.temperature.value)} °C</option>)}</select></label>
          <label className="block text-sm">Nouvelle température (°C)<Input type="number" step="any" required value={temperature} onChange={(event) => setTemperature(event.target.value)} /></label>
          <label className="block text-sm">Source ou motif<Input required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ex. essai de comparaison avec −10 °C" /></label>
          <div className="flex flex-wrap gap-2"><Button type="submit" disabled={change.isPending}>{change.isPending ? "Calcul en cours…" : "Calculer une nouvelle révision"}</Button><Button type="button" variant="ghost" disabled={change.isPending} onClick={() => { setTemperature(""); setReason(""); change.reset(); }}>Annuler la modification</Button></div>
          {change.isError ? <p role="alert" className="text-sm">Modification non terminée : {change.error.message}</p> : null}
        </form>
        <h3 className="mb-3 text-sm font-medium">Données et sources</h3>
        {sourceRows(input).map(([label, quantity], index) => <details key={index} className="border-b py-3 text-sm"><summary className="cursor-pointer">{label}<span className="float-right ml-2">{number(quantity.value)} {quantity.unit}</span></summary><p className="mt-2 text-muted-foreground">{origin[quantity.provenance.kind]} — {quantity.provenance.detail}</p></details>)}
        <details className="mt-4 text-sm"><summary>Périmètre et ponts thermiques</summary><p className="mt-2">{input.envelopeDescription}</p><p>{input.airExchange.scopeDescription}</p>{input.thermalBridges.mode === "excluded" ? <p>{input.thermalBridges.reason}</p> : input.thermalBridges.items.map((bridge) => <p key={bridge.id} className="mt-2">{bridge.name} : {number(bridge.linearTransmittance.value)} W/(m·K) × {number(bridge.length.value)} m. {origin[bridge.linearTransmittance.provenance.kind]} — {bridge.linearTransmittance.provenance.detail}. {origin[bridge.length.provenance.kind]} — {bridge.length.provenance.detail}.</p>)}</details>
      </TabsContent>
      <TabsContent value="history"><h3 className="mb-4 text-sm font-medium">Calculs conservés</h3>{runs.length ? [...runs].reverse().map((run) => <div key={run.runId} className="flex items-center justify-between gap-3 border-b py-3"><div><p className="text-sm font-medium">{number(run.totals.heatLossW)} W {run.runId === selected?.runId ? "· affiché" : ""}</p><p className="text-xs text-muted-foreground">{new Date(run.createdAt).toLocaleString("fr-FR")}</p></div><Button variant="outline" size="sm" disabled={hasDraft || change.isPending} onClick={() => { setSelectedId(run.runId); setTab("results"); }}>Consulter</Button></div>) : <p>Aucun calcul enregistré.</p>}<p className="mt-4 text-xs text-muted-foreground">{study.data?.revisions.length ?? 0} révision(s) conservée(s). Les calculs précédents ne sont pas remplacés.</p></TabsContent>
      <TabsContent value="note">
        {!selected ? <p>Calculez la pièce avant de préparer la note.</p> : <><Button className="mb-3" variant="outline" disabled={!note.data || !printReady} onClick={() => { try { noteFrame.current?.contentWindow?.print(); } catch { setNotice("L’impression n’a pas pu démarrer. Réessayez après avoir rechargé la note."); } }}>Imprimer / enregistrer en PDF</Button><p className="mb-3 text-xs text-muted-foreground">Choisissez l’imprimante PDF dans la fenêtre d’impression pour enregistrer un document.</p>{note.isPending ? <div className="h-48 animate-pulse bg-muted" /> : note.isError ? <p role="alert">La note n’a pas pu être vérifiée : {note.error.message}</p> : <iframe key={selected.runId} ref={noteFrame} title="Note de calcul vérifiée" sandbox="allow-same-origin allow-modals" srcDoc={note.data?.html} onLoad={() => setPrintReady(true)} className="h-[65vh] w-full border bg-white" />}</>}
      </TabsContent>
      </div>
    </Tabs> : !unavailable && !study.isPending && !study.isError ? <p className="p-4">Aucune révision enregistrée. Importez les données de la pièce depuis la conversation.</p> : null}
  </section>;
}


export function CvcInputPreview({ input }: { input: RoomStudyInput }) {
  return <section className="h-full overflow-auto p-4" aria-label="Données de la pièce"><h2 className="text-lg font-medium">{input.room.name}</h2><p className="my-3 text-sm text-muted-foreground">Données importées · aucun résultat de calcul dans ce fichier.</p>{sourceRows(input).map(([label, quantity], index) => <details key={index} className="border-b py-3 text-sm"><summary className="cursor-pointer">{label}<span className="float-right ml-2">{number(quantity.value)} {quantity.unit}</span></summary><p className="mt-2 text-muted-foreground">{origin[quantity.provenance.kind]} — {quantity.provenance.detail}</p></details>)}<p className="mt-4 text-sm">{input.envelopeDescription}</p></section>;
}
