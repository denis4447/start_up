import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated as RNAnimated,
  Easing,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAppColors } from '@/hooks/use-app-colors';

type PinModalMode = 'unlock' | 'set' | 'change' | 'remove';

type Props = {
  visible: boolean;
  mode: PinModalMode;
  onSuccess: (pin: string) => void;
  onCancel: () => void;
};

const PIN_LENGTH = 4;

export default function PinModal({ visible, mode, onSuccess, onCancel }: Props) {
  const c = useAppColors();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [error, setError] = useState('');
  const shakeAnim = useRef(new RNAnimated.Value(0)).current;
  const fadeAnim = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Dismiss any active keyboard to prevent input cache leakage
      Keyboard.dismiss();
      setPin('');
      setConfirmPin('');
      setStep('enter');
      setError('');
      RNAnimated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      fadeAnim.setValue(0);
    }
  }, [visible, fadeAnim]);

  const shake = useCallback(() => {
    shakeAnim.setValue(0);
    RNAnimated.sequence([
      RNAnimated.timing(shakeAnim, { toValue: 10, duration: 50, easing: Easing.linear, useNativeDriver: true }),
      RNAnimated.timing(shakeAnim, { toValue: -10, duration: 50, easing: Easing.linear, useNativeDriver: true }),
      RNAnimated.timing(shakeAnim, { toValue: 8, duration: 50, easing: Easing.linear, useNativeDriver: true }),
      RNAnimated.timing(shakeAnim, { toValue: -8, duration: 50, easing: Easing.linear, useNativeDriver: true }),
      RNAnimated.timing(shakeAnim, { toValue: 0, duration: 50, easing: Easing.linear, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const title = (() => {
    if (mode === 'unlock') return 'Введите PIN-код';
    if (mode === 'remove') return 'Введите текущий PIN';
    if (mode === 'change' && step === 'enter') return 'Введите текущий PIN';
    if (step === 'confirm') return 'Повторите PIN-код';
    return 'Установите PIN-код';
  })();

  const handleDigit = (digit: string) => {
    setError('');
    const current = step === 'confirm' ? confirmPin : pin;
    if (current.length >= PIN_LENGTH) return;
    const next = current + digit;

    if (step === 'confirm') {
      setConfirmPin(next);
      if (next.length === PIN_LENGTH) {
        if (next === pin) {
          onSuccess(next);
        } else {
          setError('PIN-коды не совпадают');
          setConfirmPin('');
          shake();
        }
      }
    } else {
      setPin(next);
      if (next.length === PIN_LENGTH) {
        if (mode === 'unlock' || mode === 'remove') {
          onSuccess(next);
        } else if (mode === 'set') {
          setStep('confirm');
        } else if (mode === 'change') {
          // For change: first enter is current PIN verification (handled by parent)
          onSuccess(next);
        }
      }
    }
  };

  const handleBackspace = () => {
    setError('');
    if (step === 'confirm') {
      setConfirmPin((p) => p.slice(0, -1));
    } else {
      setPin((p) => p.slice(0, -1));
    }
  };

  const currentPin = step === 'confirm' ? confirmPin : pin;

  const renderDots = () => (
    <RNAnimated.View style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            {
              backgroundColor: i < currentPin.length ? c.accent : 'transparent',
              borderColor: i < currentPin.length ? c.accent : c.textMuted,
            },
          ]}
        />
      ))}
    </RNAnimated.View>
  );

  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', 'del'],
  ];

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onCancel}>
      <RNAnimated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <Pressable style={styles.overlayBg} onPress={onCancel} />
        <RNAnimated.View
          style={[
            styles.card,
            {
              backgroundColor: c.cardBackground,
              opacity: fadeAnim,
              transform: [
                {
                  scale: fadeAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.9, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={[styles.title, { color: c.textPrimary }]}>{title}</Text>

          {renderDots()}

          {error ? <Text style={[styles.error, { color: '#E74C3C' }]}>{error}</Text> : null}

          <View style={styles.keypad}>
            {keys.map((row, ri) => (
              <View key={ri} style={styles.keyRow}>
                {row.map((k) => {
                  if (k === '') return <View key="empty" style={styles.keyBtn} />;
                  if (k === 'del') {
                    return (
                      <Pressable
                        key="del"
                        style={[styles.keyBtn]}
                        onPress={handleBackspace}
                      >
                        <Text style={[styles.keyTextDel, { color: c.textSecondary }]}>⌫</Text>
                      </Pressable>
                    );
                  }
                  return (
                    <Pressable
                      key={k}
                      style={({ pressed }) => [
                        styles.keyBtn,
                        { backgroundColor: pressed ? c.border : 'transparent' },
                      ]}
                      onPress={() => handleDigit(k)}
                    >
                      <Text style={[styles.keyText, { color: c.textPrimary }]}>{k}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          <Pressable onPress={onCancel} style={styles.cancelBtn}>
            <Text style={[styles.cancelText, { color: c.textMuted }]}>Отмена</Text>
          </Pressable>
        </RNAnimated.View>
      </RNAnimated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  card: {
    width: 300,
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 20,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  error: {
    fontSize: 13,
    marginTop: 6,
    marginBottom: 2,
  },
  keypad: {
    marginTop: 16,
    width: '100%',
  },
  keyRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  keyBtn: {
    width: 72,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    margin: 4,
  },
  keyText: {
    fontSize: 26,
    fontWeight: '500',
  },
  keyTextDel: {
    fontSize: 22,
  },
  cancelBtn: {
    marginTop: 12,
    paddingVertical: 8,
  },
  cancelText: {
    fontSize: 15,
  },
});
