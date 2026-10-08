import { avatarHue, initials } from "@/lib/format";

// Photo de profil du pilote, ou avatar à initiales s'il n'en a pas
export default function Avatar({ name, size = 48, url }: { name: string; size?: number; url?: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- image déjà redimensionnée par l'API
    return <img src={url} alt="" width={size} height={size} className="avatar-photo" loading="lazy" />;
  }
  const hue = avatarHue(name);
  return (
    <span
      className="avatar-initials"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: `linear-gradient(135deg, hsl(${hue} 70% 34%), hsl(${hue} 75% 22%))`,
      }}
    >
      {initials(name)}
    </span>
  );
}
