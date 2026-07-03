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
  financeAdvancedAnalytics: 'FINANCE_ADVANCED_ANALYTICS',
} as const;

export const unlimitedLimit = 999999;

export const planFeatureValueTypes = ['BOOLEAN', 'NUMBER', 'TEXT', 'JSON'] as const;

export const qrBrandingLevels = {
  waslaSigned: 'WASLA_SIGNED',
  venueLogo: 'VENUE_LOGO',
  fullCustom: 'FULL_CUSTOM',
} as const;

export const qrBrandingLevelValues = Object.values(qrBrandingLevels);

export type FeatureKey = (typeof featureKeys)[keyof typeof featureKeys];
export type PlanFeatureValueType = (typeof planFeatureValueTypes)[number];
export type QrBrandingLevel = (typeof qrBrandingLevels)[keyof typeof qrBrandingLevels];
