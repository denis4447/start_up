import AppIcon from '@/components/ui/app-icon';
import { AppColors } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { shadow } from '@/lib/shadows';
import {
    generateId,
    getShoppingList,
    saveShoppingList,
    type ShoppingItem,
} from '@/lib/storage';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ShoppingListScreen() {
  const router = useRouter();
  const c = useAppColors();
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [newItemText, setNewItemText] = useState('');

  useFocusEffect(
    useCallback(() => {
      loadItems();
    }, [])
  );

  const loadItems = async () => {
    const data = await getShoppingList();
    setItems(data);
  };

  const toggleItem = async (id: string) => {
    const updated = items.map((item) =>
      item.id === id ? { ...item, checked: !item.checked } : item
    );
    setItems(updated);
    await saveShoppingList(updated);
  };

  const addItem = async () => {
    if (!newItemText.trim()) return;
    const newItem: ShoppingItem = {
      id: generateId(),
      text: newItemText.trim(),
      checked: false,
    };
    const updated = [...items, newItem];
    setItems(updated);
    await saveShoppingList(updated);
    setNewItemText('');
  };

  const removeItem = async (id: string) => {
    const updated = items.filter((item) => item.id !== id);
    setItems(updated);
    await saveShoppingList(updated);
  };

  const clearAll = async () => {
    const confirmed =
      Platform.OS === 'web'
        ? window.confirm('Удалить все товары из списка?')
        : await new Promise<boolean>((resolve) => {
            const { Alert } = require('react-native');
            Alert.alert('Очистить список', 'Удалить все товары из списка?', [
              { text: 'Отмена', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Очистить', style: 'destructive', onPress: () => resolve(true) },
            ]);
          });
    if (confirmed) {
      await saveShoppingList([]);
      setItems([]);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: c.screenBackground }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.backButton, { color: c.textPrimary }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={clearAll} style={[styles.clearButton, { backgroundColor: c.cardBackground }]}>
            <Text style={styles.clearButtonText}>Очистить</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.avatarSmall}>
            <AppIcon name="user" size={20} color={c.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: c.textPrimary }]}>Список покупок</Text>

        <View style={[styles.card, { backgroundColor: c.cardBackground }]}>
          <View style={styles.cardHeader}>
            <AppIcon name="cart" size={18} color={c.accent} />
            <Text style={styles.cardTitle}>Список покупок</Text>
          </View>

          {items.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.item}
              onPress={() => toggleItem(item.id)}
              onLongPress={() => removeItem(item.id)}
              activeOpacity={0.7}
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

        <View style={styles.addContainer}>
          <View style={styles.addCheckbox}>
            <View style={styles.emptyCheckbox} />
          </View>
          <TextInput
            style={styles.addInput}
            placeholder="Добавить товар..."
            placeholderTextColor={c.placeholder}
            value={newItemText}
            onChangeText={setNewItemText}
            onSubmitEditing={addItem}
            returnKeyType="done"
          />
        </View>
      </ScrollView>
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  clearButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: AppColors.cardBackground,
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: AppColors.error,
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
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: AppColors.textPrimary,
    marginBottom: 20,
  },
  card: {
    backgroundColor: AppColors.cardBackground,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    ...shadow({ offsetY: 2, opacity: 0.06, radius: 8, elevation: 3 }),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  cardIcon: {
    fontSize: 18,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: AppColors.textPrimary,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
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
    fontSize: 14,
    fontWeight: 'bold',
  },
  itemText: {
    fontSize: 16,
    fontWeight: '600',
    color: AppColors.textPrimary,
  },
  itemTextChecked: {
    textDecorationLine: 'line-through',
    color: AppColors.textMuted,
  },
  addContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
  },
  addCheckbox: {
    width: 26,
    height: 26,
  },
  emptyCheckbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: AppColors.border,
    backgroundColor: AppColors.inputBackground,
  },
  addInput: {
    flex: 1,
    fontSize: 16,
    color: AppColors.textPrimary,
    paddingVertical: 8,
  },
});
