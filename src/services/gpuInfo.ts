import { invoke } from '@tauri-apps/api/core';

export interface GpuInfo {
  id: string;
  name: string;
  vramGb: number | null;
  backend: string;
}

export async function listGpus(): Promise<GpuInfo[]> {
  return invoke<GpuInfo[]>('list_gpus');
}
