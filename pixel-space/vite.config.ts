import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  // 相对路径：部署到任意子路径（GitHub Pages / itch.io）或本地打开均可用
  base: './',
  plugins: [viteSingleFile()],
  build: {
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 2000,
  },
  server: {
    port: 5173,
    host: true,
    watch: {
      // 忽略原子写入工具产生的临时目录（.README.md.<pid>.<uuid>.tmpdir/），
      // 否则 chokidar 尝试监听该目录时 EBUSY 崩溃
      ignored: (path: string) => path.includes('.tmpdir'),
    },
  },
});
