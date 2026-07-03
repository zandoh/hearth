import { getLayout, makeStepper, newPage, seedView } from "../helpers.mjs";

export default async function guestbook({ browser, base }) {
  const { step, failures } = makeStepper();

  // --- guest book corkboard: notes drag freely and persist ---
  await seedView(base, [
    { i: "gb-1", widget: "guestbook", x: 0, y: 0, w: 6, h: 6, config: {} },
  ]);
  await fetch(`${base}/api/widgets/guestbook`, {
    method: "POST",
    body: JSON.stringify({ author: "e2e", message: "Sticky", color: "yellow" }),
  });
  const nbCtx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const nbPage = await nbCtx.newPage();
  await nbPage.goto(base);
  await nbPage.waitForSelector(".sticky-note");
  const ink = await nbPage.evaluate(
    () => getComputedStyle(document.querySelector(".sticky-message")).color,
  );
  step("note ink is dark on paper", ink === "rgb(27, 25, 22)", ink);
  const noteBox = await nbPage.locator(".sticky-note").boundingBox();
  await nbPage.mouse.move(noteBox.x + noteBox.width / 2, noteBox.y + noteBox.height / 2);
  await nbPage.mouse.down();
  await nbPage.mouse.move(noteBox.x + 250, noteBox.y + 120, { steps: 10 });
  await nbPage.mouse.up();
  await nbPage.waitForTimeout(600);
  const movedBox = await nbPage.locator(".sticky-note").boundingBox();
  step("note drags freely (no grid)", movedBox.x > noteBox.x + 120, `x ${Math.round(noteBox.x)} -> ${Math.round(movedBox.x)}`);
  const gbNotes = await (await fetch(`${base}/api/widgets/guestbook`)).json();
  step("note position persisted", gbNotes[0].x > 0 && gbNotes[0].y > 0, `x=${gbNotes[0].x?.toFixed(2)} y=${gbNotes[0].y?.toFixed(2)}`);
  await nbCtx.close();
  return failures();
}
