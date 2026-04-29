import assert from "node:assert/strict";
import test from "node:test";

import { BRIEFING_TRANSCRIPT_STRUCTURE_RULES } from "./generate-script";

test("briefing transcript prompt rules include section structure and runtime targets", () => {
  assert.match(BRIEFING_TRANSCRIPT_STRUCTURE_RULES, /first 20%/);
  assert.match(BRIEFING_TRANSCRIPT_STRUCTURE_RULES, /1,350/);
  assert.match(BRIEFING_TRANSCRIPT_STRUCTURE_RULES, /GitHub movers \(3 items\)/);
  assert.match(BRIEFING_TRANSCRIPT_STRUCTURE_RULES, /3 Medium, 2 dev\.to, 2 TechCrunch/);
});
