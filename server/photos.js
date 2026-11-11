import multer from 'multer';
import sharp from 'sharp';
import { query } from './db.js';

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

export async function savePhoto(memberId, file) {
  if (!file) {
    const err = new Error('Please choose an image file (max 10 MB).');
    err.status = 400;
    throw err;
  }
  const jpeg = await sharp(file.buffer)
    .rotate()
    .resize(512, 512, { fit: 'cover' })
    .jpeg({ quality: 82 })
    .toBuffer();
  const { rows } = await query(
    `UPDATE members SET photo = $2, photo_mime = 'image/jpeg', photo_version = photo_version + 1, updated_at = now()
     WHERE id = $1 RETURNING photo_version`,
    [memberId, jpeg],
  );
  return rows[0]?.photo_version;
}

export async function removePhoto(memberId) {
  await query(
    `UPDATE members SET photo = NULL, photo_mime = NULL, photo_version = photo_version + 1, updated_at = now() WHERE id = $1`,
    [memberId],
  );
}
