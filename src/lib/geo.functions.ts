import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

/** Visitor country (by IP) plus live USD exchange rates. */
export const detectVisitorGeo = createServerFn({ method: "GET" }).handler(async () => {
  const { lookupIp, usdRates } = await import("./geo.server");
  const req = getRequest();
  const [geo, rates] = await Promise.all([lookupIp(req.headers), usdRates()]);
  return { geo, rates };
});
