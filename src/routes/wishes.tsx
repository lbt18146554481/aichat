import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/wishes")({
  component: WishesLayout,
});

function WishesLayout() {
  return <Outlet />;
}
