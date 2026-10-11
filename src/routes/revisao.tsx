import { createFileRoute, redirect } from "@tanstack/react-router";

// Revisão now lives inside Aulas.
export const Route = createFileRoute("/revisao")({
  beforeLoad: () => {
    throw redirect({ to: "/aulas/revisar", replace: true });
  },
});
