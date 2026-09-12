/** Colour tokens for the WhichCard screens, one set per colour scheme. */
export const lightTheme = {
  bg: '#FFFFFF',
  text: '#11181C',
  muted: '#687076',
  accent: '#0A7EA4',
  card: '#F1F5F7',
  border: '#E1E6E9',
  error: '#C0392B',
  success: '#1E8E4E',
};

export const darkTheme: typeof lightTheme = {
  bg: '#151718',
  text: '#ECEDEE',
  muted: '#9BA1A6',
  accent: '#4FC3E8',
  card: '#22262A',
  border: '#2E3338',
  error: '#FF7C6E',
  success: '#4ADE80',
};

export type Theme = typeof lightTheme;

/**
 * React Native's ColorSchemeName includes 'unspecified' on some platforms, so this
 * takes a plain string and treats anything that isn't explicitly dark as light.
 */
export function themeFor(scheme: string | null | undefined): Theme {
  return scheme === 'dark' ? darkTheme : lightTheme;
}
