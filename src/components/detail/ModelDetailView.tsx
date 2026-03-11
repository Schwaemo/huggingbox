import { useEffect, useState } from 'react';
import { ArrowLeft, AlertCircle, RefreshCw } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import type { HFModelDetail } from '../../stores/appStore';
import { fetchModelDetail, estimateModelSize, formatBytes } from '../../services/huggingfaceApi';
import { estimateRamBytes } from '../../utils/ramEstimation';
import {
  buildCacheIdentity,
  buildFallbackAnalysis,
  buildFallbackCode,
  generateCodeLocally,
} from '../../services/hfAutoRunner';
import {
  buildCodeCacheKey,
  readCachedCode,
  writeCachedCode,
} from '../../services/codeCache';
import ModelInfoPanel from './ModelInfoPanel';
import CodeEditor from './CodeEditor';
import InputPanel from './InputPanel';
import OutputPanel from './OutputPanel';
import Button from '../shared/Button';
import SkeletonCard from '../shared/SkeletonCard';
import { useExecution } from '../../hooks/useExecution';

export default function ModelDetailView() {
  const {
    selectedModelId,
    modelDetail,
    modelDetailLoading,
    modelDetailError,
    generatedCode,
    codeGenerating,
    executionState,
    navigateToBrowse,
    setModelDetail,
    setModelDetailLoading,
    setModelDetailError,
    setGeneratedCode,
    setCodeGenerating,
    setCodeSource,
    codeSource,
    settings,
    systemInfo,
  } = useAppStore();
  const [codeGenerationError, setCodeGenerationError] = useState<string | null>(null);
  const [claudeAnalysis, setClaudeAnalysis] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedModelId) return;
    if (modelDetail?.id === selectedModelId || modelDetail?.modelId === selectedModelId) return;

    async function load() {
      setModelDetailLoading(true);
      setModelDetailError(null);
      try {
        const detail = await fetchModelDetail(
          selectedModelId!,
          settings.hfToken || undefined
        );
        setModelDetail(detail);
      } catch {
        setModelDetailError("Couldn't load model details. Try again.");
      } finally {
        setModelDetailLoading(false);
      }
    }

    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModelId]);

  useEffect(() => {
    setCodeGenerationError(null);
    setClaudeAnalysis(null);
  }, [selectedModelId]);

  async function generateCode(options?: { bypassCache?: boolean }) {
    if (!modelDetail) return;
    setCodeGenerationError(null);
    setCodeGenerating(true);

    const modelId = modelDetail.modelId ?? modelDetail.id;
    const cacheIdentity = buildCacheIdentity(modelDetail, systemInfo);
    const bypassCache = options?.bypassCache === true;

    try {
      const cacheKey = await buildCodeCacheKey(cacheIdentity);
      const cached = bypassCache ? null : await readCachedCode(cacheKey);
      if (cached) {
        setGeneratedCode(cached);
        setCodeSource('cached');
        setClaudeAnalysis('Loaded cached code. Click Re-gen to refresh Claude analysis for this model.');
      } else {
        let code: string;
        try {
          const generated = await generateCodeLocally(modelDetail, settings, systemInfo);
          code = generated.code;
          setClaudeAnalysis(generated.analysis);
          setCodeSource('generated');
        } catch (err) {
          console.error("Local python generation failed", err);
          code = buildFallbackCode(modelDetail);
          setClaudeAnalysis(buildFallbackAnalysis(modelDetail, systemInfo, String(err)));
          setCodeSource('generated');
          setCodeGenerationError(
            `hf_auto_runner failed to generate code. Loaded a local fallback template instead. Error: ${String(err)}`
          );
        }

        setGeneratedCode(code);
        await writeCachedCode(cacheKey, modelId, code);
      }
    } catch (err) {
      setCodeGenerationError(String(err));
    } finally {
      setCodeGenerating(false);
    }
  }

  async function handleGenerateCode() {
    await generateCode();
  }

  async function handleRegenerateCode() {
    if (codeSource === 'edited') {
      const proceed = window.confirm(
        "You've edited the code. Regenerating will replace your changes. Continue?"
      );
      if (!proceed) return;
    }
    await generateCode({ bypassCache: true });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Back nav bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 var(--space-xl)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          backgroundColor: 'var(--bg-primary)',
          height: '44px',
        }}
      >
        <Button
          variant="ghost"
          icon={<ArrowLeft size={16} strokeWidth={1.5} />}
          onClick={navigateToBrowse}
          aria-label="Back to Browse"
          style={{ color: 'var(--text-secondary)', padding: '0 var(--space-sm)' }}
        >
          Back to Browse
        </Button>

        {modelDetail && generatedCode && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
            <span
              style={{
                fontFamily: '"Inter", sans-serif',
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                maxWidth: '300px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {selectedModelId}
            </span>
            <Button
              variant="secondary"
              onClick={handleRegenerateCode}
              style={{ fontSize: '12px', height: '28px', padding: '0 var(--space-md)' }}
            >
              Re-gen
            </Button>
          </div>
        )}
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Loading skeleton */}
        {modelDetailLoading && (
          <div
            style={{
              padding: 'var(--space-2xl)',
              maxWidth: '800px',
              margin: '0 auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-lg)',
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              <div className="skeleton" style={{ height: '20px', width: '80px' }} />
              <div className="skeleton" style={{ height: '28px', width: '60%' }} />
            </div>
            <div className="skeleton" style={{ height: '60px', width: '100%' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          </div>
        )}

        {/* Error state */}
        {modelDetailError && !modelDetailLoading && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--space-lg)',
              padding: 'var(--space-3xl)',
              color: 'var(--text-muted)',
              fontFamily: '"Inter", sans-serif',
              fontSize: '14px',
            }}
          >
            <AlertCircle size={32} strokeWidth={1.5} color="var(--error)" />
            <p>{modelDetailError}</p>
            <Button
              variant="secondary"
              icon={<RefreshCw size={14} strokeWidth={1.5} />}
              onClick={() => {
                setModelDetailError(null);
                setModelDetail(null);
              }}
            >
              Retry
            </Button>
          </div>
        )}

        {/* Phase 1: Model info + Generate Code button */}
        {!modelDetailLoading && !modelDetailError && modelDetail && !generatedCode && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <ModelInfoPanel
              model={modelDetail}
              onGenerateCode={handleGenerateCode}
              codeGenerating={codeGenerating}
              codeGenerationError={codeGenerationError}
            />
          </div>
        )}

        {/* Phase 2: Three-panel workspace */}
        {!modelDetailLoading && !modelDetailError && modelDetail && generatedCode !== null && (
          <WorkspaceLayout
            model={modelDetail}
            code={generatedCode}
            executionState={executionState}
            claudeAnalysis={claudeAnalysis}
            codeGenerationError={codeGenerationError}
          />
        )}
      </div>
    </div>
  );
}

// ─── Phase 2: Three-panel Workspace ──────────────────────────────────────────

interface WorkspaceLayoutProps {
  model: HFModelDetail;
  code: string;
  executionState: string;
  claudeAnalysis: string | null;
  codeGenerationError: string | null;
}

function WorkspaceLayout({
  model,
  code,
  executionState,
  claudeAnalysis,
  codeGenerationError,
}: WorkspaceLayoutProps) {
  const [inputValue, setInputValue] = useState('');
  const { runCode, cancelExecution } = useExecution();

  const isRunning =
    executionState === 'running' ||
    executionState === 'installing' ||
    executionState === 'downloading';

  // Derive metadata labels for InputPanel info section
  const sizeBytes = estimateModelSize(model);
  const sizeLabel = sizeBytes > 0 ? formatBytes(sizeBytes) : undefined;

  const ramBytes = estimateRamBytes(model);
  const ramLabel = ramBytes > 0 ? `~${formatBytes(ramBytes)}` : undefined;

  const siblings = model.siblings ?? [];
  let formatLabel: string | undefined;
  if (siblings.some((f) => f.rfilename.endsWith('.gguf'))) formatLabel = 'GGUF';
  else if (siblings.some((f) => f.rfilename.endsWith('.onnx'))) formatLabel = 'ONNX';
  else if (siblings.some((f) => f.rfilename.endsWith('.safetensors'))) formatLabel = 'SafeTensors';
  else if (siblings.some((f) => f.rfilename.endsWith('.bin'))) formatLabel = 'PyTorch';

  function handleRun() {
    const store = useAppStore.getState();
    runCode({
      modelId: model.modelId ?? model.id,
      storagePath: store.settings.modelStoragePath,
      hfToken: store.settings.hfToken,
      pipelineTag: model.pipeline_tag,
      preferredDevice: store.settings.preferredDevice,
      selectedGpuId: store.settings.selectedGpuId,
      userInput: inputValue.trim() || undefined,
      envStoragePath: store.settings.envStoragePath || undefined,
    });
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left: Input Panel — 280px fixed */}
      <div style={{ width: '280px', minWidth: '240px', flexShrink: 0 }}>
        <InputPanel
          pipelineTag={model.pipeline_tag}
          inputValue={inputValue}
          onInputChange={setInputValue}
          onRun={handleRun}
          onCancel={cancelExecution}
          isRunning={isRunning}
          modelSize={sizeLabel}
          modelFormat={formatLabel}
          ramEstimate={ramLabel}
        />
      </div>

      {/* Right: Analysis + Code editor + Output */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {codeGenerationError && (
          <div
            style={{
              flex: '0 0 auto',
              maxHeight: '160px',
              overflowY: 'auto',
              borderBottom: '1px solid var(--border)',
              padding: 'var(--space-sm) var(--space-md)',
              backgroundColor: 'rgba(16,185,129,0.12)',
            }}
          >
            <div
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: '11px',
                color: 'var(--success)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '6px',
              }}
            >
              Runner Diagnostics
            </div>
            <div
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: '12px',
                color: 'var(--success)',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
              }}
            >
              {codeGenerationError}
            </div>
          </div>
        )}
        {claudeAnalysis && (
          <div
            style={{
              flex: '0 0 auto',
              maxHeight: '150px',
              overflowY: 'auto',
              borderBottom: '1px solid var(--border)',
              padding: 'var(--space-sm) var(--space-md)',
              backgroundColor: 'var(--bg-secondary)',
            }}
          >
            <div
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: '11px',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '6px',
              }}
            >
              Claude Analysis
            </div>
            <div
              style={{
                fontFamily: '"Inter", sans-serif',
                fontSize: '13px',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
              }}
            >
              {claudeAnalysis}
            </div>
          </div>
        )}
        <div style={{ flex: '0 0 55%', overflow: 'hidden', borderBottom: '1px solid var(--border)' }}>
          <CodeEditor code={code} />
        </div>
        <div style={{ flex: '1 1 auto', overflow: 'hidden' }}>
          <OutputPanel
            modelId={model.modelId ?? model.id}
            pipelineTag={model.pipeline_tag}
            inputValue={inputValue}
          />
        </div>
      </div>
    </div>
  );
}
