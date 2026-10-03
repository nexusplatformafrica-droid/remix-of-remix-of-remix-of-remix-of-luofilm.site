import { createFileRoute } from "@tanstack/react-router";
import { buildSitemap, xmlResponse } from "@/lib/sitemap-builder";

export const Route = createFileRoute("/sitemap-animations.xml")({
  server: { handlers: { GET: async () => xmlResponse(await buildSitemap("animations")) } },
});