import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/uberclass/$")({
  beforeLoad: ({ params }) => {
    const packId = params._splat?.split("/")[0];
    if (packId) throw redirect({ to: "/aplicabilidade/$packId", params: { packId }, search: { nivel: "todos" }, replace: true });
    throw redirect({ to: "/aplicabilidade", replace: true });
  },
});
