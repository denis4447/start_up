import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  type AITask,
  type AITaskAction,
  enqueueAITask,
  getAllActiveTasks,
  processTask,
  recoverPendingTasks,
} from './ai-task-queue';
import type { TransformStyle } from './api';

type AITaskMap = Record<string, AITask>; // keyed by noteId

interface AITaskContextType {
  tasksByNote: AITaskMap;
  submitTask: (params: {
    noteId: string;
    noteContent: string;
    action: AITaskAction;
    style?: TransformStyle;
    language: 'ru' | 'en';
    versionLabel: string;
  }) => Promise<AITask>;
  getTaskForNote: (noteId: string) => AITask | null;
  partialResults: Record<string, string>;
}

const AITaskContext = createContext<AITaskContextType>({
  tasksByNote: {},
  submitTask: async () => {
    throw new Error('AITaskProvider not mounted');
  },
  getTaskForNote: () => null,
  partialResults: {},
});

export function AITaskProvider({ children }: { children: React.ReactNode }) {
  const [tasksByNote, setTasksByNote] = useState<AITaskMap>({});
  const [partialResults, setPartialResults] = useState<Record<string, string>>({});
  const initializedRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const handleStatusChange = useCallback((task: AITask) => {
    setTasksByNote((prev) => {
      if (task.status === 'completed' || task.status === 'failed') {
        const next = { ...prev };
        delete next[task.noteId];
        return next;
      }
      return { ...prev, [task.noteId]: task };
    });

    // Clear partial results on completion/failure
    if (task.status === 'completed' || task.status === 'failed') {
      setPartialResults((prev) => {
        const next = { ...prev };
        delete next[task.id];
        return next;
      });
    }
  }, []);

  const handleChunk = useCallback((taskId: string, partial: string) => {
    setPartialResults((prev) => ({ ...prev, [taskId]: partial }));
  }, []);

  // Initialize: load active tasks and recover interrupted ones
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    (async () => {
      const active = await getAllActiveTasks();
      const map: AITaskMap = {};
      for (const t of active) {
        map[t.noteId] = t;
      }
      setTasksByNote(map);

      await recoverPendingTasks(handleStatusChange, handleChunk);
    })();
  }, [handleStatusChange, handleChunk]);

  // Re-recover when app comes back to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        recoverPendingTasks(handleStatusChange, handleChunk);
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [handleStatusChange, handleChunk]);

  const submitTask = useCallback(
    async (params: {
      noteId: string;
      noteContent: string;
      action: AITaskAction;
      style?: TransformStyle;
      language: 'ru' | 'en';
      versionLabel: string;
    }) => {
      const task = await enqueueAITask(params);
      setTasksByNote((prev) => ({ ...prev, [task.noteId]: task }));
      processTask(task, handleStatusChange, handleChunk);
      return task;
    },
    [handleStatusChange, handleChunk]
  );

  const getTaskForNote = useCallback(
    (noteId: string) => tasksByNote[noteId] || null,
    [tasksByNote]
  );

  return (
    <AITaskContext.Provider value={{ tasksByNote, submitTask, getTaskForNote, partialResults }}>
      {children}
    </AITaskContext.Provider>
  );
}

export function useAITasks() {
  return useContext(AITaskContext);
}
