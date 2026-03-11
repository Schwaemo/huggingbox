import { useMemo, useRef, useState } from 'react';
import { Play, Square, Upload, Mic } from 'lucide-react';
import Button from '../shared/Button';

interface InputPanelProps {
  pipelineTag: string | null | undefined;
  inputValue: string;
  onInputChange: (val: string) => void;
  onRun: () => void;
  onCancel: () => void;
  isRunning: boolean;
  modelSize?: string;
  modelFormat?: string;
  ramEstimate?: string;
}

// Pipeline categories for input type selection
function getInputType(pipeline: string | null | undefined): 'text' | 'image' | 'audio' | 'prompt' {
  if (!pipeline) return 'text';
  if (['image-classification', 'image-segmentation', 'object-detection', 'depth-estimation',
       'image-to-image', 'image-text-to-text', 'image-to-text'].includes(pipeline)) return 'image';
  if (['automatic-speech-recognition', 'audio-classification', 'text-to-speech'].includes(pipeline)) return 'audio';
  if (pipeline === 'text-to-image') return 'prompt';
  return 'text';
}

function getInputLabel(pipeline: string | null | undefined): string {
  if (!pipeline) return 'Input';
  const labels: Record<string, string> = {
    'text-generation': 'Prompt',
    'text2text-generation': 'Input Text',
    'summarization': 'Text to Summarize',
    'question-answering': 'Question + Context',
    'translation_en_to_fr': 'English Text',
    'fill-mask': 'Text with [MASK]',
    'text-classification': 'Input Text',
    'token-classification': 'Input Text',
    'feature-extraction': 'Input Text',
    'text-to-image': 'Prompt',
    'image-to-image': 'Image',
    'image-text-to-text': 'Image',
    'image-to-text': 'Image',
    'image-classification': 'Image',
    'object-detection': 'Image',
    'image-segmentation': 'Image',
    'depth-estimation': 'Image',
    'automatic-speech-recognition': 'Audio File',
    'audio-classification': 'Audio File',
    'text-to-speech': 'Text to Speak',
  };
  return labels[pipeline] ?? 'Input';
}

function isImageDataUrl(value: string): boolean {
  return value.startsWith('data:image/');
}

function getPlaceholder(pipeline: string | null | undefined): string {
  if (!pipeline) return 'Enter your input here...';
  const placeholders: Record<string, string> = {
    'text-generation': 'Once upon a time...',
    'text2text-generation': 'Enter text to transform...',
    'summarization': 'Paste a long article or document here...',
    'question-answering': 'Question: What is the capital of France?\nContext: Paris is the capital...',
    'fill-mask': 'The capital of France is [MASK].',
    'text-classification': 'Enter text to classify...',
    'token-classification': 'Enter text for entity recognition...',
    'feature-extraction': 'Enter text to embed...',
    'text-to-image': 'A photorealistic image of a mountain at sunset...',
    'text-to-speech': 'Hello, this text will be spoken aloud.',
  };
  return placeholders[pipeline] ?? 'Enter your input here...';
}

export default function InputPanel({
  pipelineTag,
  inputValue,
  onInputChange,
  onRun,
  onCancel,
  isRunning,
  modelSize,
  modelFormat,
  ramEstimate,
}: InputPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const inputType = getInputType(pipelineTag);
  const [batchMode, setBatchMode] = useState(false);
  const [qaContext, setQaContext] = useState('');
  const [qaQuestion, setQaQuestion] = useState('');
  const isQa = pipelineTag === 'question-answering';
  const supportsBatch = useMemo(
    () => ['text-classification', 'summarization', 'feature-extraction'].includes(pipelineTag ?? ''),
    [pipelineTag]
  );
  const displayInputValue = useMemo(() => {
    if (!inputValue.startsWith('__HBJSON__:')) return inputValue;
    const raw = inputValue.slice('__HBJSON__:'.length);
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.join('\n');
    } catch {
      // ignore
    }
    return '';
  }, [inputValue]);
  const imagePreview = useMemo(() => {
    if (inputValue.startsWith('__HBIMG__:')) return inputValue.slice('__HBIMG__:'.length);
    if (isImageDataUrl(inputValue)) return inputValue;
    return '';
  }, [inputValue]);

  async function handleImageFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (result.startsWith('data:image/')) {
        onInputChange(`__HBIMG__:${result}`);
      }
    };
    reader.readAsDataURL(file);
  }

  function emitTextInput(val: string) {
    if (supportsBatch && batchMode) {
      const items = val
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      onInputChange(`__HBJSON__:${JSON.stringify(items)}`);
      return;
    }
    onInputChange(val);
  }

  function emitQaInput(nextQuestion: string, nextContext: string) {
    const payload = {
      question: nextQuestion,
      context: nextContext,
    };
    onInputChange(`__HBJSON__:${JSON.stringify(payload)}`);
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Section: Input */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 'var(--space-lg)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-sm)',
        }}
      >
        <span
          style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: '11px',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {getInputLabel(pipelineTag)}
        </span>

        {/* Text input */}
        {(inputType === 'text' || inputType === 'prompt') && !isQa && (
          <>
            {supportsBatch && (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontFamily: '"Inter", sans-serif',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                }}
              >
                <input
                  type="checkbox"
                  checked={batchMode}
                  onChange={(e) => {
                    setBatchMode(e.target.checked);
                    emitTextInput(displayInputValue);
                  }}
                />
                Batch mode (one input per line)
              </label>
            )}
          <textarea
            value={displayInputValue}
            onChange={(e) => emitTextInput(e.target.value)}
            placeholder={batchMode ? 'One input per line...' : getPlaceholder(pipelineTag)}
            style={{
              flex: 1,
              minHeight: '120px',
              resize: 'vertical',
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: 'var(--space-sm)',
              fontFamily: '"Inter", sans-serif',
              fontSize: '13px',
              color: 'var(--text-primary)',
              outline: 'none',
              transition: 'border-color 150ms',
              lineHeight: 1.5,
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent-primary)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          />
          </>
        )}

        {isQa && (
          <>
            <textarea
              value={qaContext}
              onChange={(e) => {
                const next = e.target.value;
                setQaContext(next);
                emitQaInput(qaQuestion, next);
              }}
              placeholder="Context..."
              style={{
                flex: 1,
                minHeight: '120px',
                resize: 'vertical',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                padding: 'var(--space-sm)',
                fontFamily: '"Inter", sans-serif',
                fontSize: '13px',
                color: 'var(--text-primary)',
                outline: 'none',
                lineHeight: 1.5,
              }}
            />
            <textarea
              value={qaQuestion}
              onChange={(e) => {
                const next = e.target.value;
                setQaQuestion(next);
                emitQaInput(next, qaContext);
              }}
              placeholder="Question..."
              style={{
                minHeight: '72px',
                resize: 'vertical',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                padding: 'var(--space-sm)',
                fontFamily: '"Inter", sans-serif',
                fontSize: '13px',
                color: 'var(--text-primary)',
                outline: 'none',
                lineHeight: 1.5,
              }}
            />
          </>
        )}

        {/* Image upload */}
        {inputType === 'image' && (
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              void handleImageFile(e.dataTransfer.files?.[0]);
            }}
            style={{
              flex: 1,
              minHeight: '120px',
              border: '1px dashed var(--border)',
              borderRadius: '4px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--space-sm)',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              transition: 'border-color 150ms, color 150ms',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent-primary)';
              (e.currentTarget as HTMLDivElement).style.color = 'var(--text-secondary)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
              (e.currentTarget as HTMLDivElement).style.color = 'var(--text-muted)';
            }}
          >
            <Upload size={24} strokeWidth={1.5} />
            <span style={{ fontFamily: '"Inter", sans-serif', fontSize: '13px' }}>
              {imagePreview ? 'Click to replace image' : 'Click to upload image'}
            </span>
            <span style={{ fontFamily: '"Inter", sans-serif', fontSize: '11px' }}>
              PNG, JPG, WebP
            </span>
            {imagePreview && (
              <img
                src={imagePreview}
                alt="Input preview"
                style={{ maxWidth: '100%', maxHeight: '120px', borderRadius: '4px', objectFit: 'contain' }}
              />
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                void handleImageFile(e.target.files?.[0]);
              }}
            />
          </div>
        )}

        {/* Audio upload */}
        {inputType === 'audio' && (
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              flex: 1,
              minHeight: '120px',
              border: '1px dashed var(--border)',
              borderRadius: '4px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--space-sm)',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              transition: 'border-color 150ms, color 150ms',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent-primary)';
              (e.currentTarget as HTMLDivElement).style.color = 'var(--text-secondary)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
              (e.currentTarget as HTMLDivElement).style.color = 'var(--text-muted)';
            }}
          >
            <Mic size={24} strokeWidth={1.5} />
            <span style={{ fontFamily: '"Inter", sans-serif', fontSize: '13px' }}>
              Click to upload audio
            </span>
            <span style={{ fontFamily: '"Inter", sans-serif', fontSize: '11px' }}>
              WAV, MP3, FLAC
            </span>
            <input ref={fileRef} type="file" accept="audio/*" style={{ display: 'none' }} />
          </div>
        )}
      </div>

      {/* Section: Actions */}
      <div
        style={{
          padding: 'var(--space-md) var(--space-lg)',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-sm)',
          flexShrink: 0,
        }}
      >
        {!isRunning ? (
          <Button
            variant="primary"
            icon={<Play size={13} fill="currentColor" strokeWidth={0} />}
            onClick={onRun}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            Run
          </Button>
        ) : (
          <Button
            variant="secondary"
            icon={<Square size={13} fill="currentColor" strokeWidth={0} />}
            onClick={onCancel}
            style={{
              width: '100%',
              justifyContent: 'center',
              borderColor: 'var(--error)',
              color: 'var(--error)',
            }}
          >
            Stop
          </Button>
        )}
      </div>

      {/* Section: Model info */}
      {(modelSize || modelFormat || ramEstimate) && (
        <div
          style={{
            padding: 'var(--space-md) var(--space-lg)',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: '11px',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: '4px',
            }}
          >
            Model Info
          </span>
          {modelSize && (
            <MetaRow label="Size" value={modelSize} />
          )}
          {modelFormat && (
            <MetaRow label="Format" value={modelFormat} />
          )}
          {ramEstimate && (
            <MetaRow label="RAM Est." value={ramEstimate} />
          )}
        </div>
      )}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span
        style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '11px',
          color: 'var(--text-muted)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '11px',
          color: 'var(--text-secondary)',
        }}
      >
        {value}
      </span>
    </div>
  );
}
