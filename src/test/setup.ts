import '@testing-library/jest-dom/vitest'
import { onlineManager } from '@tanstack/react-query'

// jsdom implements neither the Pointer Capture API nor scrollIntoView, both of which
// Radix UI primitives (Select, Dialog) call. Without these stubs the components throw
// on interaction, so every test that opens a dropdown would fail.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
}

Element.prototype.scrollIntoView ??= () => {}

// Tests that go offline flip TanStack's shared online state; put it back for the next.
afterEach(() => onlineManager.setOnline(true))
