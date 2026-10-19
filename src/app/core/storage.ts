// Per-device conveniences only; storage can be unavailable (private mode) and that's fine.
export function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Nothing to do: the setting just won't be remembered.
  }
}
