import { invoke } from '@tauri-apps/api/core';
import type { HFModelDetail, AppSettings, SystemInfo } from '../stores/appStore';

interface CodeGenerationResponse {
  code: string;
  analysis: string;
}

interface RawGenerationResponse extends Partial<CodeGenerationResponse> {
  error?: string;
  errorType?: string;
  traceback?: string;
  stderr?: string;
  debugStderr?: string;
  exitCode?: string;
}

function previewText(raw: string, max = 2200): string {
  const trimmed = raw.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}\n...[truncated ${trimmed.length - max} chars]`;
}

function parseRunnerResponse(raw: string): RawGenerationResponse {
  const candidates: string[] = [];
  const trimmed = raw.trim();
  if (trimmed) {
    candidates.push(trimmed);
    const lines = trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length > 1) {
      candidates.push(lines[lines.length - 1]);
    }
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
    }
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as RawGenerationResponse;
    } catch {
      // try next candidate
    }
  }
  throw new Error(
    `Runner output is not valid JSON. Raw output preview:\n${previewText(raw)}`
  );
}

export function buildCacheIdentity(model: HFModelDetail, system: SystemInfo): string {
  // We use model ID, RAM size, GPU availability, and OS as factors that might affect script output.
  return `${model.modelId || model.id}_${system.totalRam}_gpu:${system.gpuName ? 'yes' : 'no'}_${system.os}`;
}

export async function generateCodeLocally(
  model: HFModelDetail,
  settings: AppSettings,
  _system: SystemInfo
): Promise<CodeGenerationResponse> {
  const modelId = model.modelId || model.id;
  
  if (!modelId) {
    throw new Error('Model ID is required to generate code.');
  }

  // Execute the python auto runner to get JSON code analysis payload
  try {
    const rawResponse = await invoke<string>('generate_python_code_local', {
      modelId: modelId,
      hfToken: settings.hfToken?.trim() ? settings.hfToken.trim() : null,
    });
    
    let parsed: RawGenerationResponse;
    try {
      parsed = parseRunnerResponse(rawResponse);
    } catch (parseError) {
      throw new Error(
        `Failed parsing generated response JSON: ${String(parseError)}`
      );
    }

    if (parsed.debugStderr) {
      console.info('[hf_auto_runner][debugStderr]', parsed.debugStderr);
    }

    if (parsed.error) {
      const details = [
        `hf_auto_runner execution failed: ${parsed.error}`,
        parsed.errorType ? `Type: ${parsed.errorType}` : '',
        parsed.exitCode ? `Exit: ${parsed.exitCode}` : '',
        parsed.stderr ? `Stderr:\n${previewText(parsed.stderr)}` : '',
        parsed.traceback ? `Traceback:\n${previewText(parsed.traceback)}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      throw new Error(details);
    }
        
    if (!parsed.code || !parsed.analysis) {
      throw new Error(
        `Invalid output received from hf_auto_runner python generator.\nParsed payload preview:\n${previewText(
          JSON.stringify(parsed, null, 2)
        )}`
      );
    }
        
    return {
      code: parsed.code,
      analysis: parsed.analysis
    };
    
  } catch (error) {
     console.error("Local code generation failed:", error);
     throw new Error(`Could not generate local script: ${error}`);
  }
}

export function buildFallbackCode(model: HFModelDetail): string {
  const modelId = model.modelId || model.id;

  return `# HuggingBox fallback template (transformers)
import torch
from transformers import pipeline

print(f"Loading generic fallback pipeline for ${modelId}...")
try:
    pipe = pipeline(model="${modelId}", device=0 if torch.cuda.is_available() else -1)
    print(f"Pipeline created.")
    print("Due to lack of metadata, automatic inference cannot deduce input type.")
    print("Pass appropriate inputs directly.")
except Exception as e:
    print(f"Failed to initialize generic pipeline: {e}")
    raise
`;
}

function summarizeError(errorText: string): string {
  const compact = errorText.replace(/\r/g, '').trim();
  if (!compact) return 'No additional runner diagnostics were captured.';

  const lines = compact
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const picked: string[] = [];
  for (const line of lines) {
    if (
      /hf_auto_runner execution failed/i.test(line) ||
      /^Type:/i.test(line) ||
      /^Exit:/i.test(line) ||
      /^Failed to fetch model info/i.test(line) ||
      /^Runner output is not valid JSON/i.test(line) ||
      /^Invalid output received/i.test(line) ||
      /Unauthorized|401|403|gated|Repository Not Found|not found/i.test(line)
    ) {
      picked.push(line);
    }
    if (picked.length >= 6) break;
  }

  const source = picked.length > 0 ? picked : lines.slice(0, 6);
  const joined = source.join('\n');
  return joined.length > 1200 ? `${joined.slice(0, 1200)}\n...[truncated]` : joined;
}

export function buildFallbackAnalysis(
  model: HFModelDetail,
  system: SystemInfo,
  errorText?: string
): string {
  const modelId = model.modelId || model.id;
  const ramGb = (system.totalRam / (1024 ** 3)).toFixed(1);
  const gpu = system.gpuName ? `${system.gpuName} (${system.gpuVram}GB)` : 'None';
  const diagnostics = summarizeError(errorText ?? '');

  return `Model ${modelId} could not be successfully parsed by the runner.
Detected hardware: ${ramGb} GB RAM; GPU: ${gpu}. Prefer CUDA when available, otherwise CPU fallback is used.
This is a generic transformers fallback configuration and may not execute successfully natively.

Runner diagnostics:
${diagnostics}`;
}
