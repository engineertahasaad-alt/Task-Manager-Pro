// Central source of truth for the backend API domain.
//
// In local development, the `dev` script injects EXPO_PUBLIC_DOMAIN with the
// Replit workspace dev domain, so that value is used.
//
// In release builds and — critically — in OTA updates published via
// `eas update` (which do NOT read the `env` block from eas.json build
// profiles), EXPO_PUBLIC_DOMAIN may be absent. In that case we fall back to the
// permanent deployed backend domain below.
//
// NOTE: set PRODUCTION_DOMAIN to your published Replit Deployment domain,
// e.g. "taskaya.replit.app" (no protocol, no trailing slash).
const PRODUCTION_DOMAIN = "task-manager-pro-tahasaad2.replit.app";

export const API_DOMAIN = process.env.EXPO_PUBLIC_DOMAIN || PRODUCTION_DOMAIN;
export const API_BASE_URL = `https://${API_DOMAIN}`;
