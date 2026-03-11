import { invoke } from '@tauri-apps/api/core';

interface CachedCodeRecord {
  code: string;
}

function hasTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function buildCodeCacheKey(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return toHex(new Uint8Array(hash));
}

export async function readCachedCode(cacheKey: string): Promise<string | null> {
  if (!hasTauriRuntime()) return null;
  const row = await invoke<CachedCodeRecord | null>('get_cached_code', { cacheKey });
  return row?.code ?? null;
}

export async function writeCachedCode(
  cacheKey: string,
  modelId: string,
  code: string
): Promise<void> {
  if (!hasTauriRuntime()) return;
  await invoke('upsert_cached_code', { cacheKey, modelId, code });
}
