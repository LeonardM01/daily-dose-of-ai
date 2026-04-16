/**
 * Humanizer prompt builder.
 *
 * Applies the anti-pattern rules from the humanizer skill
 * (https://github.com/blader/humanizer) to make AI-generated
 * briefing transcripts sound natural and conversational.
 */

export const HUMANIZER_ANTI_PATTERNS = [
  "Em-dash overuse — especially for parenthetical asides or emphasis",
  "The rule of three: lists with exactly three items used for rhetorical effect",
  "Inflated symbolism: describing mundane things as profound, transformative, or game-changing",
  "Promotional language: words like 'game-changer', 'revolutionary', 'cutting-edge', 'groundbreaking', 'innovative'",
  "Superficial -ing analyses: phrases like 'It's not just about X, it's about Y' or 'X isn't just X — it's Y'",
  "Vague attributions: 'Many experts say', 'It's worth noting that', 'Critics argue'",
  "AI vocabulary words: 'delve', 'underscore', 'navigate', 'leverage', 'foster', 'bolster', 'endeavor', 'facilitate', 'encompass', 'elucidate', 'unpack', 'illuminate', 'vital', 'crucial', 'paramount', 'pivotal', 'robust', 'seamless', 'comprehensive', 'intricate', 'multifaceted'",
  "Negative parallelisms: 'not unlike', 'not merely', 'not simply', 'not just'",
  "Excessive conjunctive phrases: 'moreover', 'furthermore', 'consequently', 'nevertheless', 'additionally', 'subsequently'",
  "Hedging adverbs: 'arguably', 'potentially', 'notably', 'remarkably', 'significantly'",
  "The phrase 'In conclusion' or 'To summarize'",
  "Starting sentences with 'Importantly,' or 'Crucially,' or 'Notably,'",
  "Calling things 'a testament to' something",
  "The construction 'This <noun> — <restatement>'",
  "Ending with an uplifting call-to-action or reflection that wasn't in the source material",
] as const;

export const HUMANIZER_STYLE_RULES = [
  "Vary sentence length. Mix short punchy sentences with longer ones.",
  "Use contractions: it's, don't, won't, can't, that's, they're, we're.",
  "It's okay to start sentences with 'And', 'But', 'So', 'Because'.",
  "Use concrete, specific language instead of abstract generalizations.",
  "If you'd naturally say something a certain way out loud, write it that way.",
  "Avoid stacking adjectives. One strong adjective beats three weak ones.",
  "Don't wrap every point in hedging language. Be direct.",
  "Use active voice. Say what things do, not what is done to them.",
  "Transitions should feel earned, not bolted on. If a thought naturally follows, just put it next.",
  "A conversational briefing is not an academic paper. Talk to the listener, not at them.",
] as const;

export function buildHumanizerPrompt(transcript: string): string {
  const antiPatternList = HUMANIZER_ANTI_PATTERNS.map(
    (p, i) => `${i + 1}. ${p}`,
  ).join("\n");

  const styleRuleList = HUMANIZER_STYLE_RULES.map(
    (r, i) => `${i + 1}. ${r}`,
  ).join("\n");

  return `You are editing an AI-generated podcast briefing transcript to make it sound like a natural human host wrote it. The host is knowledgeable but casual — like a smart friend catching you up on news over coffee.

## Anti-patterns to eliminate

Scan the transcript for these telltale signs of AI writing and rewrite them:

${antiPatternList}

## Style rules

${styleRuleList}

## Instructions

1. Read the full transcript below.
2. Identify every anti-pattern from the list above.
3. Rewrite those passages to sound natural while keeping the same information.
4. Do NOT change the structure, topic order, or factual content.
5. Do NOT add new information or remove existing information.
6. Do NOT add SSML tags or any markup — return plain text only.
7. The output must be a complete, ready-to-read transcript of similar length.

Return ONLY the rewritten transcript. No commentary, no explanations, no metadata.

---

Transcript:

${transcript}`;
}
