import type { ReactNode } from "react";

export const metadata = {
  title: "eRally4 Cup",
  description: "Championnat de rallye virtuel sur EA Sports WRC",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: 16 }}>
        {children}
      </body>
    </html>
  );
}
