import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'path';

const preactRuntimePattern = /[\\/]node_modules[\\/]preact[\\/]dist[\\/]preact\.(?:module\.js|mjs)$/;
const reactColorfulRuntimePattern = /[\\/]node_modules[\\/]react-colorful[\\/]dist[\\/]index\.(?:esmodule|module|mjs|js)$/;

const stripPreactUnsafeHtml: Plugin = {
  name: 'strip-preact-unsafe-html',
  enforce: 'pre',
  transform(code, id) {
    if (reactColorfulRuntimePattern.test(id)) {
      const transformed = code.replace(/\.innerHTML\s*=/g, '.textContent =');
      if (transformed === code) {
        throw new Error('Unable to harden the bundled react-colorful runtime');
      }
      return { code: transformed, map: null };
    }

    if (!preactRuntimePattern.test(id)) return null;
    if (!code.includes('innerHTML')) return null;

    const transformed = code.replace(
      'if(h)c||p&&(h.__html==p.__html||h.__html==u.innerHTML)||(u.innerHTML=h.__html),t.__k=[];else if(p&&(u.innerHTML=""),',
      'if(h)t.__k=[];else if(p&&u.replaceChildren(),'
    );

    if (transformed === code) {
      throw new Error('Unable to harden the bundled Preact runtime');
    }

    return { code: transformed, map: null };
  }
};

// package.json is the single source of truth for the extension version.
// Vite copies public/ into dist/ before closeBundle runs, so patching the
// copied manifest here guarantees every package uses the same version.
const injectManifestVersion: Plugin = {
  name: 'inject-manifest-version',
  apply: 'build',
  closeBundle() {
    const manifestPath = resolve(__dirname, 'dist/manifest.json');

    if (!existsSync(manifestPath)) {
      throw new Error('Unable to locate dist/manifest.json to inject the extension version');
    }

    const { version } = JSON.parse(
      readFileSync(resolve(__dirname, 'package.json'), 'utf8')
    ) as { version: string };
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;

    if (manifest.version === version) return;

    manifest.version = version;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
};

export default defineConfig({
  plugins: [stripPreactUnsafeHtml, tailwindcss(), preact(), injectManifestVersion],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@newtab': resolve(__dirname, 'src/newtab'),
      '@popup': resolve(__dirname, 'src/popup'),
      react: 'preact/compat',
      'react-dom': 'preact/compat'
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    modulePreload: {
      polyfill: false
    },
    sourcemap: false,
    rollupOptions: {
      input: {
        newtab: resolve(__dirname, 'newtab.html'),
        popup: resolve(__dirname, 'popup.html')
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    },
    // Keep bundle small and fast
    minify: 'esbuild',
    cssMinify: true
  }
});
