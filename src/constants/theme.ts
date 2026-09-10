export const theme = {
  colors: {
    background: '#0B0D13',
    surface: '#131722',
    surfaceElevated: '#1A202E',
    border: '#232A3B',
    borderLight: '#2E384D',

    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',

    primary: '#6366F1',
    primaryLight: '#818CF8',
    primaryDark: '#4F46E5',

    accent: '#8B5CF6',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',

    cardBackground: '#141926',
    tabBarBackground: '#0F131D',
    tabBarBorder: '#1E2433',
    activeTab: '#818CF8',
    inactiveTab: '#64748B',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  borderRadius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    full: 9999,
  },
  typography: {
    fontSizes: {
      xs: 12,
      sm: 14,
      md: 16,
      lg: 18,
      xl: 20,
      xxl: 24,
      display: 28,
    },
  },
} as const;

export type Theme = typeof theme;
