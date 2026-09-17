import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ir.payamcoder.podmanban",
  appName: "پودمان‌بان",
  webDir: "dist",
  server: {
    // Explicit: Android WebView origin becomes https://localhost.
    // The API must therefore set COOKIE_SAMESITE=none (+ forced Secure)
    // so the httpOnly auth cookies are stored/sent in the app.
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    // CapacitorHttp only natives fetch(); without CapacitorCookies
    // document.cookie stays empty, the x-csrf-token header is never set,
    // and every POST/PUT/DELETE is rejected with 403. Both are required.
    CapacitorHttp: { enabled: true },
    CapacitorCookies: { enabled: true },
  },
};

export default config;
