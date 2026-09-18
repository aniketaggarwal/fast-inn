import { BedIcon } from "./icons";

// No real photos exist for these (fictional, Section 0-style) hotels, and
// stock photos borrowed from elsewhere would misrepresent an actual
// property — same reasoning as the synthetic ID cards. A deterministic
// gradient (hashed from the hotel's own name, so it's stable across
// reloads without storing anything) reads as an intentional brand mark
// rather than a missing image.
function hashHue(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) % 360;
  }
  return hash;
}

export function HotelBanner({ name, className = "h-32" }) {
  const hue = hashHue(name || "");
  const gradient = `linear-gradient(135deg, hsl(${hue}, 70%, 45%), hsl(${(hue + 45) % 360}, 70%, 35%))`;

  return (
    <div className={`relative flex items-center justify-center overflow-hidden rounded-t-lg ${className}`} style={{ background: gradient }}>
      <BedIcon className="h-10 w-10 text-white/40" />
    </div>
  );
}
