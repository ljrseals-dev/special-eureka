import { createFileRoute } from "@tanstack/react-router";
import { TubeSinger } from "@/components/tube-singer";

export const Route = createFileRoute("/sing")({
  component: SingPage,
});

function SingPage() {
  return <TubeSinger />;
}
