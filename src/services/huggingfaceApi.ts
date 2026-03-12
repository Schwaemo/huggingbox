import type { HFModel, HFModelDetail } from '../stores/appStore';

const HF_API_BASE = 'https://huggingface.co/api';
const PAGE_SIZE = 24;

export interface FetchModelsParams {
  search?: string;
  pipeline_tag?: string;
  page?: number;
  limit?: number;
}

export async function fetchModels(
  params: FetchModelsParams = {},
  hfToken?: string,
  signal?: AbortSignal
): Promise<HFModel[]> {
  const { search, pipeline_tag, page = 0, limit = PAGE_SIZE } = params;

  const query = new URLSearchParams();
  if (search) query.set('search', search);
  if (pipeline_tag) query.set('pipeline_tag', pipeline_tag);
  query.set('limit', String(limit));
  query.set('offset', String(page * limit));
  query.set('sort', 'downloads');
  query.set('direction', '-1');
  // Request full metadata
  query.set('full', 'true');
  query.set('config', 'true');

  const headers: HeadersInit = {};
  if (hfToken) headers['Authorization'] = `Bearer ${hfToken}`;

  const res = await fetch(`${HF_API_BASE}/models?${query}`, { headers, signal });
  if (!res.ok) throw new Error(`HF API error: ${res.status}`);

  const data: HFModel[] = await res.json();
  return data;
}

export async function fetchModelDetail(
  modelId: string,
  hfToken?: string
): Promise<HFModelDetail> {
  const headers: HeadersInit = {};
  if (hfToken) headers['Authorization'] = `Bearer ${hfToken}`;

  const query = new URLSearchParams();
  query.set('blobs', 'true');
  query.set('full', 'true');
  const res = await fetch(`${HF_API_BASE}/models/${modelId}?${query}`, { headers });
  if (!res.ok) throw new Error(`HF API error: ${res.status}`);

  const data: HFModelDetail = await res.json();
  return data;
}

// Estimate total model size in bytes from siblings list
export function estimateModelSize(model: HFModel): number {
  const fromSiblings = (model.siblings ?? []).reduce((acc, f) => {
    const direct = typeof f.size === 'number' ? f.size : 0;
    const lfs = typeof f.lfs?.size === 'number' ? f.lfs.size : 0;
    return acc + (direct > 0 ? direct : lfs > 0 ? lfs : 0);
  }, 0);
  if (fromSiblings > 0) return fromSiblings;

  const safetensorsTotal = (model as HFModelDetail).safetensors?.total;
  if (typeof safetensorsTotal === 'number' && safetensorsTotal > 0) {
    return safetensorsTotal;
  }

  const idLike = (model.modelId || model.id || '').toLowerCase();
  const match = idLike.match(/(\d+(?:\.\d+)?)\s*([bm])/i);
  if (!match) return 0;
  const count = Number(match[1]);
  if (!Number.isFinite(count) || count <= 0) return 0;
  const scale = match[2].toLowerCase() === 'b' ? 1_000_000_000 : 1_000_000;
  const params = count * scale;
  // Conservative fp16-style estimate: ~2 bytes/parameter.
  return Math.round(params * 2);
}

// Format bytes to human-readable string
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 ** 2);
  if (mb >= 1) return `${mb.toFixed(0)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

// Format download count
export function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

// Map pipeline_tag to category for badge colour
export type ModelCategory = 'text' | 'vision' | 'audio' | 'generation' | 'multimodal' | 'other';

export function getModelCategory(pipeline_tag: string | null | undefined): ModelCategory {
  if (!pipeline_tag) return 'other';
  const tag = pipeline_tag.toLowerCase();
  if (
    tag.includes('text-generation') ||
    tag.includes('text-classification') ||
    tag.includes('summarization') ||
    tag.includes('translation') ||
    tag.includes('question-answering') ||
    tag.includes('fill-mask') ||
    tag.includes('token-classification') ||
    tag.includes('feature-extraction') ||
    tag.includes('sentence-similarity')
  ) return 'text';
  if (
    tag.includes('image-classification') ||
    tag.includes('object-detection') ||
    tag.includes('image-segmentation') ||
    tag.includes('depth-estimation') ||
    tag.includes('image-to-image')
  ) return 'vision';
  if (
    tag.includes('automatic-speech') ||
    tag.includes('text-to-speech') ||
    tag.includes('audio')
  ) return 'audio';
  if (
    tag.includes('text-to-image') ||
    tag.includes('unconditional')
  ) return 'generation';
  if (
    tag.includes('visual') ||
    tag.includes('image-to-text') ||
    tag.includes('document')
  ) return 'multimodal';
  return 'other';
}

export const CATEGORY_BADGE_COLORS: Record<ModelCategory, string> = {
  text: '#2563EB',
  vision: '#7C3AED',
  audio: '#059669',
  generation: '#DB2777',
  multimodal: '#D97706',
  other: '#6B7280',
};

// Pipeline filter options for the Browse view dropdown
export const PIPELINE_OPTIONS = [
  { label: 'All Pipelines', value: '' },
  { label: 'Text Generation', value: 'text-generation' },
  { label: 'Text Classification', value: 'text-classification' },
  { label: 'Summarization', value: 'summarization' },
  { label: 'Question Answering', value: 'question-answering' },
  { label: 'Image Classification', value: 'image-classification' },
  { label: 'Object Detection', value: 'object-detection' },
  { label: 'Image Segmentation', value: 'image-segmentation' },
  { label: 'Speech Recognition', value: 'automatic-speech-recognition' },
  { label: 'Text to Speech', value: 'text-to-speech' },
  { label: 'Text to Image', value: 'text-to-image' },
  { label: 'Visual QA', value: 'visual-question-answering' },
  { label: 'Feature Extraction', value: 'feature-extraction' },
];

export const SIZE_OPTIONS = [
  { label: 'All Sizes', value: '' },
  { label: 'Small (< 1 GB)', value: 'small' },
  { label: 'Medium (1–5 GB)', value: 'medium' },
  { label: 'Large (5–20 GB)', value: 'large' },
  { label: 'Very Large (> 20 GB)', value: 'xlarge' },
];

const SIZE_RANGES: Record<string, [number, number]> = {
  small:  [0,           1 * 1024 ** 3],
  medium: [1 * 1024 ** 3, 5 * 1024 ** 3],
  large:  [5 * 1024 ** 3, 20 * 1024 ** 3],
  xlarge: [20 * 1024 ** 3, Infinity],
};

export function modelMatchesSizeFilter(model: HFModel, sizeFilter: string): boolean {
  if (!sizeFilter) return true;
  const range = SIZE_RANGES[sizeFilter];
  if (!range) return true;
  const size = estimateModelSize(model);
  if (size === 0) return true; // unknown size — show it
  return size >= range[0] && size < range[1];
}
