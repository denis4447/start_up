import AnimatedPressable from '@/components/animated-pressable';
import AppIcon from '@/components/ui/app-icon';
import { AppColors } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { shadow } from '@/lib/shadows';
import { getShoppingList, saveShoppingList, type ShoppingItem } from '@/lib/storage';
import { useRouter, type Href } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

export default function ShoppingListWidget() {
  const router = useRouter();
  const c = useAppColors();
  const [items, setItems] = useState<ShoppingItem[]>([]);

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    const data = await getShoppingList();
    setItems(data.slice(0, 3));
  };

  const toggleItem = async (id: string) => {
    const allItems = await getShoppingList();
    const updated = allItems.map((item) =>
      item.id === id ? { ...item, checked: !item.checked } : item
    );
    await saveShoppingList(updated);
    setItems(updated.slice(0, 3));
  };

  return (
    <Animated.View entering={FadeInDown.duration(600).delay(400)} style={[styles.container, { backgroundColor: c.cardBackground }]}>
      <AnimatedPressable onPress={() => router.push('/shopping-list' as Href)} scaleValue={0.97}>
        <View style={styles.header}>
          <AppIcon name="cart" size={16} color={c.accent} />
          <Text style={[styles.title, { color: c.textPrimary }]}>Список покупок</Text>
        </View>
      </AnimatedPressable>

      <View style={styles.list}>
        {items.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.item}
            onPress={() => toggleItem(item.id)}
          >
            <View style={[styles.checkbox, item.checked && styles.checkboxChecked]}>
              {item.checked && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={[styles.itemText, { color: c.textPrimary }, item.checked && { textDecorationLine: 'line-through' as const, color: c.textMuted }]}>
              {item.text}
            </Text>
          </TouchableOpacity>
        ))}
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
    ...shadow({ offsetY: 2, opacity: 0.06, radius: 8, elevation: 3 }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  icon: {
    fontSize: 16,
  },
  title: {
    fontSize: 14,
    fontWeight: 'bold',
    color: AppColors.textPrimary,
  },
  list: {
    gap: 10,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: AppColors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: AppColors.success,
    borderColor: AppColors.success,
  },
  checkmark: {
    color: AppColors.textWhite,
    fontSize: 13,
    fontWeight: 'bold',
  },
  itemText: {
    fontSize: 14,
    fontWeight: '600',
    color: AppColors.textPrimary,
  },
  itemTextChecked: {
    textDecorationLine: 'line-through',
    color: AppColors.textMuted,
  },
});
