export const brand = {
  colors: {
    saffron: '#FF8F00',
    royalBlue: '#0D47A1',
    gold: '#D4AF37',
    slate900: '#0f172a',
    slate700: '#334155',
    slate400: '#94a3b8',
    white: '#FFFFFF',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 36,
  },
  typography: {
    display: 32,
    title: 24,
    h1: 20,
    h2: 16,
    body: 12,
    small: 10,
  },
}

export function pickSectionAccent(index: number): string {
  const accents = [brand.colors.royalBlue, brand.colors.saffron, brand.colors.gold]
  return accents[index % accents.length]
}

