import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../stores/appStore';

let systemInfoPollingStarted = false;
let pythonProbeStarted = false;

interface RawSystemInfo {
  total_ram: number;
  available_ram: number;
  gpu_name: string | null;
  gpu_vram: number | null;
  os_name: string;
}

interface PythonBootstrapInfo {
  ready: boolean;
  path: string;
  message: string;
}

export function useSystemInfo() {
  const setSystemInfo = useAppStore((s) => s.setSystemInfo);

  useEffect(() => {
    if (!pythonProbeStarted) {
      pythonProbeStarted = true;
      invoke<PythonBootstrapInfo>('bootstrap_python_environment')
        .then((info) => {
          setSystemInfo({ pythonReady: info.ready });
        })
        .catch(() => {
          // Not in Tauri context
        });
    }

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

    if (systemInfoPollingStarted) {
      return;
    }

    systemInfoPollingStarted = true;
    void load();
    const id = window.setInterval(() => {
      void load();
    }, 5000);

    return () => {
      window.clearInterval(id);
      systemInfoPollingStarted = false;
    };
  }, [setSystemInfo]);
}
