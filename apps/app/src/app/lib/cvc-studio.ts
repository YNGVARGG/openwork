/** Build-time switches for the CVC Studio desktop profile. */
export const isCvcStudioBuild = import.meta.env.VITE_CVC_STUDIO === "1";
export const CVC_STUDIO_APP_NAME = "CVC Studio";
/** Protocol scheme the CVC Studio installer registers (see desktop-distribution.mjs). */
export const CVC_STUDIO_PROTOCOL_SCHEME = "cvc-studio";
