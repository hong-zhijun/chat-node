const sharp = require('sharp');
const config = require('../../config');

async function getImageMeta(filePath) {
  const meta = await sharp(filePath).metadata();
  return { width: meta.width, height: meta.height, format: meta.format };
}

async function makeThumbnail(srcPath, destPath) {
  await sharp(srcPath)
    .rotate()
    .resize({
      width: config.thumbnail.maxEdge,
      height: config.thumbnail.maxEdge,
      fit: 'inside',
      withoutEnlargement: true
    })
    .jpeg({ quality: config.thumbnail.quality })
    .toFile(destPath);
}

module.exports = { getImageMeta, makeThumbnail };
