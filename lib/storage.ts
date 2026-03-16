import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { decryptData, encryptData } from './crypto';

export async function secureGet(key: string): Promise<string | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  return decryptData(raw);
}

export async function secureSet(key: string, value: string): Promise<void> {
  const encrypted = await encryptData(value);
  await AsyncStorage.setItem(key, encrypted);
}

const NOTES_KEY = 'noteai_notes';
const SHOPPING_LIST_KEY = 'noteai_shopping_list';
const EVENTS_KEY = 'noteai_events';
const CHAT_HISTORY_KEY = 'noteai_chat_history';
const CONVERSATIONS_KEY = 'noteai_conversations';
const ACTIVE_CONVERSATION_KEY = 'noteai_active_conversation';
const USER_NAME_KEY = 'noteai_user_name';
const USER_CITY_KEY = 'noteai_user_city';

export type NoteVersion = {
  content: string;
  label: string;
  createdAt: string;
};

export type Note = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  versions?: NoteVersion[];
  locked?: boolean;
};

export type ShoppingItem = {
  id: string;
  text: string;
  checked: boolean;
};

export type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  time?: string;
  color: string;
  remind?: boolean;
  notificationIds?: string[];
  archived?: boolean;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
};

export type ChatConversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
};

// --- Notes ---
export async function getNotes(): Promise<Note[]> {
  try {
    const data = await secureGet(NOTES_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function saveNote(note: Note): Promise<void> {
  const notes = await getNotes();
  const index = notes.findIndex((n) => n.id === note.id);

  if (index >= 0) {
    notes[index] = note;
  } else {
    notes.unshift(note);
  }

  await secureSet(NOTES_KEY, JSON.stringify(notes));
}

export async function deleteNote(noteId: string): Promise<void> {
  const notes = await getNotes();
  const filtered = notes.filter((n) => n.id !== noteId);
  await secureSet(NOTES_KEY, JSON.stringify(filtered));
}

// --- Shopping List ---
export async function getShoppingList(): Promise<ShoppingItem[]> {
  try {
    const data = await secureGet(SHOPPING_LIST_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function saveShoppingList(items: ShoppingItem[]): Promise<void> {
  await secureSet(SHOPPING_LIST_KEY, JSON.stringify(items));
}

// --- Calendar Events ---
export async function getEvents(): Promise<CalendarEvent[]> {
  try {
    const data = await secureGet(EVENTS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function saveEvents(events: CalendarEvent[]): Promise<void> {
  await secureSet(EVENTS_KEY, JSON.stringify(events));
}

export async function addEvent(event: CalendarEvent): Promise<void> {
  const events = await getEvents();
  events.push(event);
  await saveEvents(events);
}

export async function deleteEvent(id: string): Promise<void> {
  const events = await getEvents();
  const filtered = events.filter((e) => e.id !== id);
  await saveEvents(filtered);
}

export async function archiveEvent(id: string): Promise<void> {
  const events = await getEvents();
  const updated = events.map((e) => e.id === id ? { ...e, archived: true } : e);
  await saveEvents(updated);
}

export async function getArchivedEvents(): Promise<CalendarEvent[]> {
  const events = await getEvents();
  return events.filter((e) => e.archived === true);
}

export async function getActiveEvents(): Promise<CalendarEvent[]> {
  const events = await getEvents();
  return events.filter((e) => !e.archived);
}

// --- Chat History (legacy, kept for migration) ---
export async function getChatHistory(): Promise<ChatMessage[]> {
  try {
    const data = await secureGet(CHAT_HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function saveChatHistory(messages: ChatMessage[]): Promise<void> {
  await secureSet(CHAT_HISTORY_KEY, JSON.stringify(messages));
}

// --- Multi-Chat Conversations ---
export async function getConversations(): Promise<ChatConversation[]> {
  try {
    const data = await secureGet(CONVERSATIONS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function saveConversations(convs: ChatConversation[]): Promise<void> {
  await secureSet(CONVERSATIONS_KEY, JSON.stringify(convs));
}

export function createConversation(): ChatConversation {
  return {
    id: generateId(),
    title: 'Новый чат',
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function saveConversation(conv: ChatConversation): Promise<void> {
  const convs = await getConversations();
  const idx = convs.findIndex((c) => c.id === conv.id);
  conv.updatedAt = new Date().toISOString();
  if (idx >= 0) {
    convs[idx] = conv;
  } else {
    convs.unshift(conv);
  }
  await saveConversations(convs);
}

export async function deleteConversation(id: string): Promise<void> {
  const convs = await getConversations();
  await saveConversations(convs.filter((c) => c.id !== id));
  const activeId = await getActiveConversationId();
  if (activeId === id) {
    await AsyncStorage.removeItem(ACTIVE_CONVERSATION_KEY);
  }
}

export async function getActiveConversationId(): Promise<string | null> {
  return AsyncStorage.getItem(ACTIVE_CONVERSATION_KEY);
}

export async function setActiveConversationId(id: string): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_CONVERSATION_KEY, id);
}

export async function migrateOldChatHistory(): Promise<void> {
  const migrated = await AsyncStorage.getItem('noteai_chat_migrated');
  if (migrated) return;

  const oldMessages = await getChatHistory();
  if (oldMessages.length > 0) {
    const conv: ChatConversation = {
      id: generateId(),
      title: oldMessages.find((m) => m.role === 'user')?.content.slice(0, 40) || 'Старый чат',
      messages: oldMessages,
      createdAt: oldMessages[0]?.timestamp || new Date().toISOString(),
      updatedAt: oldMessages[oldMessages.length - 1]?.timestamp || new Date().toISOString(),
    };
    await saveConversation(conv);
    await setActiveConversationId(conv.id);
  }
  await AsyncStorage.setItem('noteai_chat_migrated', '1');
}

// --- User Profile ---
export async function getUserName(): Promise<string> {
  try {
    return (await secureGet(USER_NAME_KEY)) || '';
  } catch {
    return '';
  }
}

export async function saveUserName(name: string): Promise<void> {
  await secureSet(USER_NAME_KEY, name);
}

// --- User City ---
export async function getUserCity(): Promise<string> {
  try {
    return (await secureGet(USER_CITY_KEY)) || 'Москва';
  } catch {
    return 'Москва';
  }
}

export async function saveUserCity(city: string): Promise<void> {
  await secureSet(USER_CITY_KEY, city);
}

// --- Utils ---
export function generateId(): string {
  const bytes = Crypto.getRandomBytes(12);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return Date.now().toString(36) + hex;
}
