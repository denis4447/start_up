import AsyncStorage from '@react-native-async-storage/async-storage';
import * as CryptoJS from 'crypto-js';
import * as CryptoModule from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const PIN_PREFIX = 'noteai_pin_';
const ATTEMPTS_PREFIX = 'noteai_pin_attempts_';
const PBKDF2_V1_PREFIX = 'PBK:';  // legacy: 100K iterations, no count stored
const PBKDF2_V2_PREFIX = 'PBK2:'; // current: iteration count embedded
const PBKDF2_ITERATIONS = 10_000;  // 10K — fast on JS, secure with lockout
const PBKDF2_V1_ITERATIONS = 100_000; // for verifying old PBK: hashes
const PBKDF2_KEY_SIZE = 256 / 32; // 256-bit output in words
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

type AttemptsData = { count: number; lockedUntil: number | null };

async function getAttempts(noteId: string): Promise<AttemptsData> {
  const raw = await AsyncStorage.getItem(ATTEMPTS_PREFIX + noteId);
  if (!raw) return { count: 0, lockedUntil: null };
  try { return JSON.parse(raw); } catch { return { count: 0, lockedUntil: null }; }
}

async function setAttempts(noteId: string, data: AttemptsData): Promise<void> {
  await AsyncStorage.setItem(ATTEMPTS_PREFIX + noteId, JSON.stringify(data));
}

async function clearAttempts(noteId: string): Promise<void> {
  await AsyncStorage.removeItem(ATTEMPTS_PREFIX + noteId);
}

export async function isPinLocked(noteId: string): Promise<{ locked: boolean; remainingMs: number }> {
  const data = await getAttempts(noteId);
  if (data.lockedUntil && Date.now() < data.lockedUntil) {
    return { locked: true, remainingMs: data.lockedUntil - Date.now() };
  }
  if (data.lockedUntil && Date.now() >= data.lockedUntil) {
    await clearAttempts(noteId);
  }
  return { locked: false, remainingMs: 0 };
}

// Legacy: single SHA-256 (for reading old hashes only)
async function hashPinLegacy(pin: string, noteId: string): Promise<string> {
  return CryptoModule.digestStringAsync(
    CryptoModule.CryptoDigestAlgorithm.SHA256,
    `${noteId}:${pin}`,
  );
}

// PBKDF2 with configurable iterations
function hashPinPBKDF2(pin: string, saltHex: string, iterations: number = PBKDF2_ITERATIONS): string {
  const salt = CryptoJS.enc.Hex.parse(saltHex);
  const derived = CryptoJS.PBKDF2(pin, salt, {
    keySize: PBKDF2_KEY_SIZE,
    iterations,
    hasher: CryptoJS.algo.SHA256,
  });
  return derived.toString(CryptoJS.enc.Hex);
}

function generateSaltHex(): string {
  const bytes = CryptoModule.getRandomBytes(16);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

async function getStoredHash(noteId: string): Promise<string | null> {
  const key = PIN_PREFIX + noteId;
  if (Platform.OS === 'web') {
    return AsyncStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function storeHash(noteId: string, value: string): Promise<void> {
  const key = PIN_PREFIX + noteId;
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(key, value);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}

export async function setNotePin(noteId: string, pin: string): Promise<void> {
  const saltHex = generateSaltHex();
  const hash = hashPinPBKDF2(pin, saltHex, PBKDF2_ITERATIONS);
  // Format: PBK2:<iterations>:<salt>:<hash>
  await storeHash(noteId, `${PBKDF2_V2_PREFIX}${PBKDF2_ITERATIONS}:${saltHex}:${hash}`);
  await clearAttempts(noteId);
}

export async function verifyNotePin(noteId: string, pin: string): Promise<boolean> {
  const lockStatus = await isPinLocked(noteId);
  if (lockStatus.locked) return false;

  const stored = await getStoredHash(noteId);
  if (!stored) return false;

  let match = false;

  if (stored.startsWith(PBKDF2_V2_PREFIX)) {
    // PBK2:<iterations>:<salt_hex>:<hash_hex>
    const parts = stored.slice(PBKDF2_V2_PREFIX.length).split(':');
    if (parts.length !== 3) return false;
    const [itersStr, saltHex, expectedHash] = parts;
    const iters = parseInt(itersStr, 10);
    if (!iters || !saltHex || !expectedHash) return false;
    const computedHash = hashPinPBKDF2(pin, saltHex, iters);
    match = computedHash === expectedHash;
  } else if (stored.startsWith(PBKDF2_V1_PREFIX)) {
    // Legacy PBK:<salt_hex>:<hash_hex> (100K iterations)
    const payload = stored.slice(PBKDF2_V1_PREFIX.length);
    const sepIdx = payload.indexOf(':');
    if (sepIdx === -1) return false;
    const saltHex = payload.slice(0, sepIdx);
    const expectedHash = payload.slice(sepIdx + 1);
    const computedHash = hashPinPBKDF2(pin, saltHex, PBKDF2_V1_ITERATIONS);
    match = computedHash === expectedHash;
    if (match) {
      // Auto-migrate to PBK2 with faster iterations
      const newSalt = generateSaltHex();
      const newHash = hashPinPBKDF2(pin, newSalt, PBKDF2_ITERATIONS);
      await storeHash(noteId, `${PBKDF2_V2_PREFIX}${PBKDF2_ITERATIONS}:${newSalt}:${newHash}`);
    }
  } else {
    // Legacy SHA-256 format — verify and auto-migrate on success
    const legacyHash = await hashPinLegacy(pin, noteId);
    match = stored === legacyHash;
    if (match) {
      const saltHex = generateSaltHex();
      const newHash = hashPinPBKDF2(pin, saltHex, PBKDF2_ITERATIONS);
      await storeHash(noteId, `${PBKDF2_V2_PREFIX}${PBKDF2_ITERATIONS}:${saltHex}:${newHash}`);
    }
  }

  if (match) {
    await clearAttempts(noteId);
    return true;
  }

  // Track failed attempt
  const data = await getAttempts(noteId);
  const newCount = data.count + 1;
  if (newCount >= MAX_ATTEMPTS) {
    await setAttempts(noteId, { count: newCount, lockedUntil: Date.now() + LOCKOUT_MS });
  } else {
    await setAttempts(noteId, { count: newCount, lockedUntil: null });
  }
  return false;
}

export async function removeNotePin(noteId: string): Promise<void> {
  const key = PIN_PREFIX + noteId;
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(key);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}

export async function hasNotePin(noteId: string): Promise<boolean> {
  const key = PIN_PREFIX + noteId;
  let stored: string | null = null;
  if (Platform.OS === 'web') {
    stored = await AsyncStorage.getItem(key);
  } else {
    stored = await SecureStore.getItemAsync(key);
  }
  return stored !== null;
}
