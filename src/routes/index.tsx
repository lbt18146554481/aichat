import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { ChatSurface } from "@/components/chat-surface";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bloom — Find your person" },
      {
        name: "description",
        content:
          "An AI chat that listens, drafts your portrait, and helps you find someone who resonates.",
      },
      { property: "og:title", content: "Bloom — Find your person" },
      {
        property: "og:description",
        content: "AI-powered, gentle, and entirely yours.",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  return (
    <AppLayout>
      <ChatSurface />
    </AppLayout>
  );
}
