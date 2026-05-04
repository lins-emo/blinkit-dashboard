/* eslint-disable @next/next/no-img-element */

const PALETTE = ["#FFE9A0", "#FFD78A", "#F8CB46", "#F4A261", "#E0C7A0", "#D9DCD6"];

function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Avatar({ name, src, size = 32 }: { name: string; src?: string | null; size?: number }) {
  const dim = `${size}px`;
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        style={{ width: dim, height: dim }}
        className="rounded-full object-cover border border-line bg-bg shrink-0"
      />
    );
  }
  return (
    <div
      style={{ width: dim, height: dim, background: colorFor(name) }}
      className="rounded-full flex items-center justify-center text-ink font-semibold shrink-0 border border-line text-[11px]"
    >
      {initials(name)}
    </div>
  );
}
