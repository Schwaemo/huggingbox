import type { AppSettings, HFModelDetail, SystemInfo } from '../stores/appStore';

const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const CLAUDE_ENDPOINT = 'https://api.anthropic.com/v1/messages';

const SYSTEM_PROMPT = `You are a code generator for HuggingBox, a desktop app that runs Hugging Face models locally.
Generate a concise compatibility analysis and a complete Python script.

RULES:
1. The script must be fully self-contained.
2. Include educational comments for major blocks.
3. Handle common errors gracefully.
4. Use streaming output for text generation where possible.
5. Print text output to stdout.
6. Respect hardware constraints from the context.
7. Never include pip install commands.
8. Never use input() calls.
9. Use the exact model ID provided.
10. Output valid JSON with exactly two keys: "analysis" and "code".
11. "analysis" must be prose that covers dependencies, hardware requirements, and compatibility risks.
12. "code" must be Python code only (no markdown fences).
11. For transformers pipeline/from_pretrained calls, include a safe retry path: if a ValueError says the repo requires custom code, retry with trust_remote_code=True (important for Windows where interactive trust prompt can fail).`;

interface ClaudeTextBlock {
  type: 'text';
  text: string;
}

interface ClaudeResponse {
  content: ClaudeTextBlock[];
}

export interface ClaudeGenerationResult {
  analysis: string;
  code: string;
}

function listFormats(model: HFModelDetail): string[] {
  const siblings = model.siblings ?? [];
  const has = (ext: string) => siblings.some((f) => f.rfilename.toLowerCase().endsWith(ext));

  const formats: string[] = [];
  if (has('.gguf')) formats.push('gguf');
  if (has('.safetensors')) formats.push('safetensors');
  if (has('.bin')) formats.push('bin');
  if (has('.onnx')) formats.push('onnx');
  return formats;
}

function getGpuType(system: SystemInfo): 'none' | 'cuda' | 'metal' {
  const name = (system.gpuName ?? '').toLowerCase();
  if (!name) return 'none';
  if (name.includes('nvidia') || name.includes('cuda')) return 'cuda';
  if (name.includes('apple') || name.includes('metal')) return 'metal';
  return 'none';
}

function getRamTier(totalRamBytes: number): 'low' | 'medium' | 'high' | 'very_high' {
  const gb = totalRamBytes / 1024 ** 3;
  if (gb < 8) return 'low';
  if (gb < 16) return 'medium';
  if (gb < 32) return 'high';
  return 'very_high';
}

function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:python)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function pythonString(value: string): string {
  return JSON.stringify(value);
}

function buildTransformersTemplate(modelId: string, pipelineTag: string | null): string {
  const pipeline = pipelineTag ?? 'text-generation';
  if (pipeline === 'image-classification') {
    return `# HuggingBox fallback template (image classification)
import io
import json
import base64
from PIL import Image
from transformers import pipeline

INPUT_DATA = ""  # data URL or local path

def load_image(value: str):
    if value.startswith("data:image"):
        encoded = value.split(",", 1)[1]
        return Image.open(io.BytesIO(base64.b64decode(encoded))).convert("RGB")
    return Image.open(value).convert("RGB")

def main():
    clf = pipeline("image-classification", model=${pythonString(modelId)})
    img = load_image(INPUT_DATA)
    result = clf(img)
    print(json.dumps(result))

if __name__ == "__main__":
    main()
`;
  }
  if (pipeline === 'object-detection') {
    return `# HuggingBox fallback template (object detection)
import io
import json
import base64
from PIL import Image
from transformers import pipeline

INPUT_DATA = ""  # data URL or local path

def load_image(value: str):
    if value.startswith("data:image"):
        encoded = value.split(",", 1)[1]
        return Image.open(io.BytesIO(base64.b64decode(encoded))).convert("RGB")
    return Image.open(value).convert("RGB")

def main():
    det = pipeline("object-detection", model=${pythonString(modelId)})
    img = load_image(INPUT_DATA)
    result = det(img)
    print(json.dumps(result))

if __name__ == "__main__":
    main()
`;
  }
  if (pipeline === 'image-segmentation') {
    return `# HuggingBox fallback template (image segmentation)
import io
import json
import base64
from PIL import Image
from transformers import pipeline

INPUT_DATA = ""  # data URL or local path

def load_image(value: str):
    if value.startswith("data:image"):
        encoded = value.split(",", 1)[1]
        return Image.open(io.BytesIO(base64.b64decode(encoded))).convert("RGB")
    return Image.open(value).convert("RGB")

def main():
    seg = pipeline("image-segmentation", model=${pythonString(modelId)})
    img = load_image(INPUT_DATA)
    result = seg(img)
    # masks are large; return label/score summary
    summary = [{"label": x.get("label"), "score": x.get("score")} for x in result]
    print(json.dumps(summary))

if __name__ == "__main__":
    main()
`;
  }
  if (pipeline === 'depth-estimation') {
    return `# HuggingBox fallback template (depth estimation)
import io
import json
import base64
from PIL import Image
from transformers import pipeline

INPUT_DATA = ""  # data URL or local path

def load_image(value: str):
    if value.startswith("data:image"):
        encoded = value.split(",", 1)[1]
        return Image.open(io.BytesIO(base64.b64decode(encoded))).convert("RGB")
    return Image.open(value).convert("RGB")

def main():
    depth = pipeline("depth-estimation", model=${pythonString(modelId)})
    img = load_image(INPUT_DATA)
    result = depth(img)
    # return metadata only to keep stdout light
    out = {"type": "depth-estimation", "keys": list(result.keys())}
    print(json.dumps(out))

if __name__ == "__main__":
    main()
`;
  }
  if (pipeline === 'text-classification') {
    return `# HuggingBox fallback template (text classification)
import json
from transformers import pipeline

INPUT_DATA = "I love this product."

def main():
    clf = pipeline("text-classification", model=${pythonString(modelId)})
    result = clf(INPUT_DATA)
    print(json.dumps(result))

if __name__ == "__main__":
    main()
`;
  }
  if (pipeline === 'summarization') {
    return `# HuggingBox fallback template (summarization)
import json
from transformers import pipeline

INPUT_DATA = "Paste a long article here."

def main():
    summarizer = pipeline("summarization", model=${pythonString(modelId)})
    result = summarizer(INPUT_DATA, max_new_tokens=120, do_sample=False)
    print(json.dumps(result))

if __name__ == "__main__":
    main()
`;
  }
  if (pipeline === 'feature-extraction') {
    return `# HuggingBox fallback template (embeddings)
import json
from transformers import pipeline

INPUT_DATA = "Embed this text."

def main():
    embedder = pipeline("feature-extraction", model=${pythonString(modelId)})
    vector = embedder(INPUT_DATA)
    print(json.dumps(vector))

if __name__ == "__main__":
    main()
`;
  }
  if (pipeline === 'question-answering') {
    return `# HuggingBox fallback template (question answering)
import json
from transformers import pipeline

INPUT_DATA = {"question": "What is HuggingBox?", "context": "HuggingBox is a desktop app for running HF models locally."}

def main():
    qa = pipeline("question-answering", model=${pythonString(modelId)})
    result = qa(question=INPUT_DATA.get("question", ""), context=INPUT_DATA.get("context", ""))
    print(json.dumps(result))

if __name__ == "__main__":
    main()
`;
  }
  if (pipeline === 'token-classification') {
    return `# HuggingBox fallback template (NER)
import json
from transformers import pipeline

INPUT_DATA = "Barack Obama was born in Hawaii."

def main():
    ner = pipeline("token-classification", model=${pythonString(modelId)}, aggregation_strategy="simple")
    result = ner(INPUT_DATA)
    print(json.dumps(result))

if __name__ == "__main__":
    main()
`;
  }
  return `# HuggingBox fallback template (transformers)
# Generated because Claude API was unavailable.
import torch
from transformers import pipeline

# The app replaces this value before execution.
INPUT_DATA = "Hello from HuggingBox"

def select_device():
    if torch.cuda.is_available():
        return 0
    return -1

def create_pipeline_with_remote_code_fallback(task: str, model: str, device: int):
    try:
        return pipeline(task=task, model=model, device=device)
    except ValueError as err:
        # Some repos require custom code; on Windows, interactive trust prompt can fail.
        if "trust_remote_code=True" in str(err):
            return pipeline(task=task, model=model, device=device, trust_remote_code=True)
        raise

def main():
    pipe = create_pipeline_with_remote_code_fallback(
        task=${pythonString(pipeline)},
        model=${pythonString(modelId)},
        device=select_device(),
    )

    if ${pythonString(pipeline)} == "text-generation":
        result = pipe(INPUT_DATA, max_new_tokens=256, do_sample=False)
    else:
        result = pipe(INPUT_DATA)
    print(result)

if __name__ == "__main__":
    main()
`;
}

function buildGgufTemplate(modelId: string): string {
  return `# HuggingBox fallback template (GGUF via llama-cpp-python)
# Generated because Claude API was unavailable.
from llama_cpp import Llama

# The app replaces this value before execution.
INPUT_DATA = "Hello from HuggingBox"

def main():
    # Uses Hugging Face repo loader built into llama-cpp-python.
    llm = Llama.from_pretrained(
        repo_id=${pythonString(modelId)},
        filename="*.gguf",
        n_ctx=4096,
        verbose=False,
    )

    # Stream output token-by-token for live output in HuggingBox.
    for chunk in llm.create_completion(INPUT_DATA, max_tokens=256, stream=True):
        token = chunk["choices"][0]["text"]
        if token:
            print(token, end="", flush=True)
    print()

if __name__ == "__main__":
    main()
`;
}

export function buildFallbackCode(model: HFModelDetail): string {
  const formats = listFormats(model);
  if (formats.includes('gguf')) {
    return buildGgufTemplate(model.modelId ?? model.id);
  }
  return buildTransformersTemplate(model.modelId ?? model.id, model.pipeline_tag);
}

export function buildCacheIdentity(model: HFModelDetail, system: SystemInfo): string {
  const modelId = model.modelId ?? model.id;
  const formats = listFormats(model).sort().join(',');
  return [
    modelId,
    model.pipeline_tag ?? 'unknown',
    formats || 'unknown',
    getGpuType(system),
    getRamTier(system.totalRam),
  ].join('|');
}

export function buildFallbackAnalysis(model: HFModelDetail, system: SystemInfo): string {
  const modelId = model.modelId ?? model.id;
  const formats = listFormats(model);
  const pipeline = model.pipeline_tag ?? 'unknown';
  const ramGb = (system.totalRam / 1024 ** 3).toFixed(1);
  const gpu = system.gpuName
    ? `${system.gpuName}${system.gpuVram ? ` (${system.gpuVram} GB VRAM)` : ''}`
    : 'No GPU detected';

  return [
    `Model ${modelId} (${pipeline}) will run with a local Python script.`,
    `Likely dependencies include transformers/torch${formats.includes('gguf') ? ', plus llama-cpp-python for GGUF' : ''}.`,
    `Detected hardware: ${ramGb} GB RAM; GPU: ${gpu}. Prefer CUDA when available, otherwise CPU fallback is used.`,
    'Compatibility note: models with custom remote code may require trust_remote_code=True and version-matched transformers.',
  ].join(' ');
}

function parseClaudeGeneration(text: string): ClaudeGenerationResult {
  const trimmed = text.trim();
  const candidates = [trimmed];

  const jsonFence = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (jsonFence?.[1]) candidates.push(jsonFence[1].trim());
  const anyFence = trimmed.match(/```\s*([\s\S]*?)```/);
  if (anyFence?.[1]) candidates.push(anyFence[1].trim());

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Partial<ClaudeGenerationResult>;
      const analysis = (parsed.analysis ?? '').trim();
      const code = stripCodeFences((parsed.code ?? '').trim());
      if (analysis && code) {
        return { analysis, code };
      }
    } catch {
      // try next candidate
    }
  }

  throw new Error('Claude response did not include valid analysis/code JSON.');
}

export async function generateCodeWithClaude(
  model: HFModelDetail,
  settings: AppSettings,
  system: SystemInfo
): Promise<string> {
  const generated = await generateCodeWithClaudeStructured(model, settings, system);
  return generated.code;
}

export async function generateCodeWithClaudeStructured(
  model: HFModelDetail,
  settings: AppSettings,
  system: SystemInfo
): Promise<ClaudeGenerationResult> {
  if (!settings.claudeApiKey.trim()) {
    throw new Error('Anthropic API key is missing. Add it in Settings.');
  }

  const modelId = model.modelId ?? model.id;
  const formatList = listFormats(model);
  const formats = formatList.join(', ') || 'unknown';
  const readme = (model.readme ?? model.description ?? '').slice(0, 2000);
  const gpuLabel = system.gpuName
    ? `${system.gpuName}${system.gpuVram ? ` (${system.gpuVram} GB VRAM)` : ''}`
    : 'No GPU detected';

  const formatDirective = formatList.includes('gguf')
    ? 'This model includes GGUF files. Use llama_cpp.Llama.from_pretrained with filename="*.gguf". Do not use transformers for GGUF execution.'
    : 'Use transformers pipeline APIs for this model format.';

  const hardwareDirective = system.gpuName
    ? 'Prefer GPU execution. Use float16 where possible and include safe CPU fallback if CUDA/Metal is unavailable.'
    : 'No GPU detected. Default to CPU-safe settings and float32 unless the model format requires something else.';
  const visionDirective = (model.pipeline_tag ?? '').includes('image') || (model.pipeline_tag ?? '').includes('object')
    ? 'If this is a vision pipeline, support INPUT_DATA as either a local image path or data URL and load via PIL.'
    : 'If this is a text pipeline, keep INPUT_DATA as text/JSON depending on task.';

  const userPrompt = `Generate a Python script to run the following model locally.

Model ID: ${modelId}
Pipeline type: ${model.pipeline_tag ?? 'unknown'}
Available file formats: ${formats}
Model card excerpt:
---
${readme}
---

User hardware:
- RAM: ${(system.totalRam / 1024 ** 3).toFixed(1)} GB total, ${(system.availableRam / 1024 ** 3).toFixed(1)} GB available
- GPU: ${gpuLabel}
- OS: ${system.os || 'Unknown'}

Installed packages: transformers, torch, llama-cpp-python, huggingface_hub, accelerate, sentencepiece, safetensors

Output directory for files: ./output
User input placeholder: The script should accept input via INPUT_DATA at top.

Format directive: ${formatDirective}
Hardware directive: ${hardwareDirective}
Input directive: ${visionDirective}
Compatibility directive: If model loading raises a ValueError requesting trust_remote_code=True, retry with trust_remote_code=True automatically.

Return format (strict JSON object):
{
  "analysis": "2-4 short paragraphs about dependencies, hardware requirements, and compatibility risks",
  "code": "<python script>"
}`;

  const res = await fetch(CLAUDE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.claudeApiKey.trim(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Claude API error (${res.status}): ${body || res.statusText}`);
  }

  const json = (await res.json()) as ClaudeResponse;
  const text = json.content?.map((c) => c.text).join('\n').trim();
  if (!text) {
    throw new Error('Claude returned an empty response.');
  }
  return parseClaudeGeneration(text);
}
