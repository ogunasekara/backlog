import '@testing-library/jest-dom/vitest'

// jsdom implements neither the Pointer Capture API nor scrollIntoView, both of which
// Radix UI primitives (Select, Dialog) call. Without these stubs the components throw
// on interaction, so every test that opens a dropdown would fail.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
}

Element.prototype.scrollIntoView ??= () => {}
