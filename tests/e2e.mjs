import { withBrowser } from "./browser-harness.mjs";
import { runJourney } from "./journey-e2e.mjs";

await withBrowser("/?e2e=1", runJourney);
