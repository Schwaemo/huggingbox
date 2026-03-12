import { confirm, message } from '@tauri-apps/plugin-dialog';

const APP_TITLE = 'HuggingBox';

export async function confirmDialog(
  body: string,
  options?: {
    title?: string;
    kind?: 'info' | 'warning' | 'error';
    okLabel?: string;
    cancelLabel?: string;
  }
): Promise<boolean> {
  return confirm(body, {
    title: options?.title ?? APP_TITLE,
    kind: options?.kind ?? 'warning',
    okLabel: options?.okLabel,
    cancelLabel: options?.cancelLabel,
  });
}

export async function messageDialog(
  body: string,
  options?: {
    title?: string;
    kind?: 'info' | 'warning' | 'error';
    okLabel?: string;
  }
): Promise<void> {
  await message(body, {
    title: options?.title ?? APP_TITLE,
    kind: options?.kind ?? 'info',
    okLabel: options?.okLabel,
  });
}
