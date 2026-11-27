import { Capacitor } from '@capacitor/core';

type DiagnosticEntry = {
  id: string;
  occurred_at: string;
  level: 'error' | 'warning';
  platform: string;
  message: string;
  stack: string | null;
};

const STORAGE_KEY = 'sai-sathwika-diagnostics-v1';
const MAX_ENTRIES = 60;
const CONSENT_STORAGE_KEY = 'sai-sathwika-diagnostics-consent';
let installed = false;

function redact(value: string): string {
  return value
    .replace(/(access_token|refresh_token|client_secret|code_verifier|apikey)=([^&\s]+)/gi, '$1=[redacted]')
    .slice(0, 5000);
}

function readEntries(): DiagnosticEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(-MAX_ENTRIES) as DiagnosticEntry[] : [];
  } catch {
    return [];
  }
}

export function recordAppDiagnostic(message: string, stack?: string | null, level: 'error' | 'warning' = 'error'): void {
  if (typeof localStorage === 'undefined') return;
  const entry: DiagnosticEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    occurred_at: new Date().toISOString(),
    level,
    platform: Capacitor.getPlatform(),
    message: redact(message || 'Unknown application error'),
    stack: stack ? redact(stack) : null,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...readEntries(), entry].slice(-MAX_ENTRIES)));
  } catch {
    // Keep the app usable even when browser storage is full or unavailable.
  }
}

export function installAppDiagnostics(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (event) => {
    recordAppDiagnostic(event.message || 'Uncaught JavaScript error', event.error?.stack ?? null);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    recordAppDiagnostic(
      reason instanceof Error ? reason.message : String(reason ?? 'Unhandled promise rejection'),
      reason instanceof Error ? reason.stack ?? null : null,
    );
  });
}

export async function flushAppDiagnostics(client: any, userId: string): Promise<void> {
  let sharingAllowed = false;
  try {
    sharingAllowed = typeof localStorage !== 'undefined' && localStorage.getItem(CONSENT_STORAGE_KEY) === 'granted';
  } catch {
    sharingAllowed = false;
  }
  if (!sharingAllowed || !client || !userId) return;

  const entries = readEntries();
  if (!entries.length || !client || !userId) return;

  const payload = entries.map((entry) => ({
    received_at: entry.occurred_at,
    user_id: userId,
    app_version: '0.1.x',
    platform: entry.platform,
    level: entry.level,
    message: entry.message,
    stack: entry.stack,
  }));

  const { error } = await client.from('app_diagnostics').insert(payload);
  if (error) {
    console.warn('Sai Sathwika diagnostics could not be synced yet:', error.message);
    return;
  }

  const uploadedIds = new Set(entries.map((entry) => entry.id));
  const remaining = readEntries().filter((entry) => !uploadedIds.has(entry.id));
  try {
    if (remaining.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Diagnostics remain on-device and will be retried after the next sign-in.
  }
}
