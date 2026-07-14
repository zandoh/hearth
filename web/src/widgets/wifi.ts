// Pure helpers for the Wi-Fi widget: config parsing and the WIFI: QR
// payload (the ZXing/Wi-Fi Alliance format phone cameras understand).
// Kept free of React so bun can table-test the escaping rules.

export type WifiAuth = "WPA" | "WEP" | "nopass";

export interface WifiConfig {
  ssid: string;
  auth: WifiAuth;
  password: string;
  hidden: boolean;
}

const AUTHS: WifiAuth[] = ["WPA", "WEP", "nopass"];

export function parseWifiConfig(config: Record<string, unknown>): WifiConfig {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const auth = AUTHS.includes(config.auth as WifiAuth) ? (config.auth as WifiAuth) : "WPA";
  return {
    ssid: str(config.ssid),
    auth,
    password: str(config.password),
    hidden: config.hidden === true,
  };
}

// Backslash first, then the format's delimiters — the spec escapes
// \ ; , : " with a leading backslash.
const escapeField = (s: string) => s.replace(/([\\;,:"])/g, "\\$1");

// WIFI:T:WPA;S:kitchen;P:cocoa;H:true;; — password omitted on open
// networks, H only when the network is hidden.
export function wifiPayload(cfg: WifiConfig): string {
  let out = `WIFI:T:${cfg.auth};S:${escapeField(cfg.ssid)};`;
  if (cfg.auth !== "nopass") out += `P:${escapeField(cfg.password)};`;
  if (cfg.hidden) out += "H:true;";
  return out + ";";
}
