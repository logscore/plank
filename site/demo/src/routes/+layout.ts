export const ssr = false;

import posthog from "posthog-js";
import { browser } from "$app/environment";

export const load = async () => {
  if (browser) {
    posthog.init("phc_AyZUsySJWjBkNKfafR8tozNceqkvMZWJYQuzPHemCWz4", {
      api_host: "https://us.i.posthog.com",
      defaults: "2026-01-30",
    });
  }

  return;
};
