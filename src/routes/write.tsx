import { createFileRoute } from "@tanstack/react-router";
import { TextToSing } from "@/components/text-to-sing";

export const Route = createFileRoute("/write")({
  component: WritePage,
});

function WritePage() {
  return <TextToSing />;
}
