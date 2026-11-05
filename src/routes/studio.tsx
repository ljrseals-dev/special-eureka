import { createFileRoute } from "@tanstack/react-router";
import { Studio } from "@/components/studio";

export const Route = createFileRoute("/studio")({
  component: StudioPage,
});

function StudioPage() {
  return <Studio />;
}
