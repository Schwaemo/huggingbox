import { useEffect, useRef, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../stores/appStore';
import { listDownloadedModels } from '../services/modelStorage';

interface ModelDependencyProbeResult {
  missingPackages: string[];
  requiredPackages?: string[];
  compatibilityError?: string | null;
}

let executionListenerUsers = 0;
let executionListenersCleanup: (() => void) | null = null;
let executionListenersInitPromise: Promise<void> | null = null;
let executionTimer: ReturnType<typeof setInterval> | null = null;

function timestamp(): string {
  return new Date().toLocaleTimeString();
}

function appendLog(text: string): void {
  useAppStore
    .getState()
    .appendExecutionOutput(`[HuggingBox ${timestamp()}] ${text.endsWith('\n') ? text : `${text}\n`}`);
}

function normalizeDependencyName(raw: string): string {
  const token = raw.trim().replace(/^['"`]+|['"`]+$/g, '');
  const lower = token.toLowerCase();
  if (!lower) return '';
  if (lower === 'pil') return 'pillow';
  if (lower === 'sklearn') return 'scikit-learn';
  if (lower === 'cv2') return 'opencv-python';
  return lower;
}

function uniqueDependencies(items: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const normalized = normalizeDependencyName(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function hasVersionSpecifier(requirement: string): boolean {
  return /[<>=!~]/.test(requirement);
}

function modelRunOnceKey(modelId: string): string {
  return `huggingbox:model-run-once:${modelId}`;
}

function hasModelRunOnce(modelId: string): boolean {
  try {
    return localStorage.getItem(modelRunOnceKey(modelId)) === '1';
  } catch {
    return false;
  }
}

function markModelRunOnce(modelId: string): void {
  try {
    localStorage.setItem(modelRunOnceKey(modelId), '1');
  } catch {
    // ignore storage failures
  }
}

async function ensureExecutionListenersRegistered(): Promise<void> {
  if (executionListenersCleanup) return;
  if (executionListenersInitPromise) {
    await executionListenersInitPromise;
    return;
  }

  executionListenersInitPromise = (async () => {
    const unlistens: Array<() => void> = [];

    const u1 = await listen<{ text: string }>('execution-stdout', (e) => {
      useAppStore.getState().appendExecutionOutput(e.payload.text);
    });

    const u2 = await listen<{ text: string }>('execution-stderr', (e) => {
      useAppStore.getState().appendStderrOutput(e.payload.text);
    });

    const u3 = await listen<{ exit_code: number }>('execution-done', (e) => {
      const state =
        e.payload.exit_code === 0
          ? 'completed'
          : e.payload.exit_code === -2
            ? 'cancelled'
            : 'error';
      if (executionTimer) {
        clearInterval(executionTimer);
        executionTimer = null;
      }
      useAppStore.getState().setExecutionState(state);
      appendLog(`Execution finished with exit code ${e.payload.exit_code}.`);
    });

    const u4 = await listen<{ text: string }>('install-progress', (e) => {
      useAppStore.getState().appendExecutionOutput(e.payload.text);
    });

    const u5 = await listen<{ text: string }>('download-progress', (e) => {
      useAppStore.getState().appendExecutionOutput(e.payload.text);
    });

    const u6 = await listen<{
      percent: number;
      downloaded_bytes: number;
      total_bytes: number;
      speed_bps: number;
      eta_seconds: number | null;
      phase: string;
      files_done: number;
      files_total: number;
      filename?: string;
    }>('download-stats', (e) => {
      useAppStore.getState().setDownloadStats({
        percent: e.payload.percent,
        downloadedBytes: e.payload.downloaded_bytes,
        totalBytes: e.payload.total_bytes,
        speedBps: e.payload.speed_bps,
        etaSeconds: e.payload.eta_seconds,
        phase: e.payload.phase,
        filesDone: e.payload.files_done,
        filesTotal: e.payload.files_total,
        filename: e.payload.filename,
      });
    });

    unlistens.push(u1, u2, u3, u4, u5, u6);
    executionListenersCleanup = () => {
      for (const fn of unlistens) fn();
      executionListenersCleanup = null;
      executionListenersInitPromise = null;
    };
  })();

  await executionListenersInitPromise;
}

/**
 * Manages Python code execution via Tauri commands.
 * - Registers global listeners once
 * - Provides runCode() which can install dependencies for first-run only
 * - Provides cancelExecution()
 */
export function useExecution() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    executionListenerUsers += 1;

    void ensureExecutionListenersRegistered().catch(() => {
      if (!cancelled) {
        appendLog('Warning: failed to register execution listeners.');
      }
    });

    return () => {
      cancelled = true;
      executionListenerUsers = Math.max(0, executionListenerUsers - 1);
      if (executionListenerUsers === 0 && executionListenersCleanup) {
        executionListenersCleanup();
      }
    };
  }, []);

  function startTimer() {
    if (executionTimer) {
      timerRef.current = executionTimer;
      return;
    }
    const start = Date.now();
    useAppStore.getState().setExecutionStartTime(start);
    executionTimer = setInterval(() => {
      useAppStore.getState().setExecutionElapsed(Date.now() - start);
    }, 100);
    timerRef.current = executionTimer;
  }

  function stopTimer() {
    if (executionTimer) {
      clearInterval(executionTimer);
      executionTimer = null;
    }
    if (timerRef.current) {
      timerRef.current = null;
    }
  }

  const runCode = useCallback(async (
    options?: {
      modelId?: string;
      storagePath?: string;
      hfToken?: string;
      pipelineTag?: string | null;
      preferredDevice?: 'auto' | 'cpu' | 'cuda';
      selectedGpuId?: string | null;
      userInput?: string;
      envStoragePath?: string;
    }
  ) => {
    const store = useAppStore.getState();
    store.clearExecutionOutput();
    store.clearStderrOutput();
    store.setExecutionError(null);
    store.setDownloadStats(null);
    store.setExecutionState('running');
    startTimer();

    const modelId = options?.modelId?.trim() || '';
    if (modelId) {
      store.setActiveExecutionModelId(modelId);
    }

    const hasRunBefore = modelId ? hasModelRunOnce(modelId) : false;
    const allowAutoInstall = !hasRunBefore;
    if (modelId) {
      markModelRunOnce(modelId);
    }

    appendLog(`Run requested${modelId ? ` for ${modelId}` : ''}.`);
    appendLog(
      allowAutoInstall
        ? 'Auto dependency installation is enabled for this first run.'
        : 'Auto dependency installation is disabled for this model (manual environment mode).'
    );

    if (options?.modelId && options?.storagePath) {
      try {
        appendLog(`Checking download readiness in ${options.storagePath}`);
        const missingDownloadDeps = await invoke<string[]>('check_packages', {
          packages: ['huggingface_hub', 'hf_transfer'],
          modelId: options.modelId,
        });

        if (missingDownloadDeps.length > 0 && !allowAutoInstall) {
          stopTimer();
          store.setExecutionState('error');
          store.setExecutionError(
            `Download dependencies missing (${missingDownloadDeps.join(', ')}). Auto installs are disabled after first run for this model. Install manually from the terminal panel.`
          );
          store.setDownloadStats(null);
          appendLog(`Missing download dependencies with auto-install disabled: ${missingDownloadDeps.join(', ')}`);
          return;
        }

        if (missingDownloadDeps.length > 0) {
          const approveDeps = window.confirm(
            `Model downloads require ${missingDownloadDeps.join(', ')}.\n\nInstall now?`
          );
          if (!approveDeps) {
            store.setExecutionState('idle');
            store.setExecutionError('Execution cancelled because download dependency installation was declined.');
            store.setDownloadStats(null);
            return;
          }
          store.setExecutionState('installing');
          appendLog(`Installing download dependencies: ${missingDownloadDeps.join(', ')}`);
          await invoke('install_packages', { packages: missingDownloadDeps, modelId: options.modelId });
          appendLog('Download dependency installation complete.');
        }

        const downloaded = await invoke<boolean>('is_model_downloaded', {
          modelId: options.modelId,
          storagePath: options.storagePath,
        });

        if (!downloaded) {
          const shouldDownload = window.confirm(
            `Model files are not downloaded yet.\n\nDownload now to:\n${options.storagePath}\n\nYou can pause by clicking Stop and resume later.`
          );
          if (!shouldDownload) {
            store.setExecutionState('idle');
            store.setExecutionError('Execution cancelled because model files were not downloaded.');
            store.setDownloadStats(null);
            return;
          }

          store.setExecutionState('downloading');
          appendLog(`Starting model download for ${options.modelId}`);
          await invoke('download_model', {
            modelId: options.modelId,
            storagePath: options.storagePath,
            hfToken: options.hfToken || null,
          });
          const refreshed = await listDownloadedModels(options.storagePath);
          store.setDownloadedModels(refreshed);
          appendLog('Download stage complete.');
          store.setDownloadStats({
            percent: 100,
            downloadedBytes: 0,
            totalBytes: 0,
            speedBps: 0,
            etaSeconds: 0,
            phase: 'complete',
            filesDone: 0,
            filesTotal: 0,
          });
        }
      } catch (err) {
        stopTimer();
        store.setExecutionState('error');
        store.setExecutionError(String(err));
        store.setDownloadStats(null);
        appendLog(`Preparation failed: ${String(err)}`);
        return;
      }
    }

    const packages: string[] = [];
    let requiredFromProbe: string[] = [];
    let compatibilityWarning: string | null = null;

    if (options?.modelId) {
      try {
        appendLog('Running dependency compatibility probe.');
        const probe = await invoke<ModelDependencyProbeResult>('probe_model_dependencies', {
          modelId: options.modelId,
          hfToken: options?.hfToken ?? null,
        });

        const missingFromProbe = uniqueDependencies(probe.missingPackages ?? []);
        if (missingFromProbe.length > 0) {
          packages.push(...missingFromProbe);
          appendLog(`Model probe found missing imports: ${missingFromProbe.join(', ')}`);
        }

        requiredFromProbe = uniqueDependencies(probe.requiredPackages ?? []);
        if (requiredFromProbe.length > 0) {
          appendLog(`Model-declared requirements: ${requiredFromProbe.join(', ')}`);
        }

        if (probe.compatibilityError) {
          compatibilityWarning = probe.compatibilityError;
          appendLog(`Compatibility warning: ${probe.compatibilityError}`);
        }
      } catch (err) {
        appendLog(`Dependency probe failed (continuing): ${String(err)}`);
      }
    }

    if (compatibilityWarning && requiredFromProbe.length > 0) {
      const requirementsToInstall = requiredFromProbe.filter((req) => hasVersionSpecifier(req));
      if (requirementsToInstall.length > 0) {
        if (!allowAutoInstall) {
          appendLog(
            `Skipping requirement alignment because auto-install is disabled: ${requirementsToInstall.join(', ')}`
          );
        } else {
          const approved = window.confirm(
            `Model compatibility warning detected.\n\nInstall model-declared versioned requirements now?\n\n${requirementsToInstall.join('\n')}`
          );
          if (!approved) {
            store.setExecutionState('idle');
            store.setExecutionError(
              `Execution cancelled. Model requires version-specific dependencies: ${requirementsToInstall.join(', ')}`
            );
            store.setDownloadStats(null);
            return;
          }
          try {
            store.setExecutionState('installing');
            appendLog(`Aligning environment to model requirements: ${requirementsToInstall.join(', ')}`);
            await invoke('install_packages', {
              packages: requirementsToInstall,
              modelId: options?.modelId ?? null,
            });
            appendLog('Requirement alignment complete.');
          } catch (err) {
            stopTimer();
            store.setExecutionState('error');
            store.setExecutionError(`Requirement alignment failed: ${String(err)}`);
            store.setDownloadStats(null);
            appendLog(`Requirement alignment failed: ${String(err)}`);
            return;
          }
        }
      }
    }

    if (packages.length > 0) {
      try {
        const missing = uniqueDependencies(await invoke<string[]>('check_packages', {
          packages,
          modelId: options?.modelId ?? null,
        }));
        if (missing.length > 0) {
          if (!allowAutoInstall) {
            appendLog(`Skipping package install (auto disabled). Missing: ${missing.join(', ')}`);
          } else {
            const approved = window.confirm(
              `Missing packages detected:\n\n${missing.join(', ')}\n\nInstall now?`
            );
            if (!approved) {
              store.setExecutionState('idle');
              store.setExecutionError(
                `Execution cancelled. Required packages were not installed: ${missing.join(', ')}`
              );
              store.setDownloadStats(null);
              return;
            }
            store.setExecutionState('installing');
            appendLog(`Installing missing packages: ${missing.join(', ')}`);
            await invoke('install_packages', {
              packages: missing,
              modelId: options?.modelId ?? null,
            });
            appendLog('Package installation complete.');
          }
        }
      } catch (err) {
        stopTimer();
        store.setExecutionState('error');
        store.setExecutionError(`Package installation failed: ${String(err)}`);
        store.setDownloadStats(null);
        appendLog(`Package installation failed: ${String(err)}`);
        return;
      }
    }

    store.setExecutionState('running');

    appendLog(
      `Launching runtime with device=${options?.preferredDevice ?? 'auto'}${
        options?.selectedGpuId ? `, gpu=${options.selectedGpuId}` : ''
      }${options?.envStoragePath ? `, envStorage=${options.envStoragePath}` : ''}`
    );

    try {
      await invoke('run_python_code', {
        preferredDevice: options?.preferredDevice ?? 'auto',
        selectedGpuId: options?.selectedGpuId ?? null,
        modelId: options?.modelId ?? null,
        hfToken: options?.hfToken ?? null,
        userInput: options?.userInput ?? null,
        envStoragePath: options?.envStoragePath || null,
      });
    } catch (err) {
      stopTimer();
      store.setExecutionState('error');
      store.setExecutionError(String(err));
      store.setDownloadStats(null);
      appendLog(`Failed to launch execution: ${String(err)}`);
    }
  }, []);

  const cancelExecution = useCallback(async () => {
    try {
      await invoke('cancel_execution');
      await invoke('cancel_download');
      appendLog('Cancellation requested.');
    } catch {
      // Ignore — process may have already finished
    }
    stopTimer();
    useAppStore.getState().setExecutionState('cancelled');
    useAppStore.getState().setDownloadStats(null);
  }, []);

  return { runCode, cancelExecution };
}
