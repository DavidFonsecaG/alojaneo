import { useSyncExternalStore } from "react";

// Per-browser UI preferences for the signed-in user. These are presentation
// choices (not account data), so they live in localStorage rather than on the
// server — they're scoped to this device, survive reloads, and never need the
// API. A tiny external store lets every component (the bell, the settings
// modal) read and react to the same values without prop-drilling or context.

export interface UiPrefs {
  // Show the unread count badge on the notifications bell.
  notifBadge: boolean;
  // Dial down fade/slide animations across the app.
  reduceMotion: boolean;
}

const KEY = "alojaneo.prefs";
const DEFAULTS: UiPrefs = { notifBadge: true, reduceMotion: false };

function load(): UiPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<UiPrefs>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

let current: UiPrefs = load();
const listeners = new Set<() => void>();

// Reflect prefs that have a global DOM effect. Reduce-motion is honoured by a
// CSS rule in index.css keyed on this attribute.
export function applyPrefs(p: UiPrefs = current) {
  document.documentElement.dataset.reduceMotion = p.reduceMotion ? "true" : "false";
}
applyPrefs(current); // apply on first import, before React mounts

export function setPref<K extends keyof UiPrefs>(key: K, value: UiPrefs[K]) {
  if (current[key] === value) return;
  current = { ...current, [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* ignore quota / private-mode failures */
  }
  applyPrefs(current);
  listeners.forEach((l) => l());
}

export function useUiPrefs(): UiPrefs {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => current,
  );
}
