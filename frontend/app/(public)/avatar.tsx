import { avatarHue, initials } from "@/lib/format";

// Avatar par défaut (initiales) ; la photo de profil viendra avec les comptes pilotes
export default function Avatar({ name, size = 48 }: { name: string; size?: number }) {
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
