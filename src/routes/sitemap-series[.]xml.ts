import { createFileRoute } from "@tanstack/react-router";
import { buildSitemap, xmlResponse } from "@/lib/sitemap-builder";

export const Route = createFileRoute("/sitemap-series.xml")({
  server: { handlers: { GET: async () => xmlResponse(await buildSitemap("series")) } },
});