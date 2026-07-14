import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useWidgetData } from "../useWidgetData";
import type { WidgetProps } from "./registry";
import type { WordOfTheDay } from "./wordApi";

// A word of the day from the pack embedded in the binary: no upstream API,
// no configuration — every screen in the house shows the same word, and it
// flips at the household's midnight.

export function WordWidget(_props: WidgetProps) {
  const { data } = useWidgetData<WordOfTheDay>("word", "/today");

  if (!data) {
    return (
      <VStack className="widget-body" justify="center" align="center">
        <Text type="supporting">Loading…</Text>
      </VStack>
    );
  }

  return (
    <VStack className="widget-body" gap={2}>
      <Text type="supporting" size="xsm">
        WORD OF THE DAY
      </Text>
      <VStack gap={0.5}>
        <Text type="display-2" className="brand-data">
          {data.word}
        </Text>
        <Text type="supporting" size="xsm">
          {data.pos}
        </Text>
      </VStack>
      <Text>{data.definition}</Text>
      <Text type="supporting" size="xsm">
        “{data.example}”
      </Text>
    </VStack>
  );
}
