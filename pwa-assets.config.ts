import { defineConfig, minimal2023Preset as preset } from '@vite-pwa/assets-generator/config'

// The icon's own background, so the padding added to the maskable and Apple icons
// blends in instead of framing it in white.
const background = '#18181b'

export default defineConfig({
  preset: {
    ...preset,
    maskable: { ...preset.maskable, resizeOptions: { background } },
    apple: { ...preset.apple, resizeOptions: { background } },
  },
  images: ['public/icon.svg'],
})
