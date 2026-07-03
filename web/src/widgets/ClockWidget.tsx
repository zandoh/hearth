import { useCallback, useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { apiFetch } from "../api";
import { TOPICS } from "../topics";
import { useTopic } from "../useSSE";
import type { WidgetProps, WidgetSettingsProps } from "./registry";

// Reference widget: fetches server time once, ticks locally, and resyncs
// whenever the backend's clock job publishes on the "clock" topic. Also the
// reference for per-instance config: 24-hour time and a seconds display.

interface ClockPayload {
  now: string;
  zone: string;
}

interface ClockConfig {
  hour24: boolean;
  showSeconds: boolean;
}

const parseConfig = (config: Record<string, unknown>): ClockConfig => ({
  hour24: config.hour24 === true,
  showSeconds: config.showSeconds === true,
});

export function ClockWidget({ item }: WidgetProps) {
  const { hour24, showSeconds } = parseConfig(item.config);
  const [offsetMs, setOffsetMs] = useState(0);
  const [zone, setZone] = useState("");
  const [display, setDisplay] = useState(() => new Date());

  const sync = useCallback((payload: ClockPayload) => {
    setOffsetMs(new Date(payload.now).getTime() - Date.now());
    setZone(payload.zone);
  }, []);

  useEffect(() => {
    apiFetch<ClockPayload>("/api/widgets/clock/now")
      .then(sync)
      .catch(() => {});
  }, [sync]);

  useTopic(
    TOPICS.clock,
    useCallback((data: unknown) => sync(data as ClockPayload), [sync]),
  );

  useEffect(() => {
    const id = setInterval(() => setDisplay(new Date(Date.now() + offsetMs)), 1000);
    return () => clearInterval(id);
  }, [offsetMs]);

  return (
    <VStack height="100%" justify="center" align="center" gap={1}>
      <Text type="display-2" hasTabularNumbers className="brand-data">
        {display.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          ...(showSeconds ? { second: "2-digit" } : {}),
          hour12: !hour24,
        })}
      </Text>
      <Text type="supporting">
        {display.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
        {zone ? ` · ${zone}` : ""}
      </Text>
    </VStack>
  );
}

export function ClockSettings({ config, save }: WidgetSettingsProps) {
  const initial = parseConfig(config);
  const [hour24, setHour24] = useState(initial.hour24);
  const [showSeconds, setShowSeconds] = useState(initial.showSeconds);

  return (
    <VStack gap={3}>
      <Switch label="24-hour time" value={hour24} onChange={setHour24} />
      <Switch label="Show seconds" value={showSeconds} onChange={setShowSeconds} />
      <HStack justify="end">
        <Button
          size="sm"
          variant="primary"
          label="Save"
          onClick={() => save({ ...config, hour24, showSeconds })}
        />
      </HStack>
    </VStack>
  );
}
