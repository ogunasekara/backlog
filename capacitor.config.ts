import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  // Permanent once installed on a device: changing it makes Android treat it as a new app.
  appId: 'com.ogdev.backlog',
  appName: 'Backlog',
  webDir: 'dist',
  plugins: {
    SocialLogin: {
      // Only Google is used; the others would add SDKs to the APK for nothing.
      providers: { google: true, facebook: false, apple: false, twitter: false },
      logLevel: 1,
    },
  },
}

export default config
