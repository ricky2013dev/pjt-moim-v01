export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn);

export async function api(path, { method = 'GET', body, form } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/login')) onUnauthorized(data?.error);
    throw new ApiError(data?.error || 'Network error. Please try again.', res.status);
  }
  return data;
}

// Shrink big phone photos in the browser before upload.
export async function prepareImage(file, max = 1024) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.88));
    return blob || file;
  } catch {
    return file;
  }
}

export async function uploadPhoto(path, file) {
  const form = new FormData();
  form.append('photo', await prepareImage(file), 'photo.jpg');
  return api(path, { method: 'PUT', form });
}

export function timeAgo(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

// Opens the address in the phone's map app (or Google Maps in a browser).
export const mapUrl = (address) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

// Keep digits and a leading "+" so phone and Messages apps recognize the number.
export const cleanPhone = (p) => String(p || '').trim().replace(/(?!^\+)[^\d]/g, '');

// A member's numbers that are filled in, in order.
export const phonesOf = (m) => [['Phone', m?.phone], ['Phone 2', m?.phone2]]
  .filter(([, p]) => cleanPhone(p))
  .map(([label, phone]) => ({ label, phone }));

// Formats as you type: 214-531-1234 (US), 010-1234-5678 (numbers starting with 0).
// Numbers starting with "+" or lists with commas are left as typed.
export function formatPhone(v) {
  if (/^\s*\+|[,;]/.test(v)) return v;
  const d = v.replace(/\D/g, '');
  const [a, b] = d.startsWith('0') ? [3, d.length > 10 ? 4 : 3] : [3, 3];
  if (d.length <= a) return d;
  if (d.length <= a + b) return `${d.slice(0, a)}-${d.slice(a)}`;
  return `${d.slice(0, a)}-${d.slice(a, a + b)}-${d.slice(a + b, a + b + 4)}`;
}
