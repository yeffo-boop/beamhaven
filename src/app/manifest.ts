import type { MetadataRoute } from "next";

import { brand } from "@/config/brand";

/**
 * Lets phones and tablets add BeamHaven to the home screen, where it opens
 * full screen like an app (Milestone 12, ADR-044). There is no offline mode:
 * the data lives on the server, so the app needs a connection.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.name,
    description: brand.tagline,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7f5f1",
    theme_color: "#2f5d50",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
