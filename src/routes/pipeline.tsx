import { createFileRoute } from "@tanstack/react-router";
import { PipelineStudio } from "@/components/pipeline-studio";

export const Route = createFileRoute("/pipeline")({
  component: PipelinePage,
});

function PipelinePage() {
  return <PipelineStudio />;
}
