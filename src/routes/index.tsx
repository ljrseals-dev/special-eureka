import { createFileRoute } from "@tanstack/react-router";
import { TubeSinger } from "@/components/tube-singer";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <TubeSinger />;
}
