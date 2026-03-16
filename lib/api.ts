import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

function getApiBaseUrl(): string {
  if (!__DEV__) {
    const configUrl = Constants.expoConfig?.extra?.apiBaseUrl as string | undefined;
    return configUrl || 'https://your-production-url.com/api';
  }

  // In Expo Go, extract the dev machine's LAN IP from the debugger host
  const debuggerHost =
    Constants.expoConfig?.hostUri ?? Constants.manifest2?.extra?.expoGo?.debuggerHost;
  if (debuggerHost) {
    const ip = debuggerHost.split(':')[0];
    return `http://${ip}:3001/api`;
  }
  return 'http://localhost:3001/api';
}

const API_BASE_URL = getApiBaseUrl();

const TOKEN_KEY = 'noteai_auth_token';
const DEVICE_ID_KEY = 'noteai_device_id';

const DEFAULT_TIMEOUT_MS = 60_000;

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('Превышено время ожидания ответа от сервера');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function getToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return AsyncStorage.getItem(TOKEN_KEY);
  }
  // Migrate from AsyncStorage to SecureStore on first access
  const secureToken = await SecureStore.getItemAsync(TOKEN_KEY);
  if (secureToken) return secureToken;
  const legacyToken = await AsyncStorage.getItem(TOKEN_KEY);
  if (legacyToken) {
    await SecureStore.setItemAsync(TOKEN_KEY, legacyToken);
    await AsyncStorage.removeItem(TOKEN_KEY);
    return legacyToken;
  }
  return null;
}

async function setToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } else {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  }
}

async function removeToken(): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(TOKEN_KEY);
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

async function getOrCreateDeviceId(): Promise<string> {
  if (Platform.OS === 'web') {
    let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        `${Platform.OS}-${Date.now()}-${Crypto.getRandomBytes(16).join(',')}`
      );
      await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  }

  // Native: use SecureStore (Keychain / Keystore)
  let deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (!deviceId) {
    // Migrate from AsyncStorage if exists
    const legacy = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (legacy) {
      await SecureStore.setItemAsync(DEVICE_ID_KEY, legacy);
      await AsyncStorage.removeItem(DEVICE_ID_KEY);
      deviceId = legacy;
    } else {
      deviceId = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        `${Platform.OS}-${Date.now()}-${Crypto.getRandomBytes(16).join(',')}`
      );
      await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
    }
  }
  return deviceId;
}

export class LicenseRequiredError extends Error {
  constructor() {
    super('LICENSE_REQUIRED');
    this.name = 'LicenseRequiredError';
  }
}

export class UltraRequiredError extends Error {
  constructor() {
    super('ULTRA_REQUIRED');
    this.name = 'UltraRequiredError';
  }
}

async function checkLicenseError(response: Response): Promise<void> {
  if (response.status === 403) {
    try {
      const data = await response.clone().json();
      if (data.error === 'LICENSE_REQUIRED') {
        throw new LicenseRequiredError();
      }
      if (data.error === 'ULTRA_REQUIRED') {
        throw new UltraRequiredError();
      }
      if (data.error === 'Invalid or expired token') {
        // Token expired — clear it so ensureAuthenticated re-auths next time
        await removeToken();
        throw new Error('Сессия истекла. Повторите запрос.');
      }
    } catch (e) {
      if (e instanceof LicenseRequiredError) throw e;
      if (e instanceof UltraRequiredError) throw e;
      throw e;
    }
  }
  if (response.status === 401) {
    await removeToken();
    throw new Error('Требуется повторная авторизация. Повторите запрос.');
  }
}

async function getHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function authenticate(deviceId: string): Promise<{ token: string; userId: string }> {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId }),
  });

  if (!response.ok) {
    throw new Error('Authentication failed');
  }

  const data = await response.json();
  await setToken(data.token);
  return data;
}

const AUTH_MIGRATION_KEY = 'noteai_auth_v2';

export async function ensureAuthenticated(): Promise<void> {
  // One-time migration: clear old random-UUID tokens so we re-auth with deterministic userId
  const migrated = await AsyncStorage.getItem(AUTH_MIGRATION_KEY);
  if (!migrated) {
    await removeToken();
    await AsyncStorage.removeItem(DEVICE_ID_KEY);
    await AsyncStorage.setItem(AUTH_MIGRATION_KEY, '1');
  }

  const existing = await getToken();
  if (existing) return;

  const deviceId = await getOrCreateDeviceId();
  await authenticate(deviceId);
}

export async function sendChatMessage(
  message: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  onChunk: (content: string) => void,
  useGpt52: boolean = false,
  externalSignal?: AbortSignal
): Promise<void> {
  const headers = await getHeaders();

  // 90s timeout for streaming (longer than 30s quick chat)
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), 90_000);

  // Merge external signal (unmount) with timeout signal
  const onExternalAbort = () => timeoutController.abort();
  externalSignal?.addEventListener('abort', onExternalAbort);

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  try {
    const response = await fetch(`${API_BASE_URL}/chat/message`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, conversationHistory, useGpt52 }),
      signal: timeoutController.signal,
    });

    await checkLicenseError(response);
    if (!response.ok) {
      throw new Error('Chat request failed');
    }

    reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') return;

            try {
              const parsed = JSON.parse(data);
              if (parsed.error) {
                throw new Error(parsed.error);
              }
              if (typeof parsed.content === 'string' && parsed.content) {
                onChunk(parsed.content);
              }
            } catch (parseErr: any) {
              // Re-throw non-JSON errors (server-side stream errors)
              if (parseErr.message && !parseErr.message.includes('JSON')) throw parseErr;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('Превышено время ожидания ответа от сервера');
    }
    throw err;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

export async function sendQuickChat(
  message: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  useGpt52: boolean = false
): Promise<string> {
  const headers = await getHeaders();

  const response = await fetchWithTimeout(`${API_BASE_URL}/chat/quick`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message, conversationHistory, useGpt52 }),
  }, 30_000);

  await checkLicenseError(response);
  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    if (__DEV__) console.error('[sendQuickChat] HTTP', response.status, errBody);
    throw new Error('Ошибка при обработке запроса');
  }

  const data = await response.json();
  if (!data.content) {
    if (__DEV__) console.warn('[sendQuickChat] Empty content from model, data:', data);
    throw new Error('Empty response from model');
  }
  return data.content;
}

// --- Retry wrapper for chat (3 attempts, exponential backoff 1s→2s→4s) ---

const CHAT_RETRY_DELAYS = [1000, 2000, 4000];

function isChatRetryable(err: any): boolean {
  if (err instanceof LicenseRequiredError || err instanceof UltraRequiredError) return false;
  const msg = err?.message ?? '';
  if (msg.includes('429') || msg.includes('rate')) return false;
  return true;
}

export async function sendQuickChatWithRetry(
  message: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  useGpt52: boolean = false
): Promise<string> {
  let lastError: Error = new Error('Unknown chat error');
  for (let attempt = 0; attempt <= CHAT_RETRY_DELAYS.length; attempt++) {
    try {
      return await sendQuickChat(message, conversationHistory, useGpt52);
    } catch (err: any) {
      lastError = err;
      if (!isChatRetryable(err)) throw err;
      if (attempt < CHAT_RETRY_DELAYS.length) {
        if (__DEV__) console.warn(`[Chat] Attempt ${attempt + 1} failed, retrying in ${CHAT_RETRY_DELAYS[attempt]}ms...`);
        await new Promise((r) => setTimeout(r, CHAT_RETRY_DELAYS[attempt]));
      }
    }
  }
  throw lastError;
}

// --- Streaming retry wrapper for chat ---

export async function sendChatMessageWithRetry(
  message: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  onChunk: (content: string) => void,
  useGpt52: boolean = false,
  onRetryReset?: () => void,
  signal?: AbortSignal
): Promise<void> {
  let lastError: Error = new Error('Unknown chat error');
  for (let attempt = 0; attempt <= CHAT_RETRY_DELAYS.length; attempt++) {
    if (signal?.aborted) throw new Error('Запрос отменён');
    if (attempt > 0) {
      onRetryReset?.();
    }
    try {
      return await sendChatMessage(message, conversationHistory, onChunk, useGpt52, signal);
    } catch (err: any) {
      lastError = err;
      if (!isChatRetryable(err)) throw err;
      if (attempt < CHAT_RETRY_DELAYS.length) {
        if (__DEV__) console.warn(`[Chat stream] Attempt ${attempt + 1} failed, retrying in ${CHAT_RETRY_DELAYS[attempt]}ms...`);
        await new Promise((r) => setTimeout(r, CHAT_RETRY_DELAYS[attempt]));
      }
    }
  }
  throw lastError;
}

// --- Backend health check ---

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/health`, {}, 5000);
    return res.ok;
  } catch {
    return false;
  }
}

// Helper: consume SSE stream and return final result
async function consumeSSE(
  response: Response,
  resultKey: string,
  onChunk?: (text: string) => void
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Нет тела ответа');

  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;

        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.delta) {
            fullText += parsed.delta;
            onChunk?.(fullText);
          }
          if (parsed.done && parsed[resultKey]) {
            return parsed[resultKey];
          }
        } catch (parseErr) {
          if ((parseErr as Error).message && !(parseErr as Error).message.includes('JSON'))
            throw parseErr;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (fullText.trim()) return fullText;
  throw new Error('AI вернул пустой ответ');
}

export async function structureNote(
  content: string,
  language: 'ru' | 'en' = 'ru',
  onChunk?: (text: string) => void
): Promise<string> {
  await ensureAuthenticated();
  const headers = await getHeaders();

  const response = await fetchWithTimeout(`${API_BASE_URL}/notes/structure`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content, language }),
  });

  await checkLicenseError(response);
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || 'Ошибка генерации заметки');
  }

  return consumeSSE(response, 'structured', onChunk);
}

export type TransformAction = 'structure' | 'expand' | 'shorten' | 'style';
export type TransformStyle = 'friendly' | 'business' | 'email' | 'post';

export async function transformNote(
  content: string,
  action: TransformAction,
  style?: TransformStyle,
  language: 'ru' | 'en' = 'ru',
  onChunk?: (text: string) => void
): Promise<string> {
  await ensureAuthenticated();
  const headers = await getHeaders();

  const response = await fetchWithTimeout(`${API_BASE_URL}/notes/transform`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content, action, style, language }),
  });

  await checkLicenseError(response);
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || 'Ошибка трансформации заметки');
  }

  return consumeSSE(response, 'result', onChunk);
}

// License API
export type LicenseTier = 'pro' | 'ultra';

export type LicenseInfo = {
  key: string;
  tier: LicenseTier;
  activatedAt: string;
  expiresAt: string;
  daysLeft: number;
};

export type LicenseStatus = {
  active: boolean;
  tier?: LicenseTier;
  expired?: boolean;
  message?: string;
  license?: LicenseInfo;
  expiresAt?: string;
};

export async function activateLicense(licenseKey: string): Promise<{ success: boolean; message: string; license?: LicenseInfo }> {
  const headers = await getHeaders();

  const response = await fetch(`${API_BASE_URL}/license/activate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ licenseKey }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Ошибка активации');
  }

  return data;
}

export async function checkLicenseStatus(): Promise<LicenseStatus> {
  const headers = await getHeaders();

  const response = await fetch(`${API_BASE_URL}/license/status`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw new Error('Ошибка проверки лицензии');
  }

  return response.json();
}

// Voice API
export type VoiceNoteResult = {
  title: string;
  content: string;
  transcript: string;
};

export async function transcribeAudio(
  fileUri: string,
  mimeType: string = 'audio/m4a',
  fileName: string = 'recording.m4a'
): Promise<VoiceNoteResult> {
  const token = await getToken();

  const formData = new FormData();

  // On web, blob: URIs need to be fetched and converted to a File object
  if (Platform.OS === 'web' && fileUri.startsWith('blob:')) {
    const blob = await fetch(fileUri).then((r) => r.blob());
    const file = new File([blob], fileName, { type: mimeType });
    formData.append('audio', file);
  } else {
    formData.append('audio', {
      uri: fileUri,
      type: mimeType,
      name: fileName,
    } as any);
  }

  const response = await fetch(`${API_BASE_URL}/voice/transcribe`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  await checkLicenseError(response);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Ошибка обработки аудио');
  }

  return response.json();
}

export async function summarizeNote(content: string, language: 'ru' | 'en' = 'ru'): Promise<string> {
  await ensureAuthenticated();
  const headers = await getHeaders();

  const response = await fetchWithTimeout(`${API_BASE_URL}/notes/summarize`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content, language }),
  });

  await checkLicenseError(response);
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || 'Ошибка резюмирования');
  }

  const data = await response.json();
  return data.summary;
}
