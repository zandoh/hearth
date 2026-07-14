import { useCallback, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { TOPICS } from "../topics";
import { useTopicData } from "../useWidgetData";
import type { WidgetProps, WidgetSettingsProps } from "./registry";
import { DEFAULT_COUNT, MAX_COUNT, NEWS_TOPICS, parseNewsConfig, timeAgo } from "./news";
import { type HeadlinesResponse, getHeadlines } from "./newsApi";

// Headlines for one Google News topic per instance — read-only glances, no
// links: the kiosk is for knowing, not browsing.

export function NewsWidget({ item }: WidgetProps) {
  const cfg = parseNewsConfig(item.config);
  // The fetch carries a per-instance topic param, so this widget uses
  // useTopicData directly instead of the slug-derived useWidgetData.
  const fetcher = useCallback(() => getHeadlines(cfg.topic), [cfg.topic]);
  const { data } = useTopicData<HeadlinesResponse>(TOPICS.news, fetcher);

  const headlines = data?.headlines;
  if (!headlines) {
    return (
      <VStack className="widget-body" justify="center" align="center">
        <Text type="supporting">{data?.pending ? "Fetching headlines…" : "Loading…"}</Text>
      </VStack>
    );
  }

  const label = NEWS_TOPICS.find((t) => t.value === cfg.topic)?.label ?? cfg.topic;
  const now = new Date();
  return (
    <VStack className="widget-body" gap={2}>
      <Text type="supporting" size="xsm">
        {label.toUpperCase()}
      </Text>
      {headlines.items.length === 0 ? (
        <Text type="supporting">No headlines right now</Text>
      ) : (
        headlines.items.slice(0, cfg.count).map((h) => (
          <VStack key={`${h.source}|${h.title}`} gap={0.5}>
            <Text maxLines={2} className="min-w-0">
              {h.title}
            </Text>
            <Text type="supporting" size="xsm" maxLines={1}>
              {h.source}
              {h.publishedAt && ` · ${timeAgo(h.publishedAt, now)}`}
            </Text>
          </VStack>
        ))
      )}
    </VStack>
  );
}

export function NewsSettings({ config, save }: WidgetSettingsProps) {
  const cfg = parseNewsConfig(config);
  const [topic, setTopic] = useState(cfg.topic);
  const [count, setCount] = useState(cfg.count);

  return (
    <VStack gap={3}>
      <Selector
        label="Topic"
        value={topic}
        options={NEWS_TOPICS}
        onChange={(v) => setTopic(v ?? cfg.topic)}
      />
      <Selector
        label="Headlines shown"
        value={String(count)}
        options={Array.from({ length: MAX_COUNT }, (_, i) => String(i + 1))}
        onChange={(v) => setCount(Number(v ?? DEFAULT_COUNT))}
      />
      <HStack justify="end">
        <Button
          size="sm"
          variant="primary"
          label="Save"
          onClick={() => save({ ...config, topic, count })}
        />
      </HStack>
    </VStack>
  );
}
