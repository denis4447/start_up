import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { CalendarEvent } from './storage';

const CHANNEL_ID = 'noteai-events';

// --- Android notification channel (high priority so it survives DND/battery saver) ---

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'События и напоминания',
      description: 'Уведомления о предстоящих событиях',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 100, 200],
      enableVibrate: true,
      enableLights: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      sound: 'default',
    });
  } catch {
    // expo-notifications channel API not available
  }
}

// Init handler + channel on import
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      priority: Notifications.AndroidNotificationPriority.HIGH,
    }),
  });
  ensureAndroidChannel();
} catch {
  // expo-notifications not available (e.g. Expo Go on Android SDK 53+)
}

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

export async function scheduleEventReminders(event: CalendarEvent): Promise<string[]> {
  if (!event.time) return [];

  try {
    const granted = await requestNotificationPermission();
    if (!granted) return [];

    const [hours, minutes] = event.time.split(':').map(Number);
    const eventDate = new Date(
      `${event.date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
    );

    const ids: string[] = [];
    const now = new Date();

    const dayBefore = new Date(eventDate.getTime() - 24 * 60 * 60 * 1000);
    const hourBefore = new Date(eventDate.getTime() - 60 * 60 * 1000);
    const fifteenMinBefore = new Date(eventDate.getTime() - 15 * 60 * 1000);

    const channelId = Platform.OS === 'android' ? CHANNEL_ID : undefined;

    if (dayBefore > now) {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: '📅 Напоминание о событии',
          body: `Завтра: ${event.title} в ${event.time}`,
          data: { eventId: event.id },
          ...(channelId && { channelId }),
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: dayBefore },
      });
      ids.push(id);
    }

    if (hourBefore > now) {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: '⏰ Скоро событие',
          body: `Через час: ${event.title} в ${event.time}`,
          data: { eventId: event.id },
          ...(channelId && { channelId }),
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: hourBefore },
      });
      ids.push(id);
    }

    if (fifteenMinBefore > now) {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: '🔔 Событие через 15 минут',
          body: `${event.title} в ${event.time}`,
          data: { eventId: event.id },
          ...(channelId && { channelId }),
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fifteenMinBefore },
      });
      ids.push(id);
    }

    return ids;
  } catch {
    return [];
  }
}

export async function cancelEventReminders(notificationIds: string[]): Promise<void> {
  for (const id of notificationIds) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
      // ignore — notifications not available
    }
  }
}
