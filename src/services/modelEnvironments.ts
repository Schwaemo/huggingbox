import { invoke } from '@tauri-apps/api/core';

export interface ModelEnvironment {
  modelId: string;
  pythonPath: string;
  sizeBytes: number | null;
}

interface ModelEnvironmentPayload {
  modelId: string;
  pythonPath: string;
  sizeBytes: number | null;
}

export async function listModelEnvironments(
  envStoragePath?: string,
  options?: { includeSizes?: boolean }
): Promise<ModelEnvironment[]> {
  const rows = await invoke<ModelEnvironmentPayload[]>('list_model_environments', {
    envStoragePath: envStoragePath?.trim() ? envStoragePath.trim() : null,
    includeSizes: options?.includeSizes === true,
  });
  return rows.map((row) => ({
    modelId: row.modelId,
    pythonPath: row.pythonPath,
    sizeBytes: row.sizeBytes,
  }));
}

export async function getModelEnvironmentSize(modelId: string, envStoragePath?: string): Promise<number> {
  return invoke<number>('get_model_environment_size', {
    modelId,
    envStoragePath: envStoragePath?.trim() ? envStoragePath.trim() : null,
  });
}

export async function deleteModelEnvironment(modelId: string, envStoragePath?: string): Promise<void> {
  await invoke('delete_model_environment', {
    modelId,
    envStoragePath: envStoragePath?.trim() ? envStoragePath.trim() : null,
  });
}
