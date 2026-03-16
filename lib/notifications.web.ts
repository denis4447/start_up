import { cancelWebPushReminders, scheduleWebPushReminders, subscribeWebPush } from './web-push';
import type { CalendarEvent } from './storage';

export async function requestNotificationPermission(): Promise<boolean> {
  return subscribeWebPush();
}

export async function scheduleEventReminders(event: CalendarEvent): Promise<string[]> {
  if (!event.time) return [];
  await scheduleWebPushReminders(event.id, event.title, event.time, event.date);
  return [`web:${event.id}`];
}

export async function cancelEventReminders(notificationIds: string[]): Promise<void> {
  const webIds = notificationIds.filter((id) => id.startsWith('web:'));
  for (const id of webIds) {
    await cancelWebPushReminders(id.replace('web:', ''));
  }
}
