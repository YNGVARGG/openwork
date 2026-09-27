import { BrowserWindow } from "electron";
import { randomUUID } from "node:crypto";
export function pdfFileName(title) {
  const name = String(title ?? "Etude thermique").normalize("NFKC").replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").replace(/[. ]+$/g, "").slice(0, 100);
  return `Note de calcul - ${name || "Etude thermique"}.pdf`;
}
export async function renderCvcPdf(html) {
  if (typeof html !== "string" || Buffer.byteLength(html, "utf8") > 4_000_000 || !html.includes("<!doctype html>")) throw new Error("Note de calcul invalide.");
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false, partition: `cvc-pdf-${randomUUID()}` } });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.webContents.session.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith("data:") }));
  const policy = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; font-src data:; script-src \'none\'; frame-src \'none\'; object-src \'none\'; base-uri \'none\'">';
  const safe = html.replace(/<head[^>]*>/i, match => match + policy);
  let timer;
  try {
    return await Promise.race([
      (async () => {
        await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(safe)}`);
        return await window.webContents.printToPDF({ pageSize: "A4", printBackground: true, preferCSSPageSize: true,
          displayHeaderFooter: true, headerTemplate: "<span></span>",
          footerTemplate: '<div style="width:100%;padding:0 14mm;font-size:8px;color:#666;display:flex;justify-content:space-between"><span>CVC Studio · Note préliminaire · modèle 2</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
          margins: { top: 0.45, bottom: 0.55, left: 0.5, right: 0.5 } });
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("L’export PDF a dépassé le délai.")), 30_000); }),
    ]);
  } finally { clearTimeout(timer); if (!window.isDestroyed()) window.destroy(); }
}
