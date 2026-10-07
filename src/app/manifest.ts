import type { MetadataRoute } from "next";

/** Lets field techs "Add to Home Screen" and launch DealScope full-screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DealScope",
    short_name: "DealScope",
    description: "M&A diligence and pre-install site discovery.",
    start_url: "/discovery",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#111113",
    theme_color: "#111113",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
