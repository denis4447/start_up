import React, { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useAppColors } from '@/hooks/use-app-colors';
import { shadow } from '@/lib/shadows';
import AppIcon from '@/components/ui/app-icon';

type Props = {
  message: string;
  visible: boolean;
  onDismiss: () => void;
  duration?: number;
};

export default function CopyToast({ message, visible, onDismiss, duration = 2000 }: Props) {
  const c = useAppColors();

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [visible, duration, onDismiss]);

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={[
        styles.container,
        { backgroundColor: c.cardBackground },
        shadow({ offsetY: 2, opacity: 0.12, radius: 8, elevation: 4 }),
      ]}
    >
      <AppIcon name="check" size={16} color="#2D9C6F" />
      <Text style={[styles.text, { color: c.textPrimary }]}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    zIndex: 200,
  },
  icon: {
    fontSize: 16,
    color: '#2D9C6F',
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
  },
});
