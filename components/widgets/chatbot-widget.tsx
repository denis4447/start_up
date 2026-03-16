import AnimatedPressable from '@/components/animated-pressable';
import AppIcon from '@/components/ui/app-icon';
import { AppColors } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { shadow } from '@/lib/shadows';
import { useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

export default function ChatbotWidget() {
  const router = useRouter();
  const c = useAppColors();
  const [inputText, setInputText] = useState('');

  const handleSend = () => {
    if (inputText.trim()) {
      router.push('/(tabs)/chat' as Href);
      setInputText('');
    }
  };

  return (
    <Animated.View entering={FadeInDown.duration(600).delay(300)} style={[styles.container, { backgroundColor: c.cardBackground, flex: 1 }]}>
      <AnimatedPressable onPress={() => router.push('/(tabs)/chat' as Href)} scaleValue={0.97}>
        <View style={styles.header}>
          <View style={[styles.iconContainer, { backgroundColor: c.cardBackgroundWarm }]}>
            <AppIcon name="chat" size={18} color={c.accent} />
          </View>
          <Text style={[styles.title, { color: c.textPrimary }]}>Чат-ассистент</Text>
        </View>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>Задайте вопрос или попросите помощь</Text>
      </AnimatedPressable>

      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, { backgroundColor: c.inputBackground, color: c.textPrimary }]}
          placeholder="Спросите что-нибудь..."
          placeholderTextColor={c.placeholder}
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity style={[styles.sendButton, { backgroundColor: c.accent }]} onPress={handleSend}>
          {/* @pixel-size: 14×14 — стрелка отправки */}
          <AppIcon name="arrow" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.cardBackground,
    borderRadius: 20,
    padding: 16,
    overflow: 'hidden',
    justifyContent: 'space-between',
    ...shadow({ offsetY: 2, opacity: 0.06, radius: 8, elevation: 3 }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: AppColors.cardBackgroundWarm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    fontSize: 14,
  },
  title: {
    fontSize: 14,
    fontWeight: 'bold',
    color: AppColors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: AppColors.textSecondary,
    marginBottom: 12,
    lineHeight: 16,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  input: {
    flex: 1,
    minWidth: 0,
    backgroundColor: AppColors.inputBackground,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    color: AppColors.textPrimary,
  },
  sendButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    flexShrink: 0,
    backgroundColor: AppColors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendIcon: {
    color: AppColors.textWhite,
    fontSize: 18,
    fontWeight: 'bold',
  },
});
