const KEY_PREFIX = 'huggingbox:model-env-preference:';

function keyFor(modelId: string): string {
  return `${KEY_PREFIX}${modelId}`;
}

export function getPreferredEnvModelId(modelId: string): string | null {
  try {
    const raw = localStorage.getItem(keyFor(modelId));
    const value = raw?.trim();
    return value ? value : null;
  } catch {
    return null;
  }
}

export function setPreferredEnvModelId(modelId: string, envModelId: string): void {
  try {
    localStorage.setItem(keyFor(modelId), envModelId);
  } catch {
    // ignore storage failures
  }
}

export function clearPreferredEnvModelId(modelId: string): void {
  try {
    localStorage.removeItem(keyFor(modelId));
  } catch {
    // ignore storage failures
  }
}

