import { notFound } from "next/navigation";
import TestChecks from "./test-checks";

// Page de diagnostic, disponible uniquement en dev (404 en production).
export default function TestPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main style={{ maxWidth: 640 }}>
      <h1>Page de test</h1>
      <p>Visible uniquement en local (<code>npm run dev</code>).</p>
      <TestChecks />
    </main>
  );
}
