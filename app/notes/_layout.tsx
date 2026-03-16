import { useAppColors } from '@/hooks/use-app-colors';
import { Stack } from 'expo-router';
import { Platform } from 'react-native';

export default function NotesLayout() {
  const colors = useAppColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.screenBackground },
        animation: Platform.OS === 'android' ? 'none' : 'slide_from_right',
        animationDuration: 250,
      }}
    />
  );
}
