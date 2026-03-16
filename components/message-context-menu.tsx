import React from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useAppColors } from '@/hooks/use-app-colors';
import { shadow } from '@/lib/shadows';
import AppIcon from '@/components/ui/app-icon';

type Props = {
  visible: boolean;
  onCopy: () => void;
  onDismiss: () => void;
  bubbleY: number;
  isUser: boolean;
};

export default function MessageContextMenu({ visible, onCopy, onDismiss, bubbleY, isUser }: Props) {
  const c = useAppColors();

  if (!visible) return null;

  // Clamp Y so menu stays on screen
  const screenH = Dimensions.get('window').height;
  const clampedY = Math.min(Math.max(bubbleY, 60), screenH - 120);

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onDismiss}>
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(100)}
          style={[
            styles.menu,
            {
              backgroundColor: c.cardBackground,
              top: clampedY,
              ...(isUser ? { right: 24 } : { left: 24 }),
            },
            shadow({ offsetY: 4, opacity: 0.15, radius: 12, elevation: 8 }),
          ]}
        >
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              onCopy();
              onDismiss();
            }}
            activeOpacity={0.7}
          >
            <AppIcon name="clipboard" size={18} color={c.accent} />
            <Text style={[styles.menuText, { color: c.textPrimary }]}>Скопировать текст</Text>
          </TouchableOpacity>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  menu: {
    position: 'absolute',
    borderRadius: 14,
    paddingVertical: 4,
    minWidth: 200,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
  },
  menuIcon: {
    fontSize: 18,
  },
  menuText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
