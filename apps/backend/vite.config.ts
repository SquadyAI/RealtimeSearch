import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Vitest setup for future tests
  test: {
    environment: 'node',
    watch: false,
  },
});


