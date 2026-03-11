import { create } from 'zustand';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HFModel {
  id: string;
  modelId: string;
  pipeline_tag: string | null;
  tags: string[];
  downloads: number;
  lastModified: string;
  author: string;
  cardData?: {
    license?: string;
  };
  siblings?: Array<{ rfilename: string; size?: number }>;
  description?: string;
}

export interface HFModelDetail extends HFModel {
  readme?: string;
  safetensors?: { total: number };
}

export interface DownloadedModel {
  id: string;
  name: string;
  pipeline_tag: string;
  sizeBytes: number;
  lastUsed: string;
  storagePath: string;
}

export type OutputType =
  | 'text'
  | 'classification'
  | 'image'
  | 'audio'
  | 'embedding'
  | 'none';

export type ExecutionState =
  | 'idle'
  | 'installing'
  | 'downloading'
  | 'running'
  | 'completed'
  | 'error'
  | 'cancelled';

export interface SystemInfo {
  totalRam: number;
  availableRam: number;
  gpuName: string | null;
  gpuVram: number | null;
  os: string;
  pythonReady: boolean;
}

export interface AppSettings {
  hfToken: string;
  modelStoragePath: string;
  envStoragePath: string;
  preferredDevice: 'auto' | 'cpu' | 'cuda';
  selectedGpuId: string | null;
  theme: 'dark' | 'light';
}

export interface DownloadStats {
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
  speedBps: number;
  etaSeconds: number | null;
  phase: string;
  filesDone: number;
  filesTotal: number;
  filename?: string;
}

// ─── Store Interface ─────────────────────────────────────────────────────────

interface AppStore {
  // Navigation
  currentView: 'browse' | 'model-detail' | 'my-models' | 'settings';
  selectedModelId: string | null;

  // Browse
  searchQuery: string;
  pipelineFilter: string | null;
  sizeFilter: string | null;
  models: HFModel[];
  modelsPage: number;
  modelsHasMore: boolean;
  modelsLoading: boolean;
  modelsError: string | null;
  browseScrollPosition: number;

  // Model Detail
  modelDetail: HFModelDetail | null;
  modelDetailLoading: boolean;
  modelDetailError: string | null;
  generatedCode: string | null;
  codeGenerating: boolean;
  codeSource: 'generated' | 'cached' | 'edited' | null;

  // Execution
  executionState: ExecutionState;
  executionOutput: string;
  stderrOutput: string;
  executionError: string | null;
  executionStartTime: number | null;
  executionElapsed: number;
  downloadStats: DownloadStats | null;

  // Output
  outputType: OutputType;
  outputData: unknown;

  // System
  systemInfo: SystemInfo;

  // Settings
  settings: AppSettings;

  // Downloaded models
  downloadedModels: DownloadedModel[];

  // ─── Actions ───────────────────────────────────────────────────────────────

  setCurrentView: (view: AppStore['currentView']) => void;
  setSelectedModelId: (id: string | null) => void;
  navigateToModel: (id: string) => void;
  navigateToBrowse: () => void;

  setSearchQuery: (q: string) => void;
  setPipelineFilter: (f: string | null) => void;
  setSizeFilter: (f: string | null) => void;
  setModels: (models: HFModel[]) => void;
  appendModels: (models: HFModel[]) => void;
  setModelsPage: (page: number) => void;
  setModelsHasMore: (has: boolean) => void;
  setModelsLoading: (loading: boolean) => void;
  setModelsError: (err: string | null) => void;
  setBrowseScrollPosition: (pos: number) => void;

  setModelDetail: (detail: HFModelDetail | null) => void;
  setModelDetailLoading: (loading: boolean) => void;
  setModelDetailError: (err: string | null) => void;
  setGeneratedCode: (code: string | null) => void;
  setCodeGenerating: (gen: boolean) => void;
  setCodeSource: (src: AppStore['codeSource']) => void;

  setExecutionState: (state: ExecutionState) => void;
  appendExecutionOutput: (text: string) => void;
  clearExecutionOutput: () => void;
  appendStderrOutput: (text: string) => void;
  clearStderrOutput: () => void;
  setExecutionError: (err: string | null) => void;
  setExecutionStartTime: (t: number | null) => void;
  setExecutionElapsed: (t: number) => void;
  setDownloadStats: (stats: DownloadStats | null) => void;

  setSystemInfo: (info: Partial<SystemInfo>) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  setTheme: (theme: 'dark' | 'light') => void;

  setDownloadedModels: (models: DownloadedModel[]) => void;
}

// ─── Store Implementation ────────────────────────────────────────────────────

export const useAppStore = create<AppStore>((set) => ({
  // Navigation
  currentView: 'browse',
  selectedModelId: null,

  // Browse
  searchQuery: '',
  pipelineFilter: null,
  sizeFilter: null,
  models: [],
  modelsPage: 0,
  modelsHasMore: true,
  modelsLoading: false,
  modelsError: null,
  browseScrollPosition: 0,

  // Model Detail
  modelDetail: null,
  modelDetailLoading: false,
  modelDetailError: null,
  generatedCode: null,
  codeGenerating: false,
  codeSource: null,

  // Execution
  executionState: 'idle',
  executionOutput: '',
  stderrOutput: '',
  executionError: null,
  executionStartTime: null,
  executionElapsed: 0,
  downloadStats: null,

  // Output
  outputType: 'none',
  outputData: null,

  // System
  systemInfo: {
    totalRam: 0,
    availableRam: 0,
    gpuName: null,
    gpuVram: null,
    os: '',
    pythonReady: false,
  },

  // Settings
  settings: {
    hfToken: '',
    modelStoragePath: '~/HuggingBox/models/',
    envStoragePath: '',
    preferredDevice: 'auto',
    selectedGpuId: null,
    theme: 'dark',
  },

  downloadedModels: [],

  // ─── Action implementations ────────────────────────────────────────────────

  setCurrentView: (view) => set({ currentView: view }),
  setSelectedModelId: (id) => set({ selectedModelId: id }),
  navigateToModel: (id) =>
    set({
      selectedModelId: id,
      currentView: 'model-detail',
      modelDetail: null,
      modelDetailError: null,
      generatedCode: null,
      codeSource: null,
      executionState: 'idle',
      executionOutput: '',
      stderrOutput: '',
      executionError: null,
      executionStartTime: null,
      executionElapsed: 0,
      downloadStats: null,
    }),
  navigateToBrowse: () =>
    set({ currentView: 'browse', selectedModelId: null }),

  setSearchQuery: (q) => set({ searchQuery: q }),
  setPipelineFilter: (f) => set({ pipelineFilter: f }),
  setSizeFilter: (f) => set({ sizeFilter: f }),
  setModels: (models) => set({ models }),
  appendModels: (models) =>
    set((s) => ({ models: [...s.models, ...models] })),
  setModelsPage: (page) => set({ modelsPage: page }),
  setModelsHasMore: (has) => set({ modelsHasMore: has }),
  setModelsLoading: (loading) => set({ modelsLoading: loading }),
  setModelsError: (err) => set({ modelsError: err }),
  setBrowseScrollPosition: (pos) => set({ browseScrollPosition: pos }),

  setModelDetail: (detail) => set({ modelDetail: detail }),
  setModelDetailLoading: (loading) => set({ modelDetailLoading: loading }),
  setModelDetailError: (err) => set({ modelDetailError: err }),
  setGeneratedCode: (code) => set({ generatedCode: code }),
  setCodeGenerating: (gen) => set({ codeGenerating: gen }),
  setCodeSource: (src) => set({ codeSource: src }),

  setExecutionState: (state) => set({ executionState: state }),
  appendExecutionOutput: (text) =>
    set((s) => ({ executionOutput: s.executionOutput + text })),
  clearExecutionOutput: () => set({ executionOutput: '' }),
  appendStderrOutput: (text) =>
    set((s) => ({ stderrOutput: s.stderrOutput + text })),
  clearStderrOutput: () => set({ stderrOutput: '' }),
  setExecutionError: (err) => set({ executionError: err }),
  setExecutionStartTime: (t) => set({ executionStartTime: t }),
  setExecutionElapsed: (t) => set({ executionElapsed: t }),
  setDownloadStats: (stats) => set({ downloadStats: stats }),

  setSystemInfo: (info) =>
    set((s) => ({ systemInfo: { ...s.systemInfo, ...info } })),
  updateSettings: (patch) =>
    set((s) => ({ settings: { ...s.settings, ...patch } })),
  setTheme: (theme) =>
    set((s) => ({ settings: { ...s.settings, theme } })),

  setDownloadedModels: (models) => set({ downloadedModels: models }),
}));
