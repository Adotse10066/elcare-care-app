// Mock for @elcarehub/config workspace package (not linked at frontend level).
// Provides a minimal loadConfig so src/lib/config.ts can spread it without crashing.
export function loadConfig() {
  return {};
}
