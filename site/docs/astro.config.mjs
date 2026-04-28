// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: "Plank Docs",
      logo: {
        src: "./src/assets/plank-logo.png",
        alt: "Plank",
      },
      favicon: "/favicon.ico",
      customCss: ["./src/styles/custom.css"],
      social: [
        {
          icon: "laptop",
          label: "Main site",
          href: "https://plank.lsreeder.com",
        },
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/logscore/plank",
        },
      ],
      sidebar: [
        {
          label: "Guides",
          autogenerate: { directory: "guides" },
        },
        {
          label: "Configuration",
          autogenerate: { directory: "configuration" },
        },
      ],
    }),
  ],
  base: "/docs",
});
