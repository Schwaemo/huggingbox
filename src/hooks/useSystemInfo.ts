import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../stores/appStore';

interface RawSystemInfo {
  total_ram: number;
  available_ram: number;
  gpu_name: string | null;
  gpu_vram: number | null;
  os_name: string;
}

interface PythonInfo {
  path: string;
  version: string;
  ready: boolean;
}

interface PythonBootstrapInfo {
  ready: boolean;
  path: string;
  message: string;
}

export function useSystemInfo() {
  const setSystemInfo = useAppStore((s) => s.setSystemInfo);

  useEffect(() => {
    // Detect Python once on mount
    invoke<PythonBootstrapInfo>('bootstrap_python_environment')
      .then((info) => {
        setSystemInfo({ pythonReady: info.ready });
      })
      .catch(() => {
        // Not in Tauri context
      });

    invoke<PythonInfo>('detect_python')
      .then((info) => {
        setSystemInfo({ pythonReady: info.ready });
      })
      .catch(() => {
        // Not in Tauri context
      });

    async function load() {
      try {
        const raw = await invoke<RawSystemInfo>('get_system_info');
        setSystemInfo({
          totalRam: raw.total_ram,
          availableRam: raw.available_ram,
          gpuName: raw.gpu_name,
          gpuVram: raw.gpu_vram,
          os: raw.os_name,
        });
      } catch {
        // Running in browser dev mode without Tauri — use mock data
        setSystemInfo({
          totalRam: 16 * 1024 ** 3,
          availableRam: 8 * 1024 ** 3,
          gpuName: null,
          gpuVram: null,
          os: 'Windows',
        });
      }
    }

    load();
    // Refresh every 5 seconds
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [setSystemInfo]);
}
