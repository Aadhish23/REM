import * as SecureStore from 'expo-secure-store';

const CHUNK_SIZE = 1800; // Well below Android 2048-byte SharedPreferences limit

/**
 * Hardware-backed encrypted storage adapter for Supabase sessions using expo-secure-store.
 * Implements chunking so large JWT sessions on Android never exceed Keystore payload limits.
 */
export const secureStoreAdapter = {
  async getItem(key: string): Promise<string | null> {
    try {
      const chunkCountStr = await SecureStore.getItemAsync(`${key}_chunks`);
      if (chunkCountStr) {
        const chunkCount = parseInt(chunkCountStr, 10);
        if (isNaN(chunkCount) || chunkCount <= 0) {
          return null;
        }

        let fullValue = '';
        for (let i = 0; i < chunkCount; i++) {
          const chunk = await SecureStore.getItemAsync(`${key}_${i}`);
          if (chunk === null) {
            return null; // Incomplete session data
          }
          fullValue += chunk;
        }
        return fullValue;
      }

      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      if (value.length <= CHUNK_SIZE) {
        // Clear any previous chunk markers
        const existingChunks = await SecureStore.getItemAsync(`${key}_chunks`);
        if (existingChunks) {
          const count = parseInt(existingChunks, 10);
          for (let i = 0; i < count; i++) {
            await SecureStore.deleteItemAsync(`${key}_${i}`).catch(() => {});
          }
          await SecureStore.deleteItemAsync(`${key}_chunks`).catch(() => {});
        }
        await SecureStore.setItemAsync(key, value);
      } else {
        // Value exceeds single slot limit; store in encrypted chunks
        const totalChunks = Math.ceil(value.length / CHUNK_SIZE);
        await SecureStore.setItemAsync(`${key}_chunks`, String(totalChunks));

        for (let i = 0; i < totalChunks; i++) {
          const chunk = value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
          await SecureStore.setItemAsync(`${key}_${i}`, chunk);
        }

        // Delete previous unchunked key if present
        await SecureStore.deleteItemAsync(key).catch(() => {});
      }
    } catch (err) {
      // Re-throw so Supabase auth is aware of persistence failure if any
      throw err;
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      const chunkCountStr = await SecureStore.getItemAsync(`${key}_chunks`);
      if (chunkCountStr) {
        const chunkCount = parseInt(chunkCountStr, 10);
        for (let i = 0; i < chunkCount; i++) {
          await SecureStore.deleteItemAsync(`${key}_${i}`).catch(() => {});
        }
        await SecureStore.deleteItemAsync(`${key}_chunks`).catch(() => {});
      }
      await SecureStore.deleteItemAsync(key).catch(() => {});
    } catch {
      // Ignore errors on removal
    }
  },
};
