import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

await mkdir('assets', { recursive: true });

const iconSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#111d52"/><stop offset="1" stop-color="#030719"/></linearGradient>
  <linearGradient id="ribbon" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#22d3ee"/><stop offset=".52" stop-color="#3b82f6"/><stop offset="1" stop-color="#c084fc"/></linearGradient>
  <linearGradient id="arc" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#22d3ee"/><stop offset="1" stop-color="#9333ea"/></linearGradient>
</defs>
<rect width="1024" height="1024" fill="url(#bg)"/>
<circle cx="512" cy="470" r="355" fill="none" stroke="url(#arc)" stroke-width="26" stroke-linecap="round" stroke-dasharray="1720 520" transform="rotate(-48 512 470)" opacity=".95"/>
<path d="M700 270 C620 220 420 250 365 355 C296 492 506 488 637 550 C764 610 688 778 508 778 C436 778 364 747 315 704" fill="none" stroke="url(#ribbon)" stroke-width="112" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M512 786 C435 720 335 720 260 748 M512 786 C589 720 689 720 764 748 M512 786 L512 842" fill="none" stroke="#f4f6ff" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M512 842 C434 780 341 777 270 805 M512 842 C590 780 683 777 754 805" fill="none" stroke="#dbeafe" stroke-width="15" stroke-linecap="round" opacity=".95"/>
<path d="M805 200 L826 252 L878 273 L826 294 L805 346 L784 294 L732 273 L784 252 Z" fill="#fff" />
</svg>`);
const splashSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732">
<defs>
  <radialGradient id="bg" cx=".5" cy=".42" r=".72"><stop stop-color="#17235c"/><stop offset=".62" stop-color="#0b1238"/><stop offset="1" stop-color="#030719"/></radialGradient>
  <linearGradient id="ribbon" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#22d3ee"/><stop offset=".52" stop-color="#3b82f6"/><stop offset="1" stop-color="#c084fc"/></linearGradient>
  <linearGradient id="arc" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#22d3ee"/><stop offset="1" stop-color="#9333ea"/></linearGradient>
</defs>
<rect width="2732" height="2732" fill="url(#bg)"/>
<circle cx="1366" cy="1050" r="690" fill="none" stroke="#8aa2ff" stroke-opacity=".12" stroke-width="5"/>
<circle cx="1366" cy="1050" r="560" fill="none" stroke="#8aa2ff" stroke-opacity=".10" stroke-width="4"/>
<g transform="translate(1366 1050) scale(1.45) translate(-512 -512)">
  <circle cx="512" cy="470" r="355" fill="none" stroke="url(#arc)" stroke-width="26" stroke-linecap="round" stroke-dasharray="1720 520" transform="rotate(-48 512 470)" opacity=".95"/>
  <path d="M700 270 C620 220 420 250 365 355 C296 492 506 488 637 550 C764 610 688 778 508 778 C436 778 364 747 315 704" fill="none" stroke="url(#ribbon)" stroke-width="112" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M512 786 C435 720 335 720 260 748 M512 786 C589 720 689 720 764 748 M512 786 L512 842" fill="none" stroke="#f4f6ff" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M512 842 C434 780 341 777 270 805 M512 842 C590 780 683 777 754 805" fill="none" stroke="#dbeafe" stroke-width="15" stroke-linecap="round" opacity=".95"/>
  <path d="M805 200 L826 252 L878 273 L826 294 L805 346 L784 294 L732 273 L784 252 Z" fill="#fff"/>
</g>
<text x="1366" y="2070" text-anchor="middle" font-family="Arial,sans-serif" font-size="150" font-weight="700" letter-spacing="8" fill="#f7f8ff">SAI SATHWIKA</text>
<path d="M825 2155 Q1366 2040 1907 2155" fill="none" stroke="url(#ribbon)" stroke-width="22" stroke-linecap="round"/>
<text x="1366" y="2265" text-anchor="middle" font-family="Arial,sans-serif" font-size="54" font-weight="600" letter-spacing="12" fill="#c6d1f4">FRESHNESS AT YOUR DOORSTEP</text>
</svg>`);

await sharp(iconSvg).png().toFile('assets/icon-only.png');
await sharp(splashSvg).png().toFile('assets/splash.png');
console.log('Generated the Sai Sathwika blue-purple Android icon and matching launch splash assets.');
