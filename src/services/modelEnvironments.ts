import { invoke } from '@tauri-apps/api/core';

export interface ModelEnvironment {
  modelId: string;
  pythonPath: string;
  sizeBytes: number;
}

interface ModelEnvironmentPayload {
  modelId: string;
  pythonPath: string;
  sizeBytes: number;
}

export async function listModelEnvironments(): Promise<ModelEnvironment[]> {
  const rows = await invoke<ModelEnvironmentPayload[]>('list_model_environments');
  return rows.map((row) => ({
    modelId: row.modelId,
    pythonPath: row.pythonPath,
    sizeBytes: row.sizeBytes,
  }));
}

export async function deleteModelEnvironment(modelId: string): Promise<void> {
  await invoke('delete_model_environment', { modelId });
}
