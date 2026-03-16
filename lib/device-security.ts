import * as Device from 'expo-device';
import { Platform } from 'react-native';

let cachedResult: boolean | null = null;

export async function isDeviceCompromised(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (cachedResult !== null) return cachedResult;

  try {
    const rooted = await Device.isRootedExperimentalAsync();
    cachedResult = rooted;
    return rooted;
  } catch {
    cachedResult = false;
    return false;
  }
}
