import { describe, expect, test } from "bun:test";
import { parseWifiConfig, wifiPayload } from "./wifi";

describe("parseWifiConfig", () => {
  test("empty config yields unconfigured WPA defaults", () => {
    expect(parseWifiConfig({})).toEqual({ ssid: "", auth: "WPA", password: "", hidden: false });
  });

  test("reads a saved config", () => {
    expect(
      parseWifiConfig({ ssid: "HearthGuest", auth: "nopass", password: "", hidden: true }),
    ).toEqual({ ssid: "HearthGuest", auth: "nopass", password: "", hidden: true });
  });

  test("tolerates junk types", () => {
    const cfg = parseWifiConfig({ ssid: 7, auth: "WPA3", password: null, hidden: "yes" });
    expect(cfg).toEqual({ ssid: "", auth: "WPA", password: "", hidden: false });
  });
});

describe("wifiPayload", () => {
  test("standard WPA network", () => {
    expect(wifiPayload({ ssid: "kitchen", auth: "WPA", password: "cocoa123", hidden: false })).toBe(
      "WIFI:T:WPA;S:kitchen;P:cocoa123;;",
    );
  });

  test("escapes the format's special characters", () => {
    expect(
      wifiPayload({ ssid: `caf\\e;guest`, auth: "WPA", password: `a,b:c"d`, hidden: false }),
    ).toBe(`WIFI:T:WPA;S:caf\\\\e\\;guest;P:a\\,b\\:c\\"d;;`);
  });

  test("open network omits the password field", () => {
    expect(
      wifiPayload({ ssid: "library", auth: "nopass", password: "ignored", hidden: false }),
    ).toBe("WIFI:T:nopass;S:library;;");
  });

  test("hidden network carries H:true", () => {
    expect(wifiPayload({ ssid: "attic", auth: "WEP", password: "pw", hidden: true })).toBe(
      "WIFI:T:WEP;S:attic;P:pw;H:true;;",
    );
  });
});
