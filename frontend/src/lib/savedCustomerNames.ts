export type CustomerStorageKey = 'b2b_ticket' | 'b2c_ticket' | 'credit_note';

const LS_PREFIX = 'cls_customer_names_';

function storageKey(k: CustomerStorageKey): string {
  return `${LS_PREFIX}${k}`;
}

export function getSavedCustomerNames(k: CustomerStorageKey): string[] {
  try {
    const raw = localStorage.getItem(storageKey(k));
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is string => typeof x === 'string')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function setSavedCustomerNames(k: CustomerStorageKey, names: string[]) {
  localStorage.setItem(storageKey(k), JSON.stringify(names));
}

/** Add if not already saved (case-insensitive) and not identical to a built-in suggestion. Max 50 entries. */
export function rememberCustomerNameAfterSubmit(
  k: CustomerStorageKey,
  name: string,
  builtInSuggestions: readonly string[],
) {
  const n = name.trim();
  if (!n) return;
  if (builtInSuggestions.some((s) => s.toLowerCase() === n.toLowerCase())) return;
  const existing = getSavedCustomerNames(k);
  if (existing.some((x) => x.toLowerCase() === n.toLowerCase())) return;
  setSavedCustomerNames(k, [n, ...existing].slice(0, 50));
}

export function removeSavedCustomerName(k: CustomerStorageKey, name: string) {
  const existing = getSavedCustomerNames(k);
  setSavedCustomerNames(k, existing.filter((x) => x !== name));
}
