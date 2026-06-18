const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const W = 1200;
const H = 630;

const ASSETS = path.join(__dirname, 'assets');
const FONTS = path.join(ASSETS, 'fonts');

const cormorantRegB64 = fs.readFileSync(path.join(FONTS, 'CormorantGaramond-Regular.ttf')).toString('base64');
const cormorantItalicB64 = fs.readFileSync(path.join(FONTS, 'CormorantGaramond-Italic.ttf')).toString('base64');
const interB64 = fs.readFileSync(path.join(FONTS, 'Inter.ttf')).toString('base64');

const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <style>
      @font-face {
        font-family: 'CormorantGaramond';
        font-style: normal;
        src: url('data:font/ttf;base64,${cormorantRegB64}') format('truetype');
      }
      @font-face {
        font-family: 'CormorantGaramond';
        font-style: italic;
        src: url('data:font/ttf;base64,${cormorantItalicB64}') format('truetype');
      }
      @font-face {
        font-family: 'Inter';
        font-style: normal;
        src: url('data:font/ttf;base64,${interB64}') format('truetype');
      }
    </style>
  </defs>

  <!-- Dark green overlay -->
  <rect width="${W}" height="${H}" fill="rgba(15,50,35,0.55)"/>

  <!-- GOSCINIAK -->
  <text
    x="50%"
    y="45%"
    text-anchor="middle"
    dominant-baseline="middle"
    font-family="CormorantGaramond, serif"
    font-size="108"
    font-weight="400"
    letter-spacing="18"
    fill="white"
  >GOSCINIAK</text>

  <!-- AVOCAT — BARREAU D'AIX-EN-PROVENCE -->
  <text
    x="50%"
    y="62%"
    text-anchor="middle"
    dominant-baseline="middle"
    font-family="Inter, sans-serif"
    font-size="20"
    font-weight="400"
    letter-spacing="6"
    fill="#C4872A"
  >AVOCAT — BARREAU D'AIX-EN-PROVENCE</text>

  <!-- Separator line -->
  <line x1="480" y1="72%" x2="720" y2="72%" stroke="rgba(196,135,42,0.5)" stroke-width="1"/>

  <!-- Droit bancaire & Contentieux commercial -->
  <text
    x="50%"
    y="80%"
    text-anchor="middle"
    dominant-baseline="middle"
    font-family="CormorantGaramond, serif"
    font-size="30"
    font-style="italic"
    font-weight="300"
    fill="rgba(255,255,255,0.85)"
  >Droit bancaire &amp; Contentieux commercial</text>
</svg>`);

async function generate() {
  const bg = await sharp(path.join(ASSETS, 'marble-hero.jpg'))
    .resize(W, H, { fit: 'cover', position: 'centre' })
    .toBuffer();

  await sharp(bg)
    .composite([{ input: overlay, top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toFile(path.join(ASSETS, 'og-image.jpg'));

  console.log('og-image.jpg generated successfully');
}

generate().catch(err => { console.error(err); process.exit(1); });
