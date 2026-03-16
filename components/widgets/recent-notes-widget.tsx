import AnimatedPressable from '@/components/animated-pressable';
import AppIcon from '@/components/ui/app-icon';
import { AppColors } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { useAITasks } from '@/lib/ai-task-context';
import { shadow } from '@/lib/shadows';
import { getNotes, type Note } from '@/lib/storage';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter, type Href } from 'expo-router';
import React, { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

export type RecentNotesWidgetRef = { refresh: () => Promise<void> };

const RecentNotesWidget = forwardRef<RecentNotesWidgetRef>(function RecentNotesWidget(_props, ref) {
  const router = useRouter();
  const c = useAppColors();
  const { tasksByNote } = useAITasks();
  const [notes, setNotes] = useState<Note[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadNotes();
    }, [])
  );

  const loadNotes = async () => {
    const data = await getNotes();
    setNotes(data.slice(0, 2));
  };

  useImperativeHandle(ref, () => ({ refresh: loadNotes }), []);

  return (
    <Animated.View entering={FadeInDown.duration(600).delay(600)}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.textPrimary }]}>Последние заметки</Text>
        <TouchableOpacity onPress={() => router.push('/notes' as Href)}>
          <Text style={styles.seeAll}>Все</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.notesRow}>
        {notes.length === 0 ? (
          <TouchableOpacity
            style={[styles.noteCard, { backgroundColor: c.cardBackground }]}
            onPress={() => router.push('/notes' as Href)}
            activeOpacity={0.8}
          >
            <Text style={[styles.noteTitle, { color: c.textPrimary }]}>Нет заметок</Text>
            <Text style={[styles.noteContent, { color: c.textSecondary }]}>Нажмите, чтобы создать первую заметку</Text>
          </TouchableOpacity>
        ) : (
          notes.map((note) => (
            <AnimatedPressable
              key={note.id}
              style={[styles.noteCard, { backgroundColor: c.cardBackground }]}
              onPress={() => router.push(`/notes/${note.id}` as Href)}
            >
              <View style={styles.noteTitleRow}>
                {note.locked && <AppIcon name="lock" size={14} color={c.textMuted} style={{ marginRight: 4 }} />}
                <Text style={[styles.noteTitle, { color: c.textPrimary, flex: 1 }]} numberOfLines={1}>
                  {note.title}
                </Text>
                {tasksByNote[note.id] && (
                  <ActivityIndicator size="small" color={c.accent} style={styles.aiSpinner} />
                )}
              </View>
              <Text style={[styles.noteContent, { color: note.locked ? c.textMuted : c.textSecondary, fontStyle: note.locked ? 'italic' : 'normal' }]} numberOfLines={2}>
                {note.locked ? 'Заметка защищена паролем' : note.content}
              </Text>
            </AnimatedPressable>
          ))
        )}
      </View>
    </Animated.View>
  );
});

export default RecentNotesWidget;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: AppColors.textPrimary,
  },
  seeAll: {
    fontSize: 14,
    color: AppColors.accent,
    fontWeight: '600',
  },
  notesRow: {
    flexDirection: 'column',
    gap: 12,
    marginBottom: 100,
  },
  noteCard: {
    width: '100%',
    backgroundColor: AppColors.cardBackground,
    borderRadius: 16,
    padding: 16,
    ...shadow({ offsetY: 2, opacity: 0.06, radius: 8, elevation: 3 }),
  },
  noteTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: AppColors.textPrimary,
  },
  aiSpinner: {
    marginLeft: 6,
  },
  noteContent: {
    fontSize: 13,
    color: AppColors.textSecondary,
    lineHeight: 18,
  },
});
