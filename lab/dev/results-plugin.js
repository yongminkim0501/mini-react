/**
 * 개발 서버 전용 Vite 플러그인: lab 측정 결과를 lab/results-inbox/에 저장한다(POST /__lab/results).
 * 브라우저 다운로드 없이 자동 측정 결과를 저장소로 옮기기 위해 쓴다. `vite build`에는 적용되지 않는다.
 * vite.config.ts가 node 타입 없이 검사되도록 JS로 두고 선언 파일(results-plugin.d.ts)을 붙였다.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MAX_BYTES = 10 * 1024 * 1024;

/** @returns {import('vite').Plugin} */
export function labResults() {
  return {
    name: 'lab-results',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__lab/results', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_BYTES) req.destroy();
          else chunks.push(chunk);
        });
        req.on('end', () => {
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            const dir = resolve(server.config.root, 'lab/results-inbox');
            mkdirSync(dir, { recursive: true });
            const file = `${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
            writeFileSync(resolve(dir, file), JSON.stringify(parsed, null, 2));
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ path: `lab/results-inbox/${file}` }));
          } catch {
            res.statusCode = 400;
            res.end();
          }
        });
      });
    },
  };
}
