import { useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Dialog } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { apiFetch } from "./api";
import { useMutate } from "./useMutate";

// First-boot template picker. Shows once per install (the server decides:
// pristine seed view and no prior answer), writes a starter layout into the
// Home view, and never asks again — including on other screens.

const TEMPLATES = [
  {
    id: "family",
    name: "Family hub",
    description:
      "Calendar front and center — chores, groceries, meds, weather, and countdowns around it.",
  },
  {
    id: "kitchen",
    name: "Kitchen",
    description: "Meal plan and groceries lead. For the screen by the fridge.",
  },
  {
    id: "simple",
    name: "Simple",
    description: "Time, weather, and what's next. Calm and glanceable.",
  },
];

export function Onboarding() {
  const [needed, setNeeded] = useState(false);
  const { mutate, error, busy } = useMutate(() => setNeeded(false));

  useEffect(() => {
    apiFetch<{ needed: boolean }>("/api/onboarding")
      .then((r) => setNeeded(r.needed))
      .catch(console.error);
  }, []);

  if (!needed) return null;

  const choose = (template: string) =>
    mutate(() =>
      apiFetch("/api/onboarding", { method: "POST", body: JSON.stringify({ template }) }),
    );

  return (
    <Dialog isOpen width={520} onOpenChange={(open) => !open && choose("scratch")}>
      <VStack gap={3} className="cal-dialog-body">
        <Heading level={2}>Welcome to hearth</Heading>
        <Text type="supporting">
          Pick a starting layout. Everything can be rearranged, resized, or swapped later — this
          just saves you the blank grid.
        </Text>
        <VStack as="ul" gap={2} className="plain-list">
          {TEMPLATES.map((t) => (
            <HStack as="li" key={t.id} gap={3} align="center" className="view-row">
              <VStack gap={0.5} className="min-w-0 flex-1">
                <Text weight="semibold">{t.name}</Text>
                <Text type="supporting" size="xsm">
                  {t.description}
                </Text>
              </VStack>
              <Button
                size="sm"
                variant="secondary"
                label="Use this"
                isDisabled={busy}
                onClick={() => choose(t.id)}
              />
            </HStack>
          ))}
        </VStack>
        {error && <Text className="form-error">{error}</Text>}
        <HStack justify="end">
          <Button
            variant="ghost"
            label="Start from scratch"
            isDisabled={busy}
            onClick={() => choose("scratch")}
          />
        </HStack>
      </VStack>
    </Dialog>
  );
}
