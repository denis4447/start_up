import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

function getApiBaseUrl(): string {
  if (!__DEV__) return 'https://your-production-url.com/api';
  const debuggerHost =
    Constants.expoConfig?.hostUri ?? (Constants.manifest2 as any)?.extra?.expoGo?.debuggerHost;
  if (debuggerHost) {
    const ip = debuggerHost.split(':')[0];
    return `http://${ip}:3001/api`;
  }
  return 'http://localhost:3001/api';
}

const API_BASE_URL = getApiBaseUrl();
const SW_SUBSCRIPTION_KEY = 'noteai_push_subscription';

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('noteai_auth_token');
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const arr = Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
  return arr.buffer as ArrayBuffer;
}

/**
 * Detect iOS PWA (standalone) mode.
 * iOS Safari standalone does NOT support Push API before 16.4.
 * Even on 16.4+, permission must be triggered by user gesture.
 */
function isIOSStandalone(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    ('standalone' in navigator && (navigator as any).standalone === true) ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

function isPushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    return reg;
  } catch (e) {
    if (__DEV__) console.warn('SW registration failed:', e);
    return null;
  }
}

export async function subscribeWebPush(): Promise<boolean> {
  try {
    if (!isPushSupported()) {
      if (__DEV__) console.warn('Push API not supported in this browser');
      return false;
    }

    // iOS standalone PWA: push is supported only on 16.4+,
    // and requestPermission MUST be called from a user gesture.
    // The caller (calendar toggle / settings button) already provides that gesture.

    const reg = await registerServiceWorker();
    if (!reg) return false;

    // Wait for the SW to be active (important for fresh installs)
    if (reg.installing) {
      await new Promise<void>((resolve) => {
        reg.installing!.addEventListener('statechange', function handler() {
          if (this.state === 'activated') {
            this.removeEventListener('statechange', handler);
            resolve();
          }
        });
      });
    }

    // Reuse existing subscription if valid
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      // Re-register on backend in case server DB was reset
      const token = await getToken();
      if (token) {
        await fetch(`${API_BASE_URL}/push/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ subscription: existing.toJSON() }),
        });
      }
      await AsyncStorage.setItem(SW_SUBSCRIPTION_KEY, JSON.stringify(existing.toJSON()));
      return true;
    }

    // No existing subscription — create a new one
    const vapidRes = await fetch(`${API_BASE_URL}/push/vapid-public-key`);
    if (!vapidRes.ok) return false;
    const { publicKey } = await vapidRes.json();

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    const token = await getToken();
    const res = await fetch(`${API_BASE_URL}/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });

    if (res.ok) {
      await AsyncStorage.setItem(SW_SUBSCRIPTION_KEY, JSON.stringify(subscription.toJSON()));
      return true;
    }
    return false;
  } catch (e) {
    if (__DEV__) console.warn('Web push subscribe failed:', e);
    return false;
  }
}

export async function scheduleWebPushReminders(
  eventId: string,
  title: string,
  time: string,
  date: string
): Promise<boolean> {
  try {
    const token = await getToken();
    if (!token) return false;

    const [hours, minutes] = time.split(':').map(Number);
    const eventDate = new Date(
      `${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
    );
    const now = new Date();

    const dayBefore = new Date(eventDate.getTime() - 24 * 60 * 60 * 1000);
    const hourBefore = new Date(eventDate.getTime() - 60 * 60 * 1000);
    const fifteenMinBefore = new Date(eventDate.getTime() - 15 * 60 * 1000);

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    const promises: Promise<Response>[] = [];

    if (dayBefore > now) {
      promises.push(
        fetch(`${API_BASE_URL}/push/schedule`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            title: '📅 Напоминание о событии',
            body: `Завтра: ${title} в ${time}`,
            scheduledAt: dayBefore.toISOString().replace('T', ' ').slice(0, 19),
            eventId,
          }),
        })
      );
    }

    if (hourBefore > now) {
      promises.push(
        fetch(`${API_BASE_URL}/push/schedule`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            title: '⏰ Скоро событие',
            body: `Через час: ${title} в ${time}`,
            scheduledAt: hourBefore.toISOString().replace('T', ' ').slice(0, 19),
            eventId,
          }),
        })
      );
    }

    if (fifteenMinBefore > now) {
      promises.push(
        fetch(`${API_BASE_URL}/push/schedule`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            title: '🔔 Событие через 15 минут',
            body: `${title} в ${time}`,
            scheduledAt: fifteenMinBefore.toISOString().replace('T', ' ').slice(0, 19),
            eventId,
          }),
        })
      );
    }

    await Promise.all(promises);
    return true;
  } catch (e) {
    if (__DEV__) console.warn('Schedule web push failed:', e);
    return false;
  }
}

export async function cancelWebPushReminders(eventId: string): Promise<void> {
  try {
    const token = await getToken();
    if (!token) return;
    await fetch(`${API_BASE_URL}/push/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ eventId }),
    });
  } catch (e) {
    if (__DEV__) console.warn('Cancel web push failed:', e);
  }
}
