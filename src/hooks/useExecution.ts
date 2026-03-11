import { useEffect, useRef, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../stores/appStore';
import { listDownloadedModels } from '../services/modelStorage';

/**
 * Manages Python code execution via Tauri commands.
 * - Wires up Tauri event listeners for stdout/stderr/done
 * - Provides runCode() which auto-checks and installs missing packages first
 * - Provides cancelExecution()
 * - Drives the elapsed-time timer in the store
 */
export function useExecution() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Event listeners ──────────────────────────────────────────────────────

  useEffect(() => {
    let unlistens: (() => void)[] = [];
    let active = true;

    (async () => {
      try {
        const u1 = await listen<{ text: string }>('execution-stdout', (e) => {
          useAppStore.getState().appendExecutionOutput(e.payload.text);
        });

        const u2 = await listen<{ text: string }>('execution-stderr', (e) => {
          useAppStore.getState().appendStderrOutput(e.payload.text);
        });

        const u3 = await listen<{ exit_code: number }>('execution-done', (e) => {
          stopTimer();
          const state = e.payload.exit_code === 0
            ? 'completed'
            : e.payload.exit_code === -2  // custom sentinel for cancelled
              ? 'cancelled'
              : 'error';
          useAppStore.getState().setExecutionState(state);
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

        if (active) {
          unlistens = [u1, u2, u3, u4, u5, u6];
        } else {
          // Component unmounted before listeners were registered — clean up immediately
          u1(); u2(); u3(); u4(); u5(); u6();
        }
      } catch {
        // Not running inside Tauri (e.g. browser preview) — silently ignore
      }
    })();

    return () => {
      active = false;
      unlistens.forEach((fn) => fn());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Timer ────────────────────────────────────────────────────────────────

  function startTimer() {
    const start = Date.now();
    useAppStore.getState().setExecutionStartTime(start);
    timerRef.current = setInterval(() => {
      useAppStore.getState().setExecutionElapsed(Date.now() - start);
    }, 100);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  // ── Run ──────────────────────────────────────────────────────────────────

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

    // Download model if needed before execution
    if (options?.modelId && options?.storagePath) {
      try {
        const missingDownloadDeps = await invoke<string[]>('check_packages', {
          packages: ['huggingface_hub', 'hf_transfer'],
          modelId: options.modelId,
        });
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
          startTimer();
          await invoke('install_packages', { packages: missingDownloadDeps, modelId: options.modelId });
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
          startTimer();
          store.appendExecutionOutput(`[HuggingBox] Starting model download for ${options.modelId}\n`);
          await invoke('download_model', {
            modelId: options.modelId,
            storagePath: options.storagePath,
            hfToken: options.hfToken || null,
          });
          const refreshed = await listDownloadedModels(options.storagePath);
          store.setDownloadedModels(refreshed);
          store.appendExecutionOutput('[HuggingBox] Download stage complete.\n\n');
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
        return;
      }
    }

    const packages: string[] = [];

    if (packages.length > 0) {
      try {
        const missing = await invoke<string[]>('check_packages', {
          packages,
          modelId: options?.modelId ?? null,
        });
        if (missing.length > 0) {
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
          startTimer();
          store.appendExecutionOutput(
            `[HuggingBox] Installing missing packages: ${missing.join(', ')}\n`
          );
          await invoke('install_packages', {
            packages: missing,
            modelId: options?.modelId ?? null,
          });
          store.appendExecutionOutput('[HuggingBox] Installation complete.\n\n');
        }
      } catch (err) {
        stopTimer();
        store.setExecutionState('error');
        store.setExecutionError(`Package installation failed: ${String(err)}`);
        store.setDownloadStats(null);
        return;
      }
    }

    // Run the code
    store.setExecutionState('running');
    if (!timerRef.current) startTimer();

    try {
      await invoke('run_python_code', {
        preferredDevice: options?.preferredDevice ?? 'auto',
        selectedGpuId: options?.selectedGpuId ?? null,
        modelId: options?.modelId ?? null,
        hfToken: options?.hfToken ?? null,
        userInput: options?.userInput ?? null,
        envStoragePath: options?.envStoragePath || null,
      });
      // Execution result arrives via 'execution-done' event — nothing to do here
    } catch (err) {
      stopTimer();
      store.setExecutionState('error');
      store.setExecutionError(String(err));
      store.setDownloadStats(null);
    }
  }, []);

  // ── Cancel ───────────────────────────────────────────────────────────────

  const cancelExecution = useCallback(async () => {
    try {
      await invoke('cancel_execution');
      await invoke('cancel_download');
    } catch {
      // Ignore — process may have already finished
    }
    stopTimer();
    useAppStore.getState().setExecutionState('cancelled');
    useAppStore.getState().setDownloadStats(null);
  }, []);

  return { runCode, cancelExecution };
}
