import { invoke } from '@tauri-apps/api/core';
import type { AppSettings } from '../stores/appStore';

function hasTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function loadSettingsFromFile(): Promise<Partial<AppSettings> | null> {
  if (!hasTauriRuntime()) return null;
  const result = await invoke<Partial<AppSettings> | null>('load_app_settings');
  return result;
}

export async function saveSettingsToFile(settings: AppSettings): Promise<void> {
  if (!hasTauriRuntime()) return;
  await invoke('save_app_settings', { settings });
}
