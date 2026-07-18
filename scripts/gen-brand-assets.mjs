#!/usr/bin/env node
/**
 * Rasterize brand SVGs into public/ favicons + OG image.
 * Run: node scripts/gen-brand-assets.mjs
 */
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brand = path.join(root, 'brand', 'logo');
const out = path.join(root, 'public');

await mkdir(out, { recursive: true });

const faviconSvg = await readFile(path.join(brand, 'favicon.svg'));
const ogSvg = await readFile(path.join(brand, 'og.svg'));
const markSvg = await readFile(path.join(brand, 'mark.svg'));

// Favicon SVG (source of truth for browsers that support it)
await copyFile(path.join(brand, 'favicon.svg'), path.join(out, 'favicon.svg'));

// PNG favicons from rounded canvas mark
async function raster(svgBuf, file, size) {
    await sharp(svgBuf).resize(size, size).png().toFile(path.join(out, file));
    console.log(`✓ ${file} (${size}×${size})`);
}

await raster(faviconSvg, 'favicon-16x16.png', 16);
await raster(faviconSvg, 'favicon-32x32.png', 32);
await raster(faviconSvg, 'apple-touch-icon.png', 180);
await raster(faviconSvg, 'icon-192.png', 192);
await raster(faviconSvg, 'icon-512.png', 512);

// Maskable-ish icon: mark centered on canvas with padding
const maskable = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <rect width="512" height="512" fill="#0A0A0A"/>
  <g transform="translate(96,96) scale(3.2)" fill="#FFFFFF">
    <rect x="22" y="68" width="36" height="12" rx="6" opacity="0.4"/>
    <rect x="32" y="48" width="36" height="12" rx="6" opacity="0.7"/>
    <rect x="42" y="28" width="36" height="12" rx="6"/>
  </g>
</svg>`);
await sharp(maskable).png().toFile(path.join(out, 'icon-512-maskable.png'));
console.log('✓ icon-512-maskable.png');

// Transparent mark for legacy uses
await sharp(markSvg).resize(512, 512).png().toFile(path.join(out, 'mark.png'));
console.log('✓ mark.png');

// OG image
await sharp(ogSvg).png().toFile(path.join(out, 'og.png'));
console.log('✓ og.png (1200×630)');

// Square share variant (profile / link previews that prefer 1:1)
const squareShare = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200" fill="none">
  <rect width="1200" height="1200" fill="#0A0A0A"/>
  <g transform="translate(420, 340)" fill="#FFFFFF">
    <rect x="0" y="160" width="144" height="48" rx="24" opacity="0.4"/>
    <rect x="40" y="80" width="144" height="48" rx="24" opacity="0.7"/>
    <rect x="80" y="0" width="144" height="48" rx="24"/>
  </g>
  <text x="600" y="720" text-anchor="middle"
    font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
    font-size="72" fill="#FFFFFF" letter-spacing="-3.5">
    <tspan font-weight="400">token</tspan><tspan font-weight="900">maxer</tspan><tspan font-weight="400" fill="#999999">.quest</tspan>
  </text>
</svg>`);
await sharp(squareShare).png().toFile(path.join(out, 'og-square.png'));
console.log('✓ og-square.png (1200x1200)');

// Minimal web manifest
await writeFile(
    path.join(out, 'site.webmanifest'),
    JSON.stringify(
        {
            name: 'tokenmaxer.quest',
            short_name: 'tokenmaxer',
            description:
                'Public token leaderboard for AI builders on Claude Code and Codex.',
            start_url: '/',
            display: 'standalone',
            background_color: '#0a0a0a',
            theme_color: '#0a0a0a',
            icons: [
                {
                    src: '/icon-192.png',
                    sizes: '192x192',
                    type: 'image/png',
                },
                {
                    src: '/icon-512.png',
                    sizes: '512x512',
                    type: 'image/png',
                },
                {
                    src: '/icon-512-maskable.png',
                    sizes: '512x512',
                    type: 'image/png',
                    purpose: 'maskable',
                },
            ],
        },
        null,
        2,
    ),
);
console.log('✓ site.webmanifest');

console.log('\nDone → public/');
