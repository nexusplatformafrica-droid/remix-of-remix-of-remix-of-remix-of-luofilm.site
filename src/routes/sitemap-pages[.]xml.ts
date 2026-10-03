import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { buildSitemap, xmlResponse } from "@/lib/sitemap-builder";

export const Route = createFileRoute("/sitemap-pages.xml")({
  server: { handlers: { GET: async () => xmlResponse(await buildSitemap("pages")) } },
});
