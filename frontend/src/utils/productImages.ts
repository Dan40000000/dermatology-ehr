import type { ProductCategory } from '../types';

type ProductImageSource = {
  name: string;
  brand?: string | null;
  category: ProductCategory | string;
  sku?: string | null;
  imageUrl?: string | null;
};

const PRODUCT_IMAGE_BASE_PATH = '/images/products';

const LOCAL_PRODUCT_IMAGES_BY_SKU: Record<string, string> = {
  'SPF-TINT-50': 'sunscreen-mineral-tube.jpg',
  'SPF-CLEAR-46': 'sunscreen-beach-bottle.jpg',
  'SPF-MIN-MATTE': 'sunscreen-tube-stone.jpg',
  'SPF-BODY-50': 'sunscreen-beach-bottle.jpg',
  'SPF-KIDS-MIN': 'sunscreen-beach-bottle.jpg',
  'SPF-STICK-SPORT': 'sunscreen-stick-style.jpg',
  'SPF-POWDER-BRUSH': 'powder-brush-compact.jpg',
  'SPF-LIP-BALM': 'lip-balm-hand.jpg',
  'SPF-ROSACEA-TINT': 'sunscreen-mineral-tube.jpg',
  'SPF-MELASMA-DEF': 'sunscreen-tube-stone.jpg',
  'CLN-GENTLE-GEL': 'cleanser-bottle-neutral.jpg',
  'CLN-HYD-CREAM': 'cleanser-pump-white.jpg',
  'CLN-ACNE-SA': 'cleanser-bottle-neutral.jpg',
  'CLN-BPO-4': 'skincare-tube-yellow.jpg',
  'CLN-ECZEMA': 'cream-tube-brown.jpg',
  'CRM-BARRIER': 'cream-cerave-style.jpg',
  'LOT-LIGHT-DAILY': 'skincare-set-bottles.jpg',
  'CRM-RICH-REPAIR': 'cream-jar-blue.jpg',
  'OINT-HEALING': 'ointment-hand-jar.jpg',
  'CRM-HAND-ECZEMA': 'cream-tube-brown.jpg',
  'ACNE-BPO-SPOT': 'skincare-tube-yellow.jpg',
  'ACNE-ADAP-01': 'serum-effaclar-style.jpg',
  'ACNE-SA-PADS': 'cotton-pads-skincare.jpg',
  'ACNE-NIACIN-10': 'serum-white-surface.jpg',
  'ACNE-PATCH-XL': 'first-aid-flatlay.jpg',
  'ACNE-BODY-SPRAY': 'skincare-floral-bottle.jpg',
  'AZE-REDNESS-10': 'serum-dropper-hand.jpg',
  'SER-VITC-15': 'serum-ampoules.jpg',
  'SER-HA-HYDRATE': 'serum-bottles-beige.jpg',
  'RETINOL-03': 'serum-pink-hand.jpg',
  'RETINAL-ADV': 'cream-jar-purple.jpg',
  'EYE-PEPTIDE': 'cream-jar-red.jpg',
  'PAD-GLYCOLIC-10': 'cotton-pads-skincare.jpg',
  'SER-TRANEX': 'serum-dropper-minimal.jpg',
  'SER-GROWTH': 'serum-hand-natural.jpg',
  'CRM-NECK-FIRM': 'cream-jars-linen.jpg',
  'CRM-LIPID-RESTORE': 'cream-jars-soft.jpg',
  'POST-LASER-KIT': 'first-aid-supplies.jpg',
  'POST-PEEL-KIT': 'skincare-marble-set.jpg',
  'POST-BIOPSY-KIT': 'first-aid-flatlay.jpg',
  'SCAR-SIL-GEL': 'ointment-hand-jar.jpg',
  'SCAR-SIL-SHEETS': 'first-aid-kit-pink.jpg',
  'POST-HYDRO-BAND': 'first-aid-gray-kit.jpg',
  'POST-COOL-MASK': 'cotton-pads-wood.jpg',
  'POST-BARRIER-BALM': 'ointment-hand-jar.jpg',
  'POST-SCAR-SPF': 'sunscreen-stick-style.jpg',
  'POST-SOAK-KIT': 'first-aid-supplies.jpg',
  'HAIR-MINOX-FOAM': 'skincare-set-bottles.jpg',
  'HAIR-SCALP-SERUM': 'serum-white-surface.jpg',
  'NAIL-REPAIR-LACQ': 'nail-polish-silver.jpg',
};

export function getDefaultProductImageUrlForSku(sku?: string | null): string | undefined {
  const normalizedSku = sku?.trim().toUpperCase();
  const imageName = normalizedSku ? LOCAL_PRODUCT_IMAGES_BY_SKU[normalizedSku] : undefined;
  return imageName ? `${PRODUCT_IMAGE_BASE_PATH}/${imageName}` : undefined;
}

export function isLegacyGeneratedProductImageUrl(imageUrl?: string | null): boolean {
  if (!imageUrl) return false;
  return (
    imageUrl.startsWith('data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22') &&
    imageUrl.includes('width%3D%22900%22%20height%3D%22600%22%20viewBox%3D%220%200%20900%20600%22')
  );
}

const CATEGORY_PALETTES: Record<string, { background: string; surface: string; accent: string; text: string }> = {
  sunscreen: { background: '#fff7ed', surface: '#ffffff', accent: '#f59e0b', text: '#78350f' },
  skincare: { background: '#ecfeff', surface: '#ffffff', accent: '#0f766e', text: '#134e4a' },
  cosmetic: { background: '#fdf2f8', surface: '#ffffff', accent: '#db2777', text: '#831843' },
  post_procedure: { background: '#eff6ff', surface: '#ffffff', accent: '#2563eb', text: '#1e3a8a' },
  prescription: { background: '#f8fafc', surface: '#ffffff', accent: '#64748b', text: '#334155' },
};

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function categoryLabel(value: string): string {
  if (value === 'post_procedure') return 'Post Procedure';
  if (value === 'sunscreen') return 'Sunscreen';
  if (value === 'cosmetic') return 'Cosmetic';
  if (value === 'skincare') return 'Skincare';
  return value || 'Product';
}

function splitName(name: string): [string, string] {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 3) return [words.join(' '), ''];
  return [words.slice(0, 3).join(' '), words.slice(3, 6).join(' ')];
}

export function buildProductImageDataUrl(product: ProductImageSource): string {
  const palette = CATEGORY_PALETTES[String(product.category)] || CATEGORY_PALETTES.skincare;
  const [lineOne, lineTwo] = splitName(product.name || 'Derm Product');
  const brand = product.brand || 'Office Store';
  const category = categoryLabel(String(product.category || 'Product'));
  const sku = product.sku || category;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${palette.background}"/>
      <stop offset="1" stop-color="#ffffff"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="20" stdDeviation="18" flood-color="#0f172a" flood-opacity="0.18"/>
    </filter>
  </defs>
  <rect width="900" height="600" fill="url(#bg)"/>
  <circle cx="760" cy="98" r="96" fill="${palette.accent}" opacity="0.14"/>
  <circle cx="134" cy="488" r="132" fill="${palette.accent}" opacity="0.10"/>
  <g filter="url(#shadow)">
    <rect x="338" y="94" width="224" height="392" rx="34" fill="${palette.surface}"/>
    <rect x="392" y="58" width="116" height="66" rx="18" fill="${palette.accent}"/>
    <rect x="376" y="210" width="148" height="128" rx="18" fill="${palette.accent}" opacity="0.14"/>
    <rect x="394" y="226" width="112" height="20" rx="10" fill="${palette.accent}" opacity="0.38"/>
    <rect x="394" y="260" width="112" height="12" rx="6" fill="${palette.accent}" opacity="0.24"/>
    <rect x="394" y="284" width="88" height="12" rx="6" fill="${palette.accent}" opacity="0.20"/>
    <text x="450" y="378" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="800" fill="${palette.text}">${escapeSvgText(brand)}</text>
    <text x="450" y="418" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" fill="#475569">${escapeSvgText(sku)}</text>
  </g>
  <text x="58" y="82" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="900" fill="${palette.accent}" letter-spacing="0">${escapeSvgText(category.toUpperCase())}</text>
  <text x="58" y="142" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="900" fill="${palette.text}">${escapeSvgText(lineOne)}</text>
  ${lineTwo ? `<text x="58" y="192" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="800" fill="${palette.text}" opacity="0.84">${escapeSvgText(lineTwo)}</text>` : ''}
</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`;
}

export function getProductImageUrl(product: ProductImageSource): string {
  const providedImageUrl = product.imageUrl?.trim();
  if (providedImageUrl && !isLegacyGeneratedProductImageUrl(providedImageUrl)) return providedImageUrl;

  return getDefaultProductImageUrlForSku(product.sku) || buildProductImageDataUrl(product);
}
