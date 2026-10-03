import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { sitemapIndex, xmlResponse } from "@/lib/sitemap-builder";

/** Sitemap index — points to every grouped sitemap (refreshed hourly). */
export const Route = createFileRoute("/sitemap.xml")({
  server: { handlers: { GET: async () => xmlResponse(sitemapIndex()) } },
});
