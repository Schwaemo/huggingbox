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
    | 'depth';
  data: unknown;
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

export function parseExecutionOutput(
  rawOutput: string,
  pipelineTag: string | null | undefined
): ParsedOutput {
  const structured = tryParseStructured(rawOutput);
  const pipeline = (pipelineTag ?? '').toLowerCase();

  if ((pipeline === 'text-classification' || pipeline === 'image-classification') && Array.isArray(structured)) {
    return { kind: 'classification', data: structured };
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
