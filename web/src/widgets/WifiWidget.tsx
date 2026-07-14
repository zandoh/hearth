import { useMemo, useState } from "react";
import { encode } from "uqr";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import type { WidgetProps, WidgetSettingsProps } from "./registry";
import { type WifiAuth, parseWifiConfig, wifiPayload } from "./wifi";

// The guest Wi-Fi card: a QR phones scan to join, with the network name and
// password readable beside it for devices that can't. Everything lives in
// the instance's layout config — no backend, no secrets beyond what the
// card deliberately displays (Hearth is LAN-trust; the kiosk showing the
// wifi password to people already in the house is the feature).

// One black square-run path per QR; uqr's matrix includes the quiet zone,
// and the fill stays black-on-white in both themes — scanners want contrast,
// not theming.
function WifiQR({ payload }: { payload: string }) {
  const { size, path } = useMemo(() => {
    const qr = encode(payload);
    let d = "";
    for (let y = 0; y < qr.size; y++) {
      for (let x = 0; x < qr.size; x++) {
        if (qr.data[y][x]) d += `M${x} ${y}h1v1h-1z`;
      }
    }
    return { size: qr.size, path: d };
  }, [payload]);
  return (
    <svg className="wifi-qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Wi-Fi QR code">
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}

export function WifiWidget({ item }: WidgetProps) {
  const cfg = parseWifiConfig(item.config);
  if (!cfg.ssid) {
    return (
      <VStack className="widget-body" justify="center">
        <EmptyState
          isCompact
          title="Add your network"
          description="Set the Wi-Fi name and password in this widget's settings."
        />
      </VStack>
    );
  }

  return (
    <VStack className="widget-body" gap={2} align="center" justify="center">
      <WifiQR payload={wifiPayload(cfg)} />
      <VStack gap={0.5} align="center">
        <Text weight="semibold" maxLines={1}>
          {cfg.ssid}
        </Text>
        {cfg.auth !== "nopass" && cfg.password && (
          <Text type="supporting" size="xsm" hasTabularNumbers maxLines={1}>
            {cfg.password}
          </Text>
        )}
        <Text type="supporting" size="xsm">
          Scan to join
        </Text>
      </VStack>
    </VStack>
  );
}

export function WifiSettings({ config, save }: WidgetSettingsProps) {
  const cfg = parseWifiConfig(config);
  const [ssid, setSsid] = useState(cfg.ssid);
  const [auth, setAuth] = useState<WifiAuth>(cfg.auth);
  const [password, setPassword] = useState(cfg.password);
  const [hidden, setHidden] = useState(cfg.hidden);

  return (
    <VStack gap={3}>
      <TextInput label="Network name (SSID)" value={ssid} onChange={setSsid} />
      <Selector
        label="Security"
        value={auth}
        options={[
          { value: "WPA", label: "WPA / WPA2 / WPA3" },
          { value: "WEP", label: "WEP" },
          { value: "nopass", label: "None (open network)" },
        ]}
        onChange={(v) => setAuth((v as WifiAuth) ?? "WPA")}
      />
      {auth !== "nopass" && <TextInput label="Password" value={password} onChange={setPassword} />}
      <CheckboxInput
        label="Hidden network"
        description="Check if the network doesn't broadcast its name."
        value={hidden}
        onChange={setHidden}
      />
      <HStack justify="end">
        <Button
          size="sm"
          variant="primary"
          label="Save"
          onClick={() => save({ ...config, ssid: ssid.trim(), auth, password, hidden })}
        />
      </HStack>
    </VStack>
  );
}
