import { AppColors } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { LicenseRequiredError, structureNote } from '@/lib/api';
import { shadow } from '@/lib/shadows';
import { generateId, saveNote, type Note } from '@/lib/storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function NewNoteScreen() {
  const router = useRouter();
  const { ai } = useLocalSearchParams<{ ai?: string }>();
  const isAiMode = ai === '1';
  const c = useAppColors();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);

  const handleSave = async () => {
    if (!title.trim() && !content.trim()) return;
    setIsSaving(true);

    const note: Note = {
      id: generateId(),
      title: title.trim() || 'Без названия',
      content: content.trim(),
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveNote(note);
    setIsSaving(false);
    router.back();
  };

  const handleGenerate = async () => {
    if (!aiPrompt.trim() || isGenerating) return;
    setIsGenerating(true);
    try {
      const result = await structureNote(
        `Создай структурированную заметку на тему: ${aiPrompt.trim()}`,
        'ru'
      );

      if (!result || !result.trim()) {
        throw new Error('AI вернул пустой ответ. Попробуйте ещё раз.');
      }

      const trimmedResult = result.trim();

      // Extract title: try first markdown heading, otherwise first 50 chars
      const headingMatch = trimmedResult.match(/^#{1,3}\s+(.+)/m);
      const extractedTitle = headingMatch
        ? headingMatch[1].trim().slice(0, 60)
        : trimmedResult.split('\n')[0].replace(/^[#*\->\s]+/, '').trim().slice(0, 60);

      setTitle(extractedTitle || aiPrompt.trim().slice(0, 40));
      setContent(trimmedResult);
      setAiGenerated(true);
    } catch (err) {
      if (err instanceof LicenseRequiredError) {
        if (Platform.OS === 'web') {
          window.alert('Для AI-функций необходима активная лицензия.');
        } else {
          const { Alert } = require('react-native');
          Alert.alert('Лицензия', 'Для AI-функций необходима активная лицензия.', [
            { text: 'Активировать', onPress: () => router.push('/activation' as any) },
            { text: 'Отмена', style: 'cancel' },
          ]);
        }
      } else {
        if (__DEV__) console.error('[NewNote] generate error:', (err as Error).message);
        const isTimeout = (err as Error).message?.includes('время ожидания') || (err as Error).message?.includes('timeout');
        const msg = isTimeout
          ? 'Превышено время ожидания. Попробуйте ещё раз или сократите описание.'
          : 'Не удалось сгенерировать заметку. Проверьте подключение к серверу.';
        if (Platform.OS === 'web') {
          window.alert(msg);
        } else {
          const { Alert } = require('react-native');
          Alert.alert('Ошибка', msg, [
            { text: 'Повторить', onPress: () => handleGenerate() },
            { text: 'Закрыть', style: 'cancel' },
          ]);
        }
      }
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: c.screenBackground }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.backButton, { color: c.textPrimary }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.textPrimary }]}>
          {isAiMode ? 'AI заметка' : 'Новая заметка'}
        </Text>
        <TouchableOpacity
          style={[styles.saveBtn, (isSaving || (!title.trim() && !content.trim())) && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={isSaving || (!title.trim() && !content.trim())}
        >
          <Text style={styles.saveBtnText}>{isSaving ? '...' : 'Сохр.'}</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {isAiMode && !aiGenerated && (
            <Animated.View entering={FadeInDown.duration(400)} style={[styles.aiCard, { backgroundColor: c.cardBackground }]}>
              <View style={styles.aiCardHeader}>
                <Text style={styles.aiCardEmoji}>✨</Text>
                <Text style={[styles.aiCardTitle, { color: c.textPrimary }]}>AI-генерация</Text>
              </View>
              <Text style={[styles.aiCardDesc, { color: c.textSecondary }]}>
                Опишите тему или идею, и AI создаст структурированную заметку
              </Text>
              <TextInput
                style={[styles.aiPromptInput, { color: c.textPrimary, backgroundColor: c.screenBackground, borderColor: c.border }]}
                placeholder="Например: План подготовки к экзамену по математике..."
                placeholderTextColor={c.placeholder}
                value={aiPrompt}
                onChangeText={setAiPrompt}
                multiline
                textAlignVertical="top"
                autoFocus
              />
              <TouchableOpacity
                style={[styles.generateBtn, { backgroundColor: c.accent }, isGenerating && styles.saveBtnDisabled]}
                onPress={handleGenerate}
                disabled={isGenerating || !aiPrompt.trim()}
              >
                {isGenerating ? (
                  <View style={styles.generatingRow}>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.generateBtnText}>Генерация...</Text>
                  </View>
                ) : (
                  <Text style={styles.generateBtnText}>✨ Сгенерировать</Text>
                )}
              </TouchableOpacity>
            </Animated.View>
          )}

          {(!isAiMode || aiGenerated) && (
            <>
              {aiGenerated && (
                <Animated.View entering={FadeInDown.duration(300)} style={[styles.aiSuccessBadge, { backgroundColor: c.cardBackground }]}>
                  <Text style={styles.aiSuccessIcon}>✅</Text>
                  <Text style={[styles.aiSuccessText, { color: c.textSecondary }]}>Сгенерировано AI — можете отредактировать</Text>
                </Animated.View>
              )}
              <Animated.View entering={FadeInDown.duration(400)}>
                <TextInput
                  style={[styles.titleInput, { color: c.textPrimary, borderBottomColor: c.border }]}
                  placeholder="Название заметки"
                  placeholderTextColor={c.placeholder}
                  value={title}
                  onChangeText={setTitle}
                  autoFocus={!isAiMode}
                />
              </Animated.View>
              <Animated.View entering={FadeInUp.duration(500).delay(100)}>
                <TextInput
                  style={[styles.contentInput, { color: c.textPrimary }]}
                  placeholder="Начните писать..."
                  placeholderTextColor={c.placeholder}
                  value={content}
                  onChangeText={setContent}
                  multiline
                  textAlignVertical="top"
                />
              </Animated.View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: AppColors.screenBackground,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backButton: {
    fontSize: 24,
    color: AppColors.textPrimary,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: AppColors.textPrimary,
  },
  saveBtn: {
    backgroundColor: AppColors.accent,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 10,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    color: AppColors.textWhite,
    fontWeight: '600',
    fontSize: 14,
  },
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  titleInput: {
    fontSize: 24,
    fontWeight: 'bold',
    color: AppColors.textPrimary,
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
    paddingBottom: 12,
  },
  contentInput: {
    fontSize: 16,
    color: AppColors.textPrimary,
    lineHeight: 24,
    minHeight: 400,
  },
  aiCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    ...shadow({ offsetY: 2, opacity: 0.06, radius: 8, elevation: 3 }),
  },
  aiCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  aiCardEmoji: {
    fontSize: 20,
  },
  aiCardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  aiCardDesc: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  aiPromptInput: {
    fontSize: 15,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    minHeight: 100,
    marginBottom: 16,
    lineHeight: 22,
  },
  generateBtn: {
    alignSelf: 'stretch',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  generateBtnText: {
    color: AppColors.textWhite,
    fontWeight: '600',
    fontSize: 16,
  },
  generatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aiSuccessBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  aiSuccessIcon: {
    fontSize: 16,
  },
  aiSuccessText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
