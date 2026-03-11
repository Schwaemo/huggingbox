import { invoke } from '@tauri-apps/api/core';
import type { HFModelDetail, AppSettings, SystemInfo } from '../stores/appStore';

interface CodeGenerationResponse {
  code: string;
  analysis: string;
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
    const fallbackResponse = await invoke<string>('generate_python_code_local', {
      modelId: modelId,
      hfToken: settings.hfToken?.trim() ? settings.hfToken.trim() : null,
    });
    
    // Attempt parsing
    try {
        const parsed = JSON.parse(fallbackResponse) as Partial<CodeGenerationResponse> & { error?: string };
        if (parsed.error) {
            throw new Error(`hf_auto_runner execution failed: ${parsed.error}`);
        }
        
        if (!parsed.code || !parsed.analysis) {
             throw new Error("Invalid output received from hf_auto_runner python generator.");
        }
        
        return {
           code: parsed.code,
           analysis: parsed.analysis
        }
    } catch (parseError) {
         throw new Error(`Failed parsing generated response JSON: ${parseError}`);
    }
    
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

export function buildFallbackAnalysis(model: HFModelDetail, system: SystemInfo): string {
  const modelId = model.modelId || model.id;
  const ramGb = (system.totalRam / (1024 ** 3)).toFixed(1);
  const gpu = system.gpuName ? `${system.gpuName} (${system.gpuVram}GB)` : 'None';

  return `Model ${modelId} could not be successfully parsed by the runner.
Detected hardware: ${ramGb} GB RAM; GPU: ${gpu}. Prefer CUDA when available, otherwise CPU fallback is used.
This is a generic transformers fallback configuration and may not execute successfully natively.`;
}
