import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: 'vitest.setup.ts',
    include: ['tests/**/*-test.ts'],
  },
});
