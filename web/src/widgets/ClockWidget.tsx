import { useCallback, useEffect, useState } from "react";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { apiFetch } from "../api";
import { useTopic } from "../useSSE";
import type { WidgetProps } from "./registry";

// Reference widget: fetches server time once, ticks locally, and resyncs
// whenever the backend's clock job publishes on the "clock" topic.

interface ClockPayload {
  now: string;
  zone: string;
}

export function ClockWidget(_props: WidgetProps) {
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
    "clock",
    useCallback((data: unknown) => sync(data as ClockPayload), [sync]),
  );

  useEffect(() => {
    const id = setInterval(() => setDisplay(new Date(Date.now() + offsetMs)), 1000);
    return () => clearInterval(id);
  }, [offsetMs]);

  return (
    <VStack height="100%" justify="center" align="center" gap={1}>
      <Text type="display-2" hasTabularNumbers>
        {display.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </Text>
      <Text type="supporting">
        {display.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
        {zone ? ` · ${zone}` : ""}
      </Text>
    </VStack>
  );
}
