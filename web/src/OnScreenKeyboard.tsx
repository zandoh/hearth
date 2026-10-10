import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// react-simple-keyboard loads only when a text field gets focus with the OSK on.
// Every plain board view skips it.
const OskDock = lazy(() => import("./OskDock"));

// Touch keyboard for the wall kiosk. Docks at the bottom when a text input gets focus
// and the keyboard is on (automatic on coarse-pointer screens, toggled in the header).
// Keys write through the native value setter, so React controlled inputs get real
// input events.

const STORAGE_KEY = "hearth-osk";

export function oskEnabled(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "on") return true;
  if (stored === "off") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

export function setOskEnabled(on: boolean) {
  localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  window.dispatchEvent(new Event("hearth-osk-changed"));
}

const isTextField = (el: Element | null): el is HTMLInputElement | HTMLTextAreaElement => {
  if (el instanceof HTMLTextAreaElement) return true;
  if (!(el instanceof HTMLInputElement)) return false;
  return ["text", "search", "email", "url", "tel", "number", ""].includes(el.type ?? "");
};

function writeToInput(el: HTMLInputElement | HTMLTextAreaElement, next: string) {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, next);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

export function OnScreenKeyboard() {
  const [enabled, setEnabled] = useState(oskEnabled);
  const [target, setTarget] = useState<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [shift, setShift] = useState(false);
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    const onChange = () => setEnabled(oskEnabled());
    window.addEventListener("hearth-osk-changed", onChange);
    return () => window.removeEventListener("hearth-osk-changed", onChange);
  }, []);

  // Warm the lazy chunk while idle, so the first tap on a field never waits on the
  // network. The asset is then cached as immutable.
  useEffect(() => {
    if (!enabled) return;
    const warm = () => void import("./OskDock");
    if ("requestIdleCallback" in window) {
      const id = requestIdleCallback(warm);
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(warm, 2000);
    return () => clearTimeout(id);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setTarget(null);
      return;
    }
    const onFocusIn = (e: FocusEvent) => {
      if (isTextField(e.target as Element)) {
        setTarget(e.target as HTMLInputElement);
      }
    };
    const onFocusOut = () => {
      // Delay: focus may be moving to another field or a keyboard key.
      setTimeout(() => {
        if (!isTextField(document.activeElement)) setTarget(null);
      }, 150);
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, [enabled]);

  // Focus lands on pointerdown, but nothing may change under the finger before
  // pointerup. If the dock mounts mid-tap, it can cover the field (and the dialog shrink
  // moves content), so the browser sends the click to the <dialog>. Astryx reads that as
  // a backdrop click and closes the modal. So the dock mounts on the next pointerup (or
  // shortly after, for keyboard focus).
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!target) {
      setShow(false);
      return;
    }
    const done = () => setShow(true);
    document.addEventListener("pointerup", done, { once: true });
    const id = setTimeout(done, 250);
    return () => {
      clearTimeout(id);
      document.removeEventListener("pointerup", done);
    };
  }, [target]);

  // The dialog resize (css :has(.osk-settled)) waits a beat longer still.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!show) {
      setSettled(false);
      return;
    }
    const id = setTimeout(() => setSettled(true), 120);
    return () => clearTimeout(id);
  }, [show]);

  // Once the layout has settled, bring the focused field into view.
  useEffect(() => {
    if (!target || !settled) return;
    const id = requestAnimationFrame(() =>
      target.scrollIntoView({ block: "center", behavior: "smooth" }),
    );
    return () => cancelAnimationFrame(id);
  }, [target, settled]);

  const onKeyPress = useCallback(
    (button: string) => {
      const el = targetRef.current;
      if (!el) return;
      if (button === "{shift}" || button === "{lock}") {
        setShift((s) => !s);
        return;
      }
      if (button === "{enter}") {
        el.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
        );
        el.blur();
        setTarget(null);
        return;
      }
      if (button === "{hide}") {
        el.blur();
        setTarget(null);
        return;
      }
      let next = el.value;
      if (button === "{bksp}") next = next.slice(0, -1);
      else if (button === "{space}") next += " ";
      else next += button;
      writeToInput(el, next);
      if (shift) setShift(false);
      el.focus();
    },
    [shift],
  );

  if (!enabled || !target || !show) return null;

  // Astryx dialogs are native <dialog> with showModal(): they sit in the top layer,
  // above any z-index, and make everything outside inert, so a keyboard underneath could
  // not be tapped. Portaling the dock into the open dialog makes it a descendant:
  // interactive, painted with the modal, and gone when it closes. The host is resolved
  // per render, and every focus change re-renders.
  const dialogs = document.querySelectorAll<HTMLElement>("dialog[open]");
  const host = dialogs[dialogs.length - 1] ?? document.body;

  return createPortal(
    <div
      className={`osk-dock${settled ? " osk-settled" : ""}`}
      // Keep pointer-downs on keys from stealing focus off the input.
      onMouseDown={(e) => e.preventDefault()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <Suspense fallback={null}>
        <OskDock shift={shift} onKeyPress={onKeyPress} />
      </Suspense>
    </div>,
    host,
  );
}
