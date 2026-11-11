import { defineConfig } from 'vitest/config';
import { counterBuildPlugin } from './lab/dev/counter-build-plugin.js';
import { labResults } from './lab/dev/results-plugin.js';

export default defineConfig({
  // 개발 서버 전용: lab 측정 결과 저장(POST /__lab/results)
  plugins: [labResults(), counterBuildPlugin()],
  build: {
    rollupOptions: {
      // Phase 1 검증 페이지와 Phase 2 데모를 함께 빌드한다. 경로는 프로젝트 루트 기준이다.
      input: {
        main: 'index.html',
        phase2: 'phase2/index.html',
        labHeatmap: 'lab/pages/heatmap.html',
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'phase2/**/*.test.ts', 'lab/**/*.test.js'],
  },
});
