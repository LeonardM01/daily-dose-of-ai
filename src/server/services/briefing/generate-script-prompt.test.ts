import assert from "node:assert/strict";
import test from "node:test";

import {
  BRIEFING_TRANSCRIPT_STRUCTURE_RULES,
  sanitizeSsmlForTts,
  buildFallbackSsml,
} from "./generate-script";
import { SPEAKING_RATE } from "./synthesize-audio";

void test("briefing transcript prompt rules include section structure and runtime targets", () => {
  assert.match(BRIEFING_TRANSCRIPT_STRUCTURE_RULES, /first 20%/);
  assert.match(BRIEFING_TRANSCRIPT_STRUCTURE_RULES, /1,350/);
  assert.match(BRIEFING_TRANSCRIPT_STRUCTURE_RULES, /GitHub movers \(3 items\)/);
  assert.match(BRIEFING_TRANSCRIPT_STRUCTURE_RULES, /3 Medium, 2 dev\.to, 2 TechCrunch/);
});

void test("sanitizeSsmlForTts removes say-as characters tags", () => {
  const input =
    '<speak><s><say-as interpret-as="characters">ChatGPT</say-as> is cool</s></speak>';
  const result = sanitizeSsmlForTts(input);
  assert.ok(!result.includes("say-as"), "should strip say-as tags");
  assert.ok(result.includes("ChatGPT"), "should keep the text content");
  assert.ok(result.includes("is cool"));
});

void test("sanitizeSsmlForTts strips double quotation marks from text content", () => {
  const input = '<speak><s>They called it "revolutionary"</s></speak>';
  const result = sanitizeSsmlForTts(input);
  assert.ok(!result.includes('"revolutionary"'), "should remove double quotes");
  assert.ok(result.includes("revolutionary"));
});

void test("sanitizeSsmlForTts preserves quotes inside XML attributes", () => {
  const input = '<speak><sub alias="A I">AI</sub></speak>';
  const result = sanitizeSsmlForTts(input);
  assert.ok(result.includes('alias="A I"'), "should keep attribute quotes");
});

void test("sanitizeSsmlForTts preserves apostrophes in contractions", () => {
  const input = "<speak><s>It's the best they've done</s></speak>";
  const result = sanitizeSsmlForTts(input);
  assert.ok(result.includes("It's"), "should keep apostrophes");
  assert.ok(result.includes("they've"), "should keep apostrophes");
});

void test("sanitizeSsmlForTts strips curly double quotes", () => {
  const input =
    "<speak><s>The so-called “breakthrough” arrived</s></speak>";
  const result = sanitizeSsmlForTts(input);
  assert.ok(!result.includes("“"), "should strip left curly quote");
  assert.ok(!result.includes("”"), "should strip right curly quote");
  assert.ok(result.includes("breakthrough"));
});

void test("sanitizeSsmlForTts handles say-as with single quotes in attr", () => {
  const input =
    "<speak><s><say-as interpret-as='characters'>LangChain</say-as></s></speak>";
  const result = sanitizeSsmlForTts(input);
  assert.ok(!result.includes("say-as"));
  assert.ok(result.includes("LangChain"));
});

void test("sanitizeSsmlForTts strips &quot; entities from text content", () => {
  const input = "<speak><s>He said &quot;hello&quot; to them</s></speak>";
  const result = sanitizeSsmlForTts(input);
  assert.ok(!result.includes("&quot;"), "should strip &quot; entities");
  assert.ok(result.includes("hello"));
});

void test("buildFallbackSsml strips double quotation marks from transcript", () => {
  const transcript = 'He said "hello" to the crowd.';
  const result = buildFallbackSsml(transcript);
  assert.ok(!result.includes('"'), "should not contain straight double quotes");
  assert.ok(!result.includes("&quot;"), "should not contain &quot; entities");
  assert.ok(result.includes("hello"));
});

void test("buildFallbackSsml strips curly double quotes from transcript", () => {
  const transcript = "The “new thing” is here.";
  const result = buildFallbackSsml(transcript);
  assert.ok(!result.includes("“"));
  assert.ok(!result.includes("”"));
  assert.ok(result.includes("new thing"));
});

void test("SPEAKING_RATE is 0.9 for slower clearer audio", () => {
  assert.equal(SPEAKING_RATE, 0.9);
});
