import { TextToSpeechClient } from "@google-cloud/text-to-speech";

const DEFAULT_VOICE = "en-US-Chirp3-HD-Algenib";

export type SynthesizeResult = {
  audioBuffer: Buffer;
  characterCount: number;
};

/**
 * Synthesize speech using Chirp 3 HD (Google Cloud Text-to-Speech).
 * `serviceAccountJson` is the raw JSON key string for a GCP service account with TTS access.
 */
export async function synthesizeChirpHd(
  serviceAccountJson: string,
  text: string,
  voiceName = process.env.TTS_VOICE_NAME ?? DEFAULT_VOICE,
): Promise<SynthesizeResult> {
  const normalizedJson = serviceAccountJson.trim();
  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(normalizedJson) as Record<string, unknown>;
  } catch {
    throw new Error(
      "GOOGLE_TTS_SERVICE_ACCOUNT_JSON is not valid JSON. Set it to the full raw service account JSON string, with properly escaped newlines/quotes if stored in an env var.",
    );
  }
  const client = new TextToSpeechClient({ credentials });

  const characterCount = text.length;

  const [response] = await client.synthesizeSpeech({
    input: { text },
    voice: {
      languageCode: "en-US",
      name: voiceName,
    },
    audioConfig: {
      audioEncoding: "MP3",
      speakingRate: 1.0,
    },
  });

  const audio = response.audioContent;
  if (!audio) {
    throw new Error("TTS returned empty audio");
  }

  return {
    audioBuffer: Buffer.from(audio),
    characterCount,
  };
}
