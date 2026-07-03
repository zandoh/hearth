import type { Profile } from "./profiles";

// Ink that stays readable on any user-picked disc color.
const inkFor = (hex: string): string => {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  if (Number.isNaN(n)) return "#F4F1EB";
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 150 ? "#1B1916" : "#F4F1EB";
};

// A person as a small colored disc with their initial. Title carries the
// full name for hover/assistive tech.
export function Avatar({ profile, size = 22 }: { profile: Profile; size?: number }) {
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        background: profile.color,
        color: inkFor(profile.color),
        fontSize: size * 0.5,
      }}
      title={profile.name}
      aria-label={profile.name}
    >
      {(profile.name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}
