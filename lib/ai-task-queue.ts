import {
  transformNote,
  LicenseRequiredError,
  UltraRequiredError,
  type TransformAction,
  type TransformStyle,
} from './api';
import { generateId, getNotes, saveNote, secureGet, secureSet, type Note, type NoteVersion } from './storage';

// --- Types ---

export type AITaskStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type AITaskAction = TransformAction;

export interface AITask {
  id: string;
  noteId: string;
  noteContent: string;
  action: AITaskAction;
  style?: TransformStyle;
  language: 'ru' | 'en';
  versionLabel: string;
  status: AITaskStatus;
  attempt: number;
  maxAttempts: number;
  result?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export type TaskStatusCallback = (task: AITask) => void;

// --- Storage ---

const AI_TASK_QUEUE_KEY = 'noteai_ai_task_queue';
const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
const RETRY_DELAYS_MS = [0, 1000, 3000]; // attempt 0, 1, 2

async function loadQueue(): Promise<AITask[]> {
  try {
    const data = await secureGet(AI_TASK_QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

async function persistQueue(tasks: AITask[]): Promise<void> {
  await secureSet(AI_TASK_QUEUE_KEY, JSON.stringify(tasks));
}

async function updateTask(taskId: string, updates: Partial<AITask>): Promise<AITask | null> {
  const queue = await loadQueue();
  const idx = queue.findIndex((t) => t.id === taskId);
  if (idx === -1) return null;
  queue[idx] = { ...queue[idx], ...updates, updatedAt: new Date().toISOString() };
  await persistQueue(queue);
  return queue[idx];
}

// --- Public API ---

export async function enqueueAITask(params: {
  noteId: string;
  noteContent: string;
  action: AITaskAction;
  style?: TransformStyle;
  language: 'ru' | 'en';
  versionLabel: string;
}): Promise<AITask> {
  const task: AITask = {
    id: generateId(),
    noteId: params.noteId,
    noteContent: params.noteContent,
    action: params.action,
    style: params.style,
    language: params.language,
    versionLabel: params.versionLabel,
    status: 'pending',
    attempt: 0,
    maxAttempts: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const queue = await loadQueue();
  queue.push(task);
  await persistQueue(queue);
  return task;
}

export async function getAllActiveTasks(): Promise<AITask[]> {
  const queue = await loadQueue();
  return queue.filter((t) => t.status === 'pending' || t.status === 'processing');
}

export async function removeTask(taskId: string): Promise<void> {
  const queue = await loadQueue();
  await persistQueue(queue.filter((t) => t.id !== taskId));
}

// --- Retry logic ---

function isRetryableError(error: Error): boolean {
  const msg = error.message || '';
  // Never retry license/validation errors
  if (error instanceof LicenseRequiredError || error instanceof UltraRequiredError) return false;
  // Retry on timeout
  if (msg.includes('время ожидания') || msg.includes('timeout') || error.name === 'AbortError') return true;
  // Retry on network errors
  if (msg.includes('Network') || msg.includes('fetch') || msg.includes('Failed to fetch')) return true;
  // Retry on generic server errors (error message from 5xx)
  if (msg.includes('Ошибка обработки') || msg.includes('Internal')) return true;
  return false;
}

function getRetryDelayMs(attempt: number): number {
  return RETRY_DELAYS_MS[attempt] ?? 3000;
}

// --- Auto-apply result as NoteVersion ---

async function applyResultToNote(noteId: string, result: string, label: string): Promise<void> {
  const notes = await getNotes();
  const note = notes.find((n) => n.id === noteId);
  if (!note) return; // note was deleted

  const newVersion: NoteVersion = {
    content: result,
    label,
    createdAt: new Date().toISOString(),
  };

  const updated: Note = {
    ...note,
    versions: [...(note.versions || []), newVersion],
    updatedAt: new Date().toISOString(),
  };

  await saveNote(updated);
}

// --- Task execution with retry ---

export async function processTask(
  task: AITask,
  onStatusChange: TaskStatusCallback,
  onChunk?: (taskId: string, partial: string) => void
): Promise<void> {
  // Mark as processing
  const processing = await updateTask(task.id, {
    status: 'processing',
    attempt: task.attempt + 1,
  });
  if (!processing) return;
  onStatusChange(processing);

  try {
    const result = await transformNote(
      task.noteContent,
      task.action,
      task.style,
      task.language,
      onChunk ? (partial) => onChunk(task.id, partial) : undefined
    );

    // Auto-apply result as new NoteVersion
    await applyResultToNote(task.noteId, result, task.versionLabel);

    // Clean up completed task
    await removeTask(task.id);
    onStatusChange({ ...processing, status: 'completed', result });
  } catch (err) {
    const error = err as Error;

    // Non-retryable: license/validation
    if (error instanceof LicenseRequiredError || error instanceof UltraRequiredError) {
      await removeTask(task.id);
      onStatusChange({ ...processing, status: 'failed', error: error.message });
      return;
    }

    const currentAttempt = task.attempt + 1;
    const canRetry = isRetryableError(error) && currentAttempt < task.maxAttempts;

    if (canRetry) {
      const delay = getRetryDelayMs(currentAttempt);
      const retrying = await updateTask(task.id, {
        status: 'pending',
        error: error.message,
      });
      if (!retrying) return;
      onStatusChange(retrying);

      // Schedule retry with backoff
      setTimeout(() => {
        processTask(retrying, onStatusChange, onChunk);
      }, delay);
    } else {
      // Final failure — cleanup
      await removeTask(task.id);
      onStatusChange({
        ...processing,
        status: 'failed',
        error: error.message || 'ИИ временно недоступен. Попробуйте позже.',
      });
    }
  }
}

// --- Recovery on app open ---

export async function recoverPendingTasks(
  onStatusChange: TaskStatusCallback,
  onChunk?: (taskId: string, partial: string) => void
): Promise<void> {
  const queue = await loadQueue();
  const now = Date.now();

  for (const task of queue) {
    const age = now - new Date(task.createdAt).getTime();

    // Clean up stale tasks (>1 hour)
    if (age > STALE_THRESHOLD_MS) {
      await removeTask(task.id);
      onStatusChange({ ...task, status: 'failed', error: 'Задача устарела' });
      continue;
    }

    // Reset processing → pending (app was killed mid-request)
    if (task.status === 'processing') {
      await updateTask(task.id, { status: 'pending' });
    }

    // Re-process active tasks
    if (task.status === 'pending' || task.status === 'processing') {
      if (task.attempt < task.maxAttempts) {
        const fresh = await loadQueue();
        const current = fresh.find((t) => t.id === task.id);
        if (current) {
          processTask(current, onStatusChange, onChunk);
        }
      } else {
        await removeTask(task.id);
        onStatusChange({ ...task, status: 'failed', error: 'Превышено число попыток' });
      }
    }
  }
}
