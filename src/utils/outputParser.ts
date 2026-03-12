export interface ParsedOutput {
  kind:
    | 'text'
    | 'classification'
    | 'summarization'
    | 'embedding'
    | 'qa'
    | 'ner'
    | 'detection'
    | 'segmentation'
    | 'depth'
    | 'audio_transcript'
    | 'audio_file';
  data: unknown;
}

interface AudioTranscriptChunk {
  timestamp?: [number | null, number | null] | null;
  text?: string;
}

interface AudioTranscriptPayload {
  text: string;
  chunks?: AudioTranscriptChunk[];
}

function normalizePseudoJson(text: string): string {
  return text
    .replace(/\bNone\b/g, 'null')
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false')
    .replace(/'/g, '"');
}

function tryParseStructured(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const candidate = trimmed
    .split('\n')
    .reverse()
    .find((line) => line.trim().startsWith('{') || line.trim().startsWith('['))
    ?? trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    try {
      return JSON.parse(normalizePseudoJson(candidate));
    } catch {
      return null;
    }
  }
}

function extractAudioOutputPath(text: string): string | null {
  const match = text.match(/HB_OUTPUT_AUDIO:(.+)/);
  return match?.[1]?.trim() || null;
}

export function parseExecutionOutput(
  rawOutput: string,
  pipelineTag: string | null | undefined
): ParsedOutput {
  const structured = tryParseStructured(rawOutput);
  const pipeline = (pipelineTag ?? '').toLowerCase();
  const audioPath = extractAudioOutputPath(rawOutput);

  if (
    (pipeline === 'text-classification' ||
      pipeline === 'image-classification' ||
      pipeline === 'audio-classification') &&
    Array.isArray(structured)
  ) {
    return { kind: 'classification', data: structured };
  }
  if (
    pipeline === 'automatic-speech-recognition' &&
    structured &&
    typeof structured === 'object' &&
    typeof (structured as { text?: unknown }).text === 'string'
  ) {
    const payload = structured as AudioTranscriptPayload;
    return { kind: 'audio_transcript', data: payload };
  }
  if ((pipeline === 'text-to-speech' || pipeline === 'text-to-audio') && audioPath) {
    return { kind: 'audio_file', data: audioPath };
  }
  if (pipeline === 'object-detection' && Array.isArray(structured)) {
    return { kind: 'detection', data: structured };
  }
  if (pipeline === 'image-segmentation' && structured) {
    return { kind: 'segmentation', data: structured };
  }
  if (pipeline === 'depth-estimation' && structured) {
    return { kind: 'depth', data: structured };
  }
  if (pipeline === 'summarization' && structured) {
    return { kind: 'summarization', data: structured };
  }
  if (pipeline === 'feature-extraction' && structured) {
    return { kind: 'embedding', data: structured };
  }
  if (pipeline === 'question-answering' && structured) {
    return { kind: 'qa', data: structured };
  }
  if (pipeline === 'token-classification' && Array.isArray(structured)) {
    return { kind: 'ner', data: structured };
  }
  return { kind: 'text', data: rawOutput };
}
