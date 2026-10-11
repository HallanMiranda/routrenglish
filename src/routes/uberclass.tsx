import { createFileRoute, redirect } from "@tanstack/react-router";

// Old name: UberClass is now Aplicabilidade.
export const Route = createFileRoute("/uberclass")({
  beforeLoad: () => {
    throw redirect({ to: "/aplicabilidade", replace: true });
  },
});
