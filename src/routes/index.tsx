import { createFileRoute } from "@tanstack/react-router";
import { IrisChat } from "@/components/iris-chat";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Iris — 你的红娘" },
      {
        name: "description",
        content:
          "Iris 是一个 AI 红娘：听你描述你想要的人，再从她手上的人里，一个一个郑重介绍给你。",
      },
      { property: "og:title", content: "Iris — 你的红娘" },
      {
        property: "og:description",
        content: "一个 AI 红娘，慢慢地、一个一个把人介绍给你。",
      },
    ],
  }),
  component: () => <IrisChat />,
});
