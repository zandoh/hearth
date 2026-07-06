import Keyboard from "react-simple-keyboard";
import "react-simple-keyboard/build/css/index.css";

// The heavy half of the on-screen keyboard, split out so react-simple-
// keyboard and its stylesheet load lazily: every board visitor pays for
// the focus-tracking logic in OnScreenKeyboard, but only a focused text
// field with the OSK enabled ever needs the key grid itself.

export default function OskDock({
  shift,
  onKeyPress,
}: {
  shift: boolean;
  onKeyPress: (button: string) => void;
}) {
  return (
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
  );
}
