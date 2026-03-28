/** Must match backend CREDIT_NOTE_MARKET_AREAS (credit note market area / region). */
export const CREDIT_NOTE_MARKET_AREAS = [
  'Calicut',
  'Kochi & Kottayam',
  'Karnataka',
  'Chennai',
  'Coimbatore',
  'Ooty Farm',
  'employees',
] as const;

export type CreditNoteMarketArea = (typeof CREDIT_NOTE_MARKET_AREAS)[number];
