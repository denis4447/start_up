import { useAITasks } from '@/lib/ai-task-context';

export function useNoteAITask(noteId: string | undefined) {
  const { getTaskForNote, partialResults } = useAITasks();
  const task = noteId ? getTaskForNote(noteId) : null;
  const partialResult = task ? partialResults[task.id] : undefined;

  return {
    task,
    isProcessing: task?.status === 'processing',
    isPending: task?.status === 'pending',
    isActive: task != null,
    partialResult,
  };
}
