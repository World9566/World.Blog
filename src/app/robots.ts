import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: process.env.SITE_URL
      ? {
          userAgent: "*",
          allow: "/",
          disallow: ["/search", "/api/", "/account", "/login", "/admin"],
        }
      : { userAgent: "*", disallow: "/" },
    sitemap: new URL("/sitemap.xml", getSiteUrl()).href,
  };
}
