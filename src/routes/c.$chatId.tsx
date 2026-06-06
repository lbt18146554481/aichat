import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { ChatSurface } from "@/components/chat-surface";

export const Route = createFileRoute("/c/$chatId")({
  head: () => ({
    meta: [
      { title: "Chat — Bloom" },
      { name: "description", content: "A Bloom conversation." },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const { chatId } = Route.useParams();
  return (
    <AppLayout>
      <ChatSurface key={chatId} chatId={chatId} />
    </AppLayout>
  );
}
