import * as CryptoJS from 'crypto-js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Patch CryptoJS random to use expo-crypto (Node's crypto module is unavailable in RN)
if (Platform.OS !== 'web') {
  const original = CryptoJS.lib.WordArray.random;
  CryptoJS.lib.WordArray.random = function (nBytes: number) {
    const bytes = Crypto.getRandomBytes(nBytes);
    const words: number[] = [];
    for (let i = 0; i < nBytes; i += 4) {
      words.push(
        ((bytes[i] || 0) << 24) |
        ((bytes[i + 1] || 0) << 16) |
        ((bytes[i + 2] || 0) << 8) |
        (bytes[i + 3] || 0)
      );
    }
    return CryptoJS.lib.WordArray.create(words, nBytes);
  };
}

const ENCRYPTION_KEY_ALIAS = 'noteai_encryption_key';
const ENCRYPTION_MARKER_NATIVE_V1 = 'ENC:';  // Legacy: CryptoJS passphrase mode (EVP_BytesToKey)
const ENCRYPTION_MARKER_NATIVE = 'ENC2:';     // Current: raw key + random IV + HMAC-SHA256
const ENCRYPTION_MARKER_WEB = 'WENC:';
const IDB_NAME = 'noteai_keystore';
const IDB_STORE = 'keys';

// ─── Native (iOS / Android) ────────────────────────────────
// AES via CryptoJS, key in SecureStore (Keychain / Keystore)

let cachedNativeKey: string | null = null;

async function getNativeKey(): Promise<string> {
  if (cachedNativeKey) return cachedNativeKey;
  let key = await SecureStore.getItemAsync(ENCRYPTION_KEY_ALIAS);
  if (!key) {
    const randomBytes: Uint8Array = Crypto.getRandomBytes(32);
    let hex = '';
    for (let i = 0; i < randomBytes.length; i++) {
      hex += randomBytes[i].toString(16).padStart(2, '0');
    }
    key = hex;
    await SecureStore.setItemAsync(ENCRYPTION_KEY_ALIAS, key);
  }
  cachedNativeKey = key;
  return key;
}

function nativeEncrypt(plainText: string, hexKey: string): string {
  const keyWords = CryptoJS.enc.Hex.parse(hexKey);
  const iv = CryptoJS.lib.WordArray.random(16); // 128-bit random IV
  const encrypted = CryptoJS.AES.encrypt(plainText, keyWords, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  const ivHex = iv.toString(CryptoJS.enc.Hex);
  const ctBase64 = encrypted.toString(); // base64 ciphertext
  const hmac = CryptoJS.HmacSHA256(ivHex + ctBase64, keyWords).toString(CryptoJS.enc.Hex);
  // Format: ENC2:<iv_hex>:<hmac_hex>:<ciphertext_base64>
  return `${ENCRYPTION_MARKER_NATIVE}${ivHex}:${hmac}:${ctBase64}`;
}

function nativeDecrypt(cipherText: string, hexKey: string): string {
  const keyWords = CryptoJS.enc.Hex.parse(hexKey);

  // V2 format: ENC2:<iv>:<hmac>:<ct>
  if (cipherText.startsWith(ENCRYPTION_MARKER_NATIVE)) {
    const payload = cipherText.slice(ENCRYPTION_MARKER_NATIVE.length);
    const parts = payload.split(':');
    if (parts.length !== 3) throw new Error('Invalid ENC2 format');
    const [ivHex, hmacHex, ctBase64] = parts;
    // Verify HMAC before decrypting (authenticate-then-decrypt)
    const expectedHmac = CryptoJS.HmacSHA256(ivHex + ctBase64, keyWords).toString(CryptoJS.enc.Hex);
    if (expectedHmac !== hmacHex) throw new Error('HMAC verification failed — data tampered');
    const iv = CryptoJS.enc.Hex.parse(ivHex);
    const decrypted = CryptoJS.AES.decrypt(ctBase64, keyWords, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    return decrypted.toString(CryptoJS.enc.Utf8);
  }

  // V1 legacy format: ENC:<OpenSSL salted ciphertext>
  if (cipherText.startsWith(ENCRYPTION_MARKER_NATIVE_V1)) {
    const raw = cipherText.slice(ENCRYPTION_MARKER_NATIVE_V1.length);
    return CryptoJS.AES.decrypt(raw, hexKey).toString(CryptoJS.enc.Utf8);
  }

  throw new Error('Unknown native encryption format');
}

// ─── Web (PWA / Safari / Chrome) ───────────────────────────
// AES-GCM via Web Crypto API, non-extractable key in IndexedDB
// The raw key bytes are NEVER accessible to JavaScript.

let cachedWebKey: CryptoKey | null = null;

function openKeyStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db: IDBDatabase, key: string): Promise<CryptoKey | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result as CryptoKey | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, key: string, value: CryptoKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function getWebKey(): Promise<CryptoKey> {
  if (cachedWebKey) return cachedWebKey;

  // Clean up old plain-text key from previous implementation (localStorage)
  try { localStorage.removeItem(ENCRYPTION_KEY_ALIAS); } catch { /* noop */ }

  const db = await openKeyStore();
  let key = await idbGet(db, ENCRYPTION_KEY_ALIAS);
  if (!key) {
    key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false, // ← non-extractable: JS cannot read raw key bytes
      ['encrypt', 'decrypt'],
    );
    await idbPut(db, ENCRYPTION_KEY_ALIAS, key);
  }
  cachedWebKey = key;
  return key;
}

async function webEncrypt(plainText: string): Promise<string> {
  const key = await getWebKey();
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plainText),
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  return ENCRYPTION_MARKER_WEB + uint8ToBase64(combined);
}

async function webDecrypt(cipherText: string): Promise<string> {
  const key = await getWebKey();
  const raw = base64ToUint8(cipherText.slice(ENCRYPTION_MARKER_WEB.length));
  const iv = raw.slice(0, 12);
  const data = raw.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data,
  );
  return new TextDecoder().decode(decrypted);
}

function uint8ToBase64(arr: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    arr[i] = binary.charCodeAt(i);
  }
  return arr;
}

// ─── Public API ─────────────────────────────────────────────

export async function encryptData(plainText: string): Promise<string> {
  if (Platform.OS === 'web') {
    return webEncrypt(plainText);
  }
  const key = await getNativeKey();
  return nativeEncrypt(plainText, key);
}

export async function decryptData(cipherText: string): Promise<string> {
  // Unencrypted legacy data — return as-is (auto-migration on next save)
  if (
    !cipherText.startsWith(ENCRYPTION_MARKER_NATIVE) &&
    !cipherText.startsWith(ENCRYPTION_MARKER_NATIVE_V1) &&
    !cipherText.startsWith(ENCRYPTION_MARKER_WEB)
  ) {
    return cipherText;
  }
  if (cipherText.startsWith(ENCRYPTION_MARKER_WEB)) {
    return webDecrypt(cipherText);
  }
  const key = await getNativeKey();
  return nativeDecrypt(cipherText, key);
}

export function isEncrypted(data: string): boolean {
  return (
    data.startsWith(ENCRYPTION_MARKER_NATIVE) ||
    data.startsWith(ENCRYPTION_MARKER_NATIVE_V1) ||
    data.startsWith(ENCRYPTION_MARKER_WEB)
  );
}
