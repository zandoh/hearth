import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Keyboard from "react-simple-keyboard";
import "react-simple-keyboard/build/css/index.css";

// Touch keyboard for the wall kiosk. Docks to the bottom whenever a text
// input gains focus and the keyboard is enabled (auto on coarse-pointer
// screens, toggleable from the header). Keys write into the focused input
// through the native value setter so React controlled inputs see real
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

  // Focus lands on pointerDOWN, but nothing may change under the finger
  // before pointerUP: if the dock mounts mid-tap it can cover the field
  // (and the dialog shrink moves content), so the browser retargets the
  // synthesized click to the <dialog> element — which Astryx reads as a
  // backdrop click and dismisses the whole modal. The dock therefore
  // mounts on the next pointerup (or shortly after, for keyboard focus).
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

  // Astryx dialogs are native <dialog> shown with showModal(): they live in
  // the browser's top layer, above any z-index, and make everything outside
  // inert — the keyboard rendered underneath and untappable. Portaling the
  // dock INTO the open dialog makes it a dialog descendant: interactive,
  // painted with the modal, and gone with it when the dialog closes. The
  // host is resolved per render, and every focus change re-renders.
  const dialogs = document.querySelectorAll<HTMLElement>("dialog[open]");
  const host = dialogs[dialogs.length - 1] ?? document.body;

  return createPortal(
    <div
      className={`osk-dock${settled ? " osk-settled" : ""}`}
      // Keep pointer-downs on keys from stealing focus off the input.
      onMouseDown={(e) => e.preventDefault()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <Keyboard
        layoutName={shift ? "shift" : "default"}
        layout={{
          default: [
            "1 2 3 4 5 6 7 8 9 0 {bksp}",
            "q w e r t y u i o p",
            "a s d f g h j k l '",
            "{shift} z x c v b n m , . -",
            "{hide} {space} {enter}",
          ],
          shift: [
            "! @ # $ % & * ( ) / {bksp}",
            "Q W E R T Y U I O P",
            'A S D F G H J K L "',
            "{shift} Z X C V B N M ; : _",
            "{hide} {space} {enter}",
          ],
        }}
        display={{
          "{bksp}": "⌫",
          "{enter}": "return",
          "{shift}": "⇧",
          "{space}": " ",
          "{hide}": "⌄",
        }}
        onKeyPress={onKeyPress}
      />
    </div>,
    host,
  );
}
