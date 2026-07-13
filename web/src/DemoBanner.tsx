import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import { isDemo } from "./demo";
import { resetDemo } from "./demo/state";

// The honesty strip for the hosted demo: this is a sandbox, it lives in
// your browser, and it resets daily. Rendered only in demo builds.
export function DemoBanner() {
  if (!isDemo) return null;
  return (
    <div className="demo-banner">
      <Text size="xsm">
        Demo — everything you change lives in this browser and resets every 24 hours.{" "}
        <a href="https://github.com/zandoh/hearth#self-hosting" target="_blank" rel="noreferrer">
          Self-host the real thing
        </a>
      </Text>
      <Button
        size="sm"
        variant="ghost"
        label="Reset now"
        onClick={() => {
          resetDemo();
          window.location.reload();
        }}
      />
    </div>
  );
}
