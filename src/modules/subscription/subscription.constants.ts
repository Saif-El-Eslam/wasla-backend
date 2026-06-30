export const featureKeys = {
  branchLimit: 'BRANCH_LIMIT',
  geminiExtractionsMonthly: 'GEMINI_EXTRACTIONS_MONTHLY',
  geminiImagesPerExtraction: 'GEMINI_IMAGES_PER_EXTRACTION',
  analyticsHistoryDays: 'ANALYTICS_HISTORY_DAYS',
  advancedAnalytics: 'ADVANCED_ANALYTICS',
  qrBranding: 'QR_BRANDING',
  customQrAssets: 'CUSTOM_QR_ASSETS',
  staffUsers: 'STAFF_USERS',
  languages: 'LANGUAGES',
  financeModule: 'FINANCE_MODULE',
} as const;

export const unlimitedLimit = 999999;

export type FeatureKey = (typeof featureKeys)[keyof typeof featureKeys];
