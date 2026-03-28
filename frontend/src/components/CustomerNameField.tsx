import { useId, useMemo, useState, useCallback, useEffect } from 'react';
import type { InputHTMLAttributes } from 'react';
import { CUSTOMER_SUGGESTIONS } from '../data/rejectionTicketSuggestions';
import type { CustomerStorageKey } from '../lib/savedCustomerNames';
import { getSavedCustomerNames, removeSavedCustomerName } from '../lib/savedCustomerNames';

type Props = {
  storageKey: CustomerStorageKey;
  value: string;
  onChange: (value: string) => void;
  builtInSuggestions?: readonly string[];
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'list'>;

export function CustomerNameField({
  storageKey,
  value,
  onChange,
  builtInSuggestions = CUSTOMER_SUGGESTIONS,
  className,
  ...inputProps
}: Props) {
  const listId = useId().replace(/:/g, '');
  const [saved, setSaved] = useState(() => getSavedCustomerNames(storageKey));

  const refreshSaved = useCallback(() => {
    setSaved(getSavedCustomerNames(storageKey));
  }, [storageKey]);

  useEffect(() => {
    setSaved(getSavedCustomerNames(storageKey));
  }, [storageKey]);

  const mergedDatalistOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of builtInSuggestions) {
      const k = s.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        out.push(s);
      }
    }
    for (const s of saved) {
      const k = s.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        out.push(s);
      }
    }
    return out;
  }, [builtInSuggestions, saved]);

  const remove = (name: string) => {
    removeSavedCustomerName(storageKey, name);
    refreshSaved();
  };

  return (
    <div className="space-y-2">
      <input
        {...inputProps}
        className={className}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list={listId}
        autoComplete="off"
      />
      <datalist id={listId}>
        {mergedDatalistOptions.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
      {saved.length > 0 && (
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-2 py-2">
          <div className="text-[10px] font-medium text-gray-500 mb-1.5">Your saved names</div>
          <div className="flex flex-wrap gap-1.5">
            {saved.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-0.5 rounded-full border border-gray-200 bg-white pl-2.5 pr-1 py-0.5 text-[11px] text-gray-800 shadow-sm"
              >
                <button
                  type="button"
                  className="max-w-[140px] truncate text-left hover:text-indigo-600"
                  onClick={() => onChange(name)}
                  title={name}
                >
                  {name}
                </button>
                <button
                  type="button"
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-red-50 hover:text-red-600"
                  aria-label={`Remove ${name}`}
                  onClick={() => remove(name)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
