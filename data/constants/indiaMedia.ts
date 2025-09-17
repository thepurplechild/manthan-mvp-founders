// data/constants/indiaMedia.ts
// Canonical sets
export const GENRES = [
  'Bollywood Drama',
  'Web Series',
  'Documentary',
  'Comedy',
  'Thriller/Crime',
  'Historical/Period',
  'Social',
  'Romance',
  'Action/Adventure',
  'Horror/Supernatural',
  'Reality/Competition',
  'Talk Shows',
  'Music Videos',
  'Educational',
  "Children’s Content",
  // Regional cinema (examples)
  'Tamil Cinema',
  'Telugu Cinema',
  'Malayalam Cinema',
  'Kannada Cinema',
  'Marathi Cinema',
  'Bengali Cinema',
  'Punjabi Cinema',
  'Gujarati Cinema',
  'Odia Cinema',
  'Assamese Cinema'
] as const;

export const PLATFORMS = [
  'Netflix India',
  'Prime Video India',
  'Disney+ Hotstar',
  'Zee5',
  'SonyLIV',
  'Voot',
  'MX Player',
  'ALTBalaji',
  'Eros Now',
  'YouTube India',
  'Instagram Reels',
  'Regional OTTs'
] as const;

export const LANGUAGES = [
  'Hindi',
  'English',
  'Tamil',
  'Telugu',
  'Malayalam',
  'Kannada',
  'Bengali',
  'Marathi',
  'Punjabi',
  'Gujarati',
  'Odia',
  'Assamese',
  'Multi-language/Dubbed'
] as const;

export const BUDGETS = [
  'Under ₹5L',
  '₹5L–₹25L',
  '₹25L–₹1Cr',
  '₹1Cr–₹5Cr',
  '₹5Cr–₹15Cr',
  '₹15Cr+'
] as const;

export const TARGET_AUDIENCES = [
  'Urban Youth 18-25',
  'Young Adults 25-35',
  'Family',
  'Regional',
  'NRI/Global Indian',
  'Niche'
] as const;

// Backwards-compatible aliases used by existing UI components
export const INDIA_GENRES = GENRES;
export const INDIA_PLATFORMS = PLATFORMS;
export const INDIA_LANGUAGES = LANGUAGES;
export const INDIA_BUDGET_RANGES = BUDGETS;
export const INDIA_TARGET_AUDIENCE = TARGET_AUDIENCES;
