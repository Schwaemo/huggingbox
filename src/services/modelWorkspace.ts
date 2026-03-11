import { invoke } from '@tauri-apps/api/core';

export interface ModelWorkspaceEntry {
  name: string;
  relativePath: string;
  isDir: boolean;
  sizeBytes: number | null;
}

interface ModelWorkspaceEntryPayload {
  name: string;
  relativePath: string;
  isDir: boolean;
  sizeBytes?: number | null;
}

export async function listModelWorkspaceEntries(
  modelId: string,
  storagePath: string,
  directory?: string
): Promise<ModelWorkspaceEntry[]> {
  const rows = await invoke<ModelWorkspaceEntryPayload[]>('list_model_workspace_entries', {
    modelId,
    storagePath,
    directory: directory?.trim() ? directory.trim() : null,
  });
  return rows.map((row) => ({
    name: row.name,
    relativePath: row.relativePath,
    isDir: row.isDir,
    sizeBytes: row.sizeBytes ?? null,
  }));
}

export async function readModelWorkspaceFile(
  modelId: string,
  storagePath: string,
  relativePath: string
): Promise<string> {
  return invoke<string>('read_model_workspace_file', {
    modelId,
    storagePath,
    relativePath,
  });
}

export async function writeModelWorkspaceFile(
  modelId: string,
  storagePath: string,
  relativePath: string,
  content: string
): Promise<void> {
  await invoke('write_model_workspace_file', {
    modelId,
    storagePath,
    relativePath,
    content,
  });
}

export async function createModelWorkspaceFile(
  modelId: string,
  storagePath: string,
  relativePath: string
): Promise<void> {
  await invoke('create_model_workspace_file', {
    modelId,
    storagePath,
    relativePath,
  });
}

export async function createModelWorkspaceDirectory(
  modelId: string,
  storagePath: string,
  relativePath: string
): Promise<void> {
  await invoke('create_model_workspace_directory', {
    modelId,
    storagePath,
    relativePath,
  });
}

