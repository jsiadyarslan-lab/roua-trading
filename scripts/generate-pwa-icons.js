const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const SVG_PATH = path.join(__dirname, '..', 'apps', 'web', 'public', 'logo.svg');
const OUT_DIR = path.join(__dirname, '..', 'apps', 'web', 'public');

async function generateIcons() {
  if (!fs.existsSync(SVG_PATH)) {
    console.error('logo.svg not found at', SVG_PATH);
    process.exit(1);
  }

  const svgBuffer = fs.readFileSync(SVG_PATH);

  // Generate 192x192
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(OUT_DIR, 'logo-192.png'));
  console.log('✓ Generated logo-192.png');

  // Generate 512x512
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(OUT_DIR, 'logo-512.png'));
  console.log('✓ Generated logo-512.png');
}

generateIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
