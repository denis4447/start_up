import { AppColors } from '@/constants/theme';
import AppIcon from '@/components/ui/app-icon';
import CopyToast from '@/components/copy-toast';
import MessageContextMenu from '@/components/message-context-menu';
import { useAppColors } from '@/hooks/use-app-colors';
import { checkBackendHealth, checkLicenseStatus, ensureAuthenticated, LicenseRequiredError, sendChatMessageWithRetry, type LicenseTier } from '@/lib/api';
import { shadow } from '@/lib/shadows';
import {
    createConversation,
    deleteConversation,
    generateId,
    getActiveConversationId,
    getConversations,
    getActiveEvents,
    getNotes,
    getUserName,
    migrateOldChatHistory,
    saveConversation,
    setActiveConversationId,
    type ChatConversation,
    type ChatMessage,
} from '@/lib/storage';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useRouter, type Href } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    Dimensions,
    FlatList,
    type GestureResponderEvent,
    Keyboard,
    Platform,
    Pressable,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import Animated, { Easing, FadeIn, FadeInUp, FadeOut, SlideInDown, SlideOutDown, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

const TAB_BAR_HEIGHT = 85;
const INPUT_GAP = 10;

export default function ChatScreen() {
  const router = useRouter();
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [conversations, setConversationsList] = useState<ChatConversation[]>([]);
  const [showChatList, setShowChatList] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [inputText, setInputText] = useState('');
  const plusRotation = useSharedValue(0);
  const plusScale = useSharedValue(1);
  const menuScale = useSharedValue(1);
  const menuRotation = useSharedValue(0);

  const plusAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${plusRotation.value}deg` },
      { scale: plusScale.value },
    ],
  }));

  const menuAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${menuRotation.value}deg` },
      { scale: menuScale.value },
    ],
  }));

  const animatePlus = () => {
    plusScale.value = withSequence(
      withTiming(0.7, { duration: 100 }),
      withSpring(1, { damping: 8, stiffness: 200 }),
    );
    plusRotation.value = withSequence(
      withTiming(90, { duration: 200 }),
      withTiming(0, { duration: 200 }),
    );
  };

  const animateMenu = () => {
    menuScale.value = withSequence(
      withTiming(0.75, { duration: 80 }),
      withSpring(1, { damping: 10, stiffness: 250 }),
    );
    menuRotation.value = withSequence(
      withTiming(180, { duration: 250 }),
      withTiming(0, { duration: 250 }),
    );
  };
  const [isLoading, setIsLoading] = useState(false);
  const [notesMode, setNotesMode] = useState(false);
  const [inputHeight, setInputHeight] = useState(44);
  const [gpt52Mode, setGpt52Mode] = useState(false);
  const [licenseTier, setLicenseTier] = useState<LicenseTier | null>(null);
  const [failedMsgId, setFailedMsgId] = useState<string | null>(null);
  const lastFailedPayload = useRef<{ message: string; history: Array<{ role: 'user' | 'assistant'; content: string }>; gpt52: boolean } | null>(null);
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [contextMenuMsg, setContextMenuMsg] = useState<ChatMessage | null>(null);
  const [contextMenuY, setContextMenuY] = useState(0);
  const [contextMenuIsUser, setContextMenuIsUser] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const clipboardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const streamAbortRef = useRef<AbortController | null>(null);
  const isSendingRef = useRef(false);
  const lastScrollRef = useRef(0);
  const flatListRef = useRef<FlatList>(null);
  const keyboardOffset = useSharedValue(TAB_BAR_HEIGHT);
  const c = useAppColors();

  const messages = conversation?.messages || [];

  useEffect(() => {
    if (Platform.OS === 'ios') {
      const showSub = Keyboard.addListener('keyboardWillShow', (e) => {
        const duration = e.duration || 250;
        keyboardOffset.value = withTiming(e.endCoordinates.height, {
          duration,
          easing: Easing.bezier(0.33, 0.01, 0, 1),
        });
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
      });
      const hideSub = Keyboard.addListener('keyboardWillHide', (e) => {
        const duration = e.duration || 250;
        keyboardOffset.value = withTiming(TAB_BAR_HEIGHT, {
          duration,
          easing: Easing.bezier(0.33, 0.01, 0, 1),
        });
      });
      return () => { showSub.remove(); hideSub.remove(); };
    } else {
      // Android with adjustPan: system pans the window (no viewport compression).
      // Track keyboard height for menu positioning; keyboardOffset stays constant.
      const ANDROID_KB_CURVE = Easing.bezier(0.4, 0, 0.2, 1); // FastOutSlowIn
      const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
        setKeyboardVisible(true);
        setKeyboardHeight(e.endCoordinates.height);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
      });
      const hideSub = Keyboard.addListener('keyboardDidHide', () => {
        setKeyboardVisible(false);
        setKeyboardHeight(0);
        flatListRef.current?.scrollToEnd({ animated: true });
      });
      return () => { showSub.remove(); hideSub.remove(); };
    }
  }, []);

  const inputAnimStyle = useAnimatedStyle(() => ({
    paddingBottom: keyboardOffset.value + INPUT_GAP,
  }));

  useFocusEffect(
    useCallback(() => {
      initChat();
      loadLicenseTier();
    }, [])
  );

  useEffect(() => {
    ensureAuthenticated().catch(() => {});
    // Abort any in-flight stream on unmount to prevent memory leaks
    return () => {
      streamAbortRef.current?.abort();
    };
  }, []);

  const initChat = async () => {
    await migrateOldChatHistory();
    const convs = await getConversations();
    setConversationsList(convs);

    const activeId = await getActiveConversationId();
    const active = activeId ? convs.find((c) => c.id === activeId) : null;

    if (active) {
      setConversation(active);
    } else if (convs.length > 0) {
      setConversation(convs[0]);
      await setActiveConversationId(convs[0].id);
    } else {
      await handleNewChat();
    }
  };

  const handleNewChat = async () => {
    // Don't create if there's already an empty "Новый чат"
    const hasEmpty = conversations.some((c) => c.title === 'Новый чат' && c.messages.length === 0);
    if (hasEmpty) {
      const empty = conversations.find((c) => c.title === 'Новый чат' && c.messages.length === 0)!;
      setConversation(empty);
      await setActiveConversationId(empty.id);
      setShowChatList(false);
      return;
    }

    const conv = createConversation();
    await saveConversation(conv);
    await setActiveConversationId(conv.id);
    setConversation(conv);
    setConversationsList((prev) => [conv, ...prev]);
    setShowChatList(false);
  };

  const handleSelectChat = async (conv: ChatConversation) => {
    setConversation(conv);
    await setActiveConversationId(conv.id);
    setShowChatList(false);
  };

  const handleDeleteChat = async (id: string) => {
    await deleteConversation(id);
    const updated = conversations.filter((c) => c.id !== id);
    setConversationsList(updated);
    if (conversation?.id === id) {
      if (updated.length > 0) {
        setConversation(updated[0]);
        await setActiveConversationId(updated[0].id);
      } else {
        await handleNewChat();
      }
    }
  };

  const loadLicenseTier = async () => {
    try {
      const status = await checkLicenseStatus();
      if (status.active && status.tier) {
        setLicenseTier(status.tier);
      } else {
        setLicenseTier(null);
        setGpt52Mode(false);
      }
    } catch {
      setLicenseTier(null);
    }
  };

  const updateConversation = async (conv: ChatConversation) => {
    setConversation({ ...conv });
    await saveConversation(conv);
    setConversationsList((prev) =>
      prev.map((c) => (c.id === conv.id ? { ...conv } : c))
    );
  };

  /** Collapse excessive whitespace and trailing spaces to save tokens */
  const sanitizeForContext = (text: string): string =>
    text.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+$/gm, '').trim();

  const sendMessage = async () => {
    if (!inputText.trim() || isLoading || !conversation) return;
    // Immediate lock to prevent double-send from rapid taps (React state is async)
    if (isSendingRef.current) return;
    isSendingRef.current = true;

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: inputText.trim(),
      timestamp: new Date().toISOString(),
    };

    const updatedMessages = [...messages, userMessage];
    const updatedConv = { ...conversation, messages: updatedMessages };

    // Auto-title on first user message
    if (conversation.title === 'Новый чат') {
      updatedConv.title = userMessage.content.slice(0, 40);
    }

    setConversation(updatedConv);
    setInputText('');
    setInputHeight(44);
    setIsLoading(true);
    let accumulatedText = '';

    try {
      const history = updatedMessages
        .filter((m) => m.id !== 'welcome' && m.id !== userMessage.id)
        .slice(-10)
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      let messageToSend = userMessage.content;
      const userName = await getUserName();

      if (notesMode) {
        const isUltra = licenseTier === 'ultra';
        const contextCharLimit = isUltra ? 100_000 : 60_000;
        const noteContentLimit = isUltra ? 500 : 200;
        const notesWindowDays = isUltra ? 30 : 14;

        // Archived events and locked notes are excluded from AI context
        const [freshNotes, freshEvents] = await Promise.all([getNotes(), getActiveEvents()]);
        const contextParts: string[] = [];

        const now = new Date();
        const notesWindowMs = notesWindowDays * 24 * 60 * 60 * 1000;
        const notesThreshold = new Date(now.getTime() - notesWindowMs);

        // SECURITY: locked notes are strictly excluded from AI context
        const recentNotes = freshNotes.filter((n) => !n.locked && new Date(n.updatedAt) >= notesThreshold);

        if (recentNotes.length > 0) {
          const notesSummary = recentNotes
            .map((n) => {
              // Only pass the original note content (note.content).
              // AI-generated derivatives live in note.versions[] and are excluded.
              const cleaned = sanitizeForContext(n.content);
              const trimmed = cleaned.length > noteContentLimit ? cleaned.slice(0, noteContentLimit) + '...' : cleaned;
              return `- [${n.title}]: ${trimmed}`;
            })
            .join('\n');
          contextParts.push(`[Мои заметки (за последние ${notesWindowDays} дней)]:\n${notesSummary}`);
        }

        const upcomingEvents = freshEvents
          .filter((e) => new Date(e.date) >= now)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .slice(0, 30);

        if (upcomingEvents.length > 0) {
          const eventsSummary = upcomingEvents
            .map((e) => `- ${e.date}${e.time ? ' ' + e.time : ''}: ${e.title}`)
            .join('\n');
          contextParts.push(`[Предстоящие события]:\n${eventsSummary}`);
        }

        if (contextParts.length > 0) {
          const context = contextParts.join('\n\n');
          const trimmedContext = context.slice(0, contextCharLimit);
          messageToSend = `Вопрос пользователя: ${userMessage.content}\n\nКонтекст для ответа (используй только если релевантно вопросу):\n${trimmedContext}`;
        } else {
          const noContextMsg: ChatMessage = {
            id: generateId(),
            role: 'assistant',
            content: `У вас пока нет заметок за последние ${notesWindowDays} дней и предстоящих событий. Добавьте их, и я смогу их анализировать.`,
            timestamp: new Date().toISOString(),
          };
          updatedConv.messages = [...updatedMessages, noContextMsg];
          await updateConversation(updatedConv);
          setIsLoading(false);
          return;
        }
      }

      if (userName) {
        messageToSend = `[Меня зовут ${userName}] ${messageToSend}`;
      }

      // Save payload for retry in case of failure
      lastFailedPayload.current = { message: messageToSend, history, gpt52: gpt52Mode };

      // Pre-flight health check — fast-fail before waiting 30s for timeout
      const alive = await checkBackendHealth();
      if (!alive) {
        const offlineMsg: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: '🔌 Сервер недоступен. Убедитесь, что backend запущен (npm run dev в папке backend).',
          timestamp: new Date().toISOString(),
        };
        setFailedMsgId(offlineMsg.id);
        updatedConv.messages = [...updatedMessages, offlineMsg];
        await updateConversation(updatedConv);
        setIsLoading(false);
        return;
      }

      // --- Streaming response ---
      accumulatedText = '';
      let firstChunkReceived = false;
      setStreamingText('');
      setIsStreaming(false);

      // Create AbortController for this stream (abortable on unmount)
      const abortCtrl = new AbortController();
      streamAbortRef.current = abortCtrl;

      await sendChatMessageWithRetry(
        messageToSend,
        history,
        (chunk) => {
          accumulatedText += chunk;
          if (!firstChunkReceived) {
            firstChunkReceived = true;
            setIsStreaming(true);
          }
          setStreamingText(accumulatedText);
        },
        gpt52Mode,
        () => {
          // onRetryReset: clear accumulated state before retry
          accumulatedText = '';
          firstChunkReceived = false;
          setStreamingText('');
          setIsStreaming(false);
        },
        abortCtrl.signal
      );

      // Stream completed — finalize message
      streamAbortRef.current = null;
      setIsStreaming(false);
      setStreamingText('');
      setFailedMsgId(null);
      lastFailedPayload.current = null;

      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: accumulatedText || 'Не удалось получить ответ. Попробуйте ещё раз.',
        timestamp: new Date().toISOString(),
      };

      updatedConv.messages = [...updatedMessages, assistantMessage];
      await updateConversation(updatedConv);
    } catch (err) {
      // Clean up streaming state on error
      setIsStreaming(false);
      setStreamingText('');

      if (err instanceof LicenseRequiredError) {
        const licenseMsg: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: '🔑 Для использования AI-чата необходима активная лицензия. Перенаправлю на экран активации...',
          timestamp: new Date().toISOString(),
        };
        updatedConv.messages = [...updatedMessages, licenseMsg];
        await updateConversation(updatedConv);
        setTimeout(() => router.push('/activation' as Href), 1500);
      } else {
        if (__DEV__) console.error('[Chat] streaming error:', err);

        // Preserve partial text if stream was interrupted mid-way
        if (accumulatedText.trim()) {
          const partialMsg: ChatMessage = {
            id: generateId(),
            role: 'assistant',
            content: accumulatedText + '\n\n⚠️ _Ответ прерван из-за ошибки соединения._',
            timestamp: new Date().toISOString(),
          };
          updatedConv.messages = [...updatedMessages, partialMsg];
          await updateConversation(updatedConv);
        } else {
          const isAlive = await checkBackendHealth();
          const errorContent = isAlive
            ? '⚠️ Не удалось получить ответ от ИИ после нескольких попыток.'
            : '🔌 Сервер недоступен. Убедитесь, что backend запущен (npm run dev в папке backend).';
          const errorMsgObj: ChatMessage = {
            id: generateId(),
            role: 'assistant',
            content: errorContent,
            timestamp: new Date().toISOString(),
          };
          setFailedMsgId(errorMsgObj.id);
          updatedConv.messages = [...updatedMessages, errorMsgObj];
          await updateConversation(updatedConv);
        }
      }
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      setStreamingText('');
      isSendingRef.current = false;
      streamAbortRef.current = null;
    }
  };

  const retryLastMessage = async () => {
    if (!lastFailedPayload.current || !conversation || isLoading) return;
    const { message, history, gpt52 } = lastFailedPayload.current;

    // Capture failedMsgId before resetting (React state is async)
    const prevFailedId = failedMsgId;
    setIsLoading(true);
    setFailedMsgId(null);

    // Remove the error message bubble from conversation
    const updatedConv = { ...conversation };
    const cleanMessages = messages.filter((m) => m.id !== prevFailedId);

    try {
      let accumulatedText = '';
      let firstChunkReceived = false;
      setStreamingText('');
      setIsStreaming(false);

      const abortCtrl = new AbortController();
      streamAbortRef.current = abortCtrl;

      await sendChatMessageWithRetry(
        message,
        history,
        (chunk) => {
          accumulatedText += chunk;
          if (!firstChunkReceived) {
            firstChunkReceived = true;
            setIsStreaming(true);
          }
          setStreamingText(accumulatedText);
        },
        gpt52,
        () => {
          accumulatedText = '';
          firstChunkReceived = false;
          setStreamingText('');
          setIsStreaming(false);
        },
        abortCtrl.signal
      );

      streamAbortRef.current = null;
      setIsStreaming(false);
      setStreamingText('');
      lastFailedPayload.current = null;

      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: accumulatedText || 'Не удалось получить ответ.',
        timestamp: new Date().toISOString(),
      };

      updatedConv.messages = [...cleanMessages, assistantMessage];
      await updateConversation(updatedConv);
    } catch (err: any) {
      setIsStreaming(false);
      setStreamingText('');
      if (__DEV__) console.error('[Chat] retry failed:', err);
      const retryErrorMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: '⚠️ Повторная попытка не удалась. Проверьте подключение и попробуйте позже.',
        timestamp: new Date().toISOString(),
      };
      setFailedMsgId(retryErrorMsg.id);
      updatedConv.messages = [...cleanMessages, retryErrorMsg];
      await updateConversation(updatedConv);
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      setStreamingText('');
    }
  };

  // ── Long-press context menu handlers ──

  const handleMessageLongPress = (msg: ChatMessage, isUser: boolean, event: GestureResponderEvent) => {
    // Haptic feedback (native only)
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    const { pageY } = event.nativeEvent;
    const screenH = Dimensions.get('window').height;
    const clampedY = Math.min(Math.max(pageY - 60, 80), screenH - 200);

    setContextMenuMsg(msg);
    setContextMenuY(clampedY);
    setContextMenuIsUser(isUser);
    setContextMenuVisible(true);
  };

  const handleCopyMessage = async () => {
    if (!contextMenuMsg) return;

    try {
      await Clipboard.setStringAsync(contextMenuMsg.content);
      setToastVisible(true);

      // Auto-clear clipboard after 45s if in notes mode (sensitive content)
      if (notesMode) {
        if (clipboardTimerRef.current) clearTimeout(clipboardTimerRef.current);
        const copiedText = contextMenuMsg.content;
        clipboardTimerRef.current = setTimeout(async () => {
          try {
            const current = await Clipboard.getStringAsync();
            if (current === copiedText) {
              await Clipboard.setStringAsync('');
            }
          } catch {
            // Silently fail — app may be backgrounded
          }
          clipboardTimerRef.current = null;
        }, 45_000);
      }
    } catch (err) {
      if (__DEV__) console.error('[Chat] clipboard copy failed:', err);
    }
  };

  const handleDismissContextMenu = () => {
    setContextMenuVisible(false);
    setContextMenuMsg(null);
  };

  const handleDismissToast = useCallback(() => {
    setToastVisible(false);
  }, []);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const TypingIndicator = () => {
    const dot1 = useSharedValue(0);
    const dot2 = useSharedValue(0);
    const dot3 = useSharedValue(0);

    React.useEffect(() => {
      dot1.value = withRepeat(withSequence(withTiming(1, { duration: 400 }), withTiming(0, { duration: 400 })), -1);
      dot2.value = withRepeat(withDelay(200, withSequence(withTiming(1, { duration: 400 }), withTiming(0, { duration: 400 }))), -1);
      dot3.value = withRepeat(withDelay(400, withSequence(withTiming(1, { duration: 400 }), withTiming(0, { duration: 400 }))), -1);
    }, []);

    const style1 = useAnimatedStyle(() => ({ opacity: 0.3 + dot1.value * 0.7, transform: [{ translateY: -dot1.value * 4 }] }));
    const style2 = useAnimatedStyle(() => ({ opacity: 0.3 + dot2.value * 0.7, transform: [{ translateY: -dot2.value * 4 }] }));
    const style3 = useAnimatedStyle(() => ({ opacity: 0.3 + dot3.value * 0.7, transform: [{ translateY: -dot3.value * 4 }] }));

    return (
      <Animated.View entering={FadeInUp.duration(300)} style={[styles.typingContainer, { backgroundColor: c.cardBackground }]}>
        <Text style={[styles.typingLabel, { color: c.textMuted }]}>ИИ думает</Text>
        <View style={styles.typingDots}>
          <Animated.View style={[styles.typingDot, { backgroundColor: c.textMuted }, style1]} />
          <Animated.View style={[styles.typingDot, { backgroundColor: c.textMuted }, style2]} />
          <Animated.View style={[styles.typingDot, { backgroundColor: c.textMuted }, style3]} />
        </View>
      </Animated.View>
    );
  };

  const StreamingBubble = React.memo(({ text }: { text: string }) => (
    <Pressable
      onLongPress={(e) => {
        const tempMsg: ChatMessage = {
          id: 'streaming',
          role: 'assistant',
          content: text,
          timestamp: new Date().toISOString(),
        };
        handleMessageLongPress(tempMsg, false, e);
      }}
      delayLongPress={400}
    >
      <Animated.View
        entering={FadeIn.duration(200)}
        style={[
          styles.messageBubble,
          styles.assistantBubble,
          { backgroundColor: c.cardBackground },
        ]}
      >
        <Text
          style={[styles.messageText, { color: c.textPrimary }]}
          selectable={Platform.OS === 'web'}
        >
          {text}
          <Text style={{ opacity: 0.4 }}>▍</Text>
        </Text>
      </Animated.View>
    </Pressable>
  ));

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    const isFailedMsg = item.id === failedMsgId;

    return (
      <Pressable
        onLongPress={(e) => handleMessageLongPress(item, isUser, e)}
        delayLongPress={400}
        {...(Platform.OS === 'web' ? {
          // @ts-ignore — onContextMenu is web-only
          onContextMenu: (e: any) => { e.preventDefault(); handleMessageLongPress(item, isUser, e); },
        } : {})}
      >
        <Animated.View
          entering={FadeInUp.duration(300)}
          style={[
            styles.messageBubble,
            isUser
              ? [styles.userBubble, { backgroundColor: c.cardBackgroundAccent }]
              : [styles.assistantBubble, { backgroundColor: c.cardBackground }],
          ]}
        >
          <Text
            style={[styles.messageText, { color: c.textPrimary }]}
            selectable={Platform.OS === 'web'}
          >
            {item.content}
          </Text>
          {isFailedMsg && !isLoading && (
            <TouchableOpacity
              onPress={retryLastMessage}
              style={[styles.retryButton, { backgroundColor: c.accent }]}
              activeOpacity={0.7}
            >
              <Text style={styles.retryButtonText}>🔄 Повторить</Text>
            </TouchableOpacity>
          )}
          <Text style={[styles.timeText, { color: isUser ? c.textSecondary : c.textMuted }]}>
            {formatTime(item.timestamp)}
          </Text>
        </Animated.View>
      </Pressable>
    );
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) return 'Сегодня';
    if (diff < 172800000) return 'Вчера';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };

  const renderChatListItem = ({ item }: { item: ChatConversation }) => {
    const isActive = item.id === conversation?.id;
    const lastMsg = item.messages.filter((m) => m.role !== 'assistant' || m.id !== 'welcome').slice(-1)[0];
    const preview = lastMsg?.content.slice(0, 60) || 'Пустой чат';

    return (
      <View style={[styles.chatListItem, isActive && { backgroundColor: c.cardBackgroundAccent }]}>
        <TouchableOpacity
          style={styles.chatListItemContent}
          onPress={() => handleSelectChat(item)}
          activeOpacity={0.7}
        >
          <Text style={[styles.chatListTitle, { color: c.textPrimary }]} numberOfLines={1}>{item.title}</Text>
          <Text style={[styles.chatListPreview, { color: c.textMuted }]} numberOfLines={1}>{preview}</Text>
        </TouchableOpacity>
        <View style={styles.chatListItemRight}>
          <Text style={[styles.chatListDate, { color: c.textMuted }]}>{formatDate(item.updatedAt)}</Text>
          <TouchableOpacity
            onPress={() => {
              if (Platform.OS === 'web') {
                if (window.confirm(`Удалить чат "${item.title}"?`)) {
                  handleDeleteChat(item.id);
                }
              } else {
                Alert.alert('Удалить чат?', item.title, [
                  { text: 'Отмена', style: 'cancel' },
                  { text: 'Удалить', style: 'destructive', onPress: () => handleDeleteChat(item.id) },
                ]);
              }
            }}
            style={styles.chatDeleteBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={[styles.chatDeleteIcon, { color: c.textMuted }]}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: c.screenBackground }]} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => { Keyboard.dismiss(); animateMenu(); setShowChatList(true); }} style={[styles.menuBtn, { backgroundColor: c.cardBackground }]}>
            <Animated.View style={[styles.menuLines, menuAnimStyle]}>
              <View style={[styles.menuLine, { backgroundColor: c.textPrimary }]} />
              <View style={[styles.menuLine, styles.menuLineShort, { backgroundColor: c.textPrimary }]} />
              <View style={[styles.menuLine, { backgroundColor: c.textPrimary }]} />
            </Animated.View>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: c.textPrimary }]}>Чат</Text>
          <View style={[styles.betaBadge, { backgroundColor: c.accent }]}>
            <Text style={styles.betaText}>Beta</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={() => { animatePlus(); handleNewChat(); }}
            style={[styles.newChatBtn, { backgroundColor: c.accent }]}
            activeOpacity={0.6}
          >
            <Animated.View style={[styles.plusIcon, plusAnimStyle]}>
              <View style={styles.plusH} />
              <View style={styles.plusV} />
            </Animated.View>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.avatarSmall, { backgroundColor: c.cardBackground }]} onPress={() => router.push('/profile' as Href)}>
            <AppIcon name="user" size={20} color={c.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Chat List Panel */}
      {showChatList && (
        <>
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(200)}
            style={styles.modalOverlay}
          >
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowChatList(false)} />
          </Animated.View>
          <Animated.View
            entering={SlideInDown.duration(320).easing(Easing.out(Easing.cubic))}
            exiting={SlideOutDown.duration(220).easing(Easing.in(Easing.cubic))}
            style={[
              styles.chatListContainer,
              { backgroundColor: c.screenBackground },
              Platform.OS === 'android' && keyboardVisible && { bottom: keyboardHeight },
            ]}
          >
            <View style={styles.chatListHandle}>
              <View style={[styles.handleBar, { backgroundColor: c.textMuted }]} />
            </View>
            <View style={styles.chatListHeader}>
              <Text style={[styles.chatListHeaderTitle, { color: c.textPrimary }]}>История чатов</Text>
              <TouchableOpacity onPress={() => setShowChatList(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ fontSize: 22, color: c.textMuted }}>✕</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.newChatButton, { backgroundColor: c.accent }]}
              onPress={handleNewChat}
            >
              <Text style={styles.newChatButtonText}>+ Новый чат</Text>
            </TouchableOpacity>
            <FlatList
              data={conversations}
              keyExtractor={(item) => item.id}
              renderItem={renderChatListItem}
              contentContainerStyle={{ paddingBottom: 8 }}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <Text style={[styles.chatListEmpty, { color: c.textMuted }]}>Нет чатов</Text>
              }
            />
          </Animated.View>
        </>
      )}

      <View style={styles.togglesContainer}>
        <View style={[styles.notesToggleRow, { backgroundColor: c.cardBackground }]}>
          <AppIcon name="clipboard" size={16} color={c.accent} />
          <Text style={[styles.notesToggleLabel, { color: c.textPrimary }]}>Анализ заметок и событий</Text>
          <Switch
            value={notesMode}
            onValueChange={setNotesMode}
            trackColor={{ false: c.border, true: c.accent }}
            thumbColor="#fff"
          />
        </View>
        <TouchableOpacity
          activeOpacity={licenseTier === 'ultra' ? 1 : 0.7}
          onPress={() => {
            if (licenseTier !== 'ultra') {
              Alert.alert(
                '⚡ GPT 5.2 — Ultra',
                'Модель GPT 5.2 доступна только с подпиской Ultra. \n\nРазблокируйте GPT 5.2, безлимитные запросы и голосовые заметки.',
                [
                  { text: 'Активировать Ultra', onPress: () => router.push('/activation' as any) },
                  { text: 'Позже', style: 'cancel' },
                ]
              );
            }
          }}
        >
          <View style={[styles.notesToggleRow, { backgroundColor: c.cardBackground, opacity: licenseTier === 'ultra' ? 1 : 0.6 }]}>
            <Text style={styles.notesToggleIcon}>⚡</Text>
            <Text style={[styles.notesToggleLabel, { color: c.textPrimary }]}>GPT 5.2</Text>
            <View style={[styles.ultraBadge, { backgroundColor: licenseTier === 'ultra' ? c.ultra : c.textMuted }]}>
              <Text style={styles.ultraBadgeText}>{licenseTier === 'ultra' ? 'ULTRA' : '🔒'}</Text>
            </View>
            <Switch
              value={gpt52Mode}
              onValueChange={(val) => {
                if (licenseTier === 'ultra') {
                  setGpt52Mode(val);
                } else {
                  Alert.alert(
                    '⚡ GPT 5.2 — Ultra',
                    'Модель GPT 5.2 доступна только с подпиской Ultra. \n\nРазблокируйте GPT 5.2, безлимитные запросы и голосовые заметки.',
                    [
                      { text: 'Активировать Ultra', onPress: () => router.push('/activation' as any) },
                      { text: 'Позже', style: 'cancel' },
                    ]
                  );
                }
              }}
              trackColor={{ false: c.border, true: c.ultra }}
              thumbColor="#fff"
              disabled={licenseTier !== 'ultra'}
            />
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.container}>
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={[styles.messagesList, messages.length === 0 && { flex: 1, justifyContent: 'center' }]}
          onContentSizeChange={() => {
            // Throttle scroll during streaming to prevent jank on weak Android devices
            const now = Date.now();
            if (isStreaming && now - lastScrollRef.current < 150) return;
            lastScrollRef.current = now;
            flatListRef.current?.scrollToEnd({ animated: !isStreaming });
          }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={
            isLoading ? (
              isStreaming && streamingText ? <StreamingBubble text={streamingText} /> : <TypingIndicator />
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <AppIcon name="chat" size={48} color={c.textMuted} />
              <Text style={[styles.emptyChatText, { color: c.textMuted }]}>Новый чат. Задайте любой вопрос!</Text>
            </View>
          }
        />

        <Animated.View style={[styles.inputContainer, { backgroundColor: c.screenBackground }, inputAnimStyle]} renderToHardwareTextureAndroid>
          <TextInput
            style={[styles.input, { backgroundColor: c.cardBackground, color: c.textPrimary, height: inputHeight }]}
            placeholder="Напишите сообщение..."
            placeholderTextColor={c.placeholder}
            value={inputText}
            onChangeText={(text) => {
              setInputText(text);
              if (!text) setInputHeight(44);
            }}
            onContentSizeChange={(e) => {
              const h = e.nativeEvent.contentSize.height;
              setInputHeight(Math.min(Math.max(h, 44), 120));
            }}
            multiline
            maxLength={4000}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || isLoading) && styles.sendButtonDisabled]}
            onPress={sendMessage}
            disabled={!inputText.trim() || isLoading}
          >
            <Text style={styles.sendIcon}>➤</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      <MessageContextMenu
        visible={contextMenuVisible}
        onCopy={handleCopyMessage}
        onDismiss={handleDismissContextMenu}
        bubbleY={contextMenuY}
        isUser={contextMenuIsUser}
      />
      <CopyToast
        message="Текст скопирован"
        visible={toastVisible}
        onDismiss={handleDismissToast}
      />
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuLines: {
    gap: 4,
    alignItems: 'flex-start',
  },
  menuLine: {
    width: 18,
    height: 2,
    borderRadius: 1,
  },
  menuLineShort: {
    width: 12,
  },
  newChatBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  plusIcon: {
    width: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  plusH: {
    position: 'absolute',
    width: 18,
    height: 2,
    borderRadius: 1,
    backgroundColor: AppColors.textWhite,
  },
  plusV: {
    position: 'absolute',
    width: 2,
    height: 18,
    borderRadius: 1,
    backgroundColor: AppColors.textWhite,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 100,
  },
  chatListContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '80%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 0,
    paddingHorizontal: 20,
    paddingBottom: 95,
    zIndex: 101,
  },
  chatListHandle: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    opacity: 0.4,
  },
  chatListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  chatListHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  newChatButton: {
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  newChatButtonText: {
    color: AppColors.textWhite,
    fontSize: 15,
    fontWeight: '700',
  },
  chatListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  chatListItemContent: {
    flex: 1,
    marginRight: 8,
  },
  chatListTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  chatListPreview: {
    fontSize: 13,
  },
  chatListItemRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  chatDeleteBtn: {
    padding: 2,
  },
  chatDeleteIcon: {
    fontSize: 14,
  },
  chatListDate: {
    fontSize: 11,
  },
  chatListEmpty: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
  },
  emptyChat: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyChatEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyChatText: {
    fontSize: 15,
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: AppColors.textPrimary,
  },
  betaBadge: {
    backgroundColor: AppColors.accent,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  betaText: {
    color: AppColors.textWhite,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  togglesContainer: {
    gap: 4,
  },
  notesToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: AppColors.cardBackground,
    marginHorizontal: 16,
    borderRadius: 14,
    marginBottom: 0,
  },
  ultraBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  ultraBadgeText: {
    color: AppColors.textWhite,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  notesToggleIcon: {
    fontSize: 16,
  },
  notesToggleLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: AppColors.textPrimary,
  },
  avatarSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: AppColors.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarIcon: {
    fontSize: 20,
  },
  container: {
    flex: 1,
  },
  messagesList: {
    padding: 20,
    paddingBottom: 10,
  },
  messageBubble: {
    maxWidth: '78%',
    padding: 14,
    borderRadius: 18,
    marginBottom: 10,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: AppColors.cardBackgroundAccent,
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: AppColors.cardBackground,
    borderBottomLeftRadius: 4,
    ...shadow({ offsetY: 1, opacity: 0.05, radius: 4, elevation: 2 }),
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  userText: {
    color: AppColors.textPrimary,
  },
  assistantText: {
    color: AppColors.textPrimary,
  },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  timeText: {
    fontSize: 11,
    marginTop: 4,
  },
  userTime: {
    color: AppColors.textSecondary,
    textAlign: 'right',
  },
  assistantTime: {
    color: AppColors.textMuted,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 10,
    backgroundColor: AppColors.screenBackground,
  },
  input: {
    flex: 1,
    backgroundColor: AppColors.cardBackground,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontSize: 15,
    color: AppColors.textPrimary,
    minHeight: 44,
    maxHeight: 120,
    textAlignVertical: 'center',
    ...shadow({ offsetY: 1, opacity: 0.05, radius: 4, elevation: 2 }),
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: AppColors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendIcon: {
    color: AppColors.textWhite,
    fontSize: 18,
  },
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: AppColors.cardBackground,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    marginBottom: 10,
    gap: 8,
    ...shadow({ offsetY: 1, opacity: 0.05, radius: 4, elevation: 2 }),
  },
  typingLabel: {
    fontSize: 13,
    color: AppColors.textMuted,
    fontStyle: 'italic',
  },
  typingDots: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: AppColors.textMuted,
  },
});
