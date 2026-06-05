import crypto from "crypto";
import { pool } from "../db/pool";

// Types
export type ProductCategory = 'skincare' | 'sunscreen' | 'cosmetic' | 'prescription' | 'post_procedure';
export type PaymentMethod = 'cash' | 'credit' | 'debit' | 'check' | 'insurance' | 'gift_card';
export type SaleStatus = 'pending' | 'completed' | 'refunded' | 'cancelled';
export type TransactionType = 'received' | 'sold' | 'adjustment' | 'return' | 'damaged' | 'expired';
export type DiscountType = 'percentage' | 'fixed' | 'loyalty';
export type StoreFulfillmentStatus = 'awaiting_payment' | 'paid' | 'packing' | 'label_created' | 'shipped' | 'delivered' | 'exception' | 'cancelled';
export type StoreNotificationStatus = 'queued' | 'sent' | 'failed' | 'muted';
export type StoreShippingMethod = 'standard' | 'priority' | 'pickup';
export type StorePromotionType = 'percentage' | 'fixed' | 'free_shipping';

export interface Product {
  id: string;
  tenantId: string;
  sku: string;
  name: string;
  description?: string;
  category: ProductCategory;
  brand?: string;
  price: number; // in cents
  cost: number; // in cents
  inventoryCount: number;
  reorderPoint: number;
  isActive: boolean;
  imageUrl?: string;
  barcode?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaleItem {
  productId: string;
  quantity: number;
  unitPrice?: number; // Override price if needed
  discountAmount?: number;
}

export interface PaymentInfo {
  method: PaymentMethod;
  reference?: string;
}

export interface Sale {
  id: string;
  tenantId: string;
  patientId: string;
  encounterId?: string;
  soldBy: string;
  saleDate: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentReference?: string;
  status: SaleStatus;
  promotionCode?: string;
  promotionSummary?: StorePromotionQuote | Record<string, unknown>;
  items?: SaleItemDetail[];
  patientFirstName?: string;
  patientLastName?: string;
}

export interface SaleItemDetail {
  id: string;
  saleId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  lineTotal: number;
  productName: string;
  productSku: string;
  imageUrl?: string;
}

export interface ProductRecommendation {
  id: string;
  tenantId: string;
  conditionCode: string;
  conditionDescription?: string;
  productIds: string[];
  recommendationText?: string;
  priority: number;
  isActive: boolean;
  products?: Product[];
}

export interface SalesReportFilters {
  startDate?: string;
  endDate?: string;
  category?: ProductCategory;
  soldBy?: string;
}

export interface SalesReport {
  totalSales: number;
  totalRevenue: number;
  totalDiscounts: number;
  totalTax: number;
  uniqueCustomers: number;
  topProducts: Array<{
    productId: string;
    productName: string;
    quantitySold: number;
    revenue: number;
  }>;
  salesByCategory: Array<{
    category: ProductCategory;
    count: number;
    revenue: number;
  }>;
  dailySales: Array<{
    date: string;
    count: number;
    revenue: number;
  }>;
}

function isDateOnlyFilterValue(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function buildProductSaleDateRangeSql(
  column: string,
  startDate?: string,
  endDate?: string,
  firstParamIndex = 1
): { conditions: string[]; params: string[]; nextParamIndex: number } {
  const conditions: string[] = [];
  const params: string[] = [];
  let paramIndex = firstParamIndex;

  if (startDate) {
    conditions.push(
      isDateOnlyFilterValue(startDate)
        ? `${column} >= $${paramIndex}::date`
        : `${column} >= $${paramIndex}::timestamptz`
    );
    params.push(startDate);
    paramIndex++;
  }

  if (endDate) {
    conditions.push(
      isDateOnlyFilterValue(endDate)
        ? `${column} < ($${paramIndex}::date + interval '1 day')`
        : `${column} <= $${paramIndex}::timestamptz`
    );
    params.push(endDate);
    paramIndex++;
  }

  return { conditions, params, nextParamIndex: paramIndex };
}

export interface StoreShippingAddress {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone?: string;
}

export interface StoreOrder extends Sale {
  channel: 'patient_portal' | 'public_store' | 'staff';
  fulfillmentStatus: StoreFulfillmentStatus;
  shippingMethod: StoreShippingMethod;
  shippingFee?: number;
  shippingDiscount?: number;
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  shippingAddress?: StoreShippingAddress | Record<string, unknown>;
  notificationEmail?: string;
  notificationStatus: StoreNotificationStatus;
  lastNotificationAt?: string;
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
  stripePaymentStatus: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StoreFulfillmentInput {
  channel?: 'patient_portal' | 'public_store' | 'staff';
  fulfillmentStatus?: StoreFulfillmentStatus;
  shippingMethod?: StoreShippingMethod;
  shippingFee?: number;
  shippingDiscount?: number;
  carrier?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  shippingAddress?: StoreShippingAddress | Record<string, unknown>;
  notificationEmail?: string | null;
  notificationStatus?: StoreNotificationStatus;
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  stripePaymentStatus?: string;
}

export interface StorePromotion {
  id: string;
  tenantId: string;
  name: string;
  code?: string;
  promotionType: StorePromotionType;
  value: number;
  minimumSubtotal: number;
  startsAt?: string;
  endsAt?: string;
  isActive: boolean;
  isAutomatic: boolean;
  appliesTo: 'order';
  maxRedemptions?: number;
  redemptionCount: number;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StorePromotionInput {
  name: string;
  code?: string | null;
  promotionType: StorePromotionType;
  value: number;
  minimumSubtotal?: number;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive?: boolean;
  isAutomatic?: boolean;
  maxRedemptions?: number | null;
}

export interface StorePromotionApplication {
  id: string;
  name: string;
  code?: string;
  promotionType: StorePromotionType;
  discountCents: number;
  minimumSubtotal: number;
  source: 'automatic' | 'code';
}

export interface StorePromotionQuote {
  subtotal: number;
  itemDiscount: number;
  shippingDiscount: number;
  shippingFee: number;
  tax: number;
  total: number;
  promotionCode?: string;
  appliedPromotions: StorePromotionApplication[];
}

interface StorePromotionQuoteRequest {
  items: SaleItem[];
  shippingMethod?: StoreShippingMethod;
  promotionCode?: string | null;
}

interface SalePromotionContext {
  code?: string;
  summary?: StorePromotionQuote | Record<string, unknown>;
}

// Tax rate (configurable per tenant in production)
const DEFAULT_TAX_RATE = 0.0825; // 8.25%

export function getStoreShippingFee(method: StoreShippingMethod = 'standard'): number {
  if (method === 'priority') return 995;
  if (method === 'pickup') return 0;
  return 595;
}

function normalizePromotionCode(value?: string | null): string | undefined {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized || undefined;
}

function toNullableDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

interface StoreCatalogSeedProduct {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: ProductCategory;
  brand: string;
  price: number;
  cost: number;
  inventoryCount: number;
  reorderPoint: number;
  imageUrl?: string;
}

const PRODUCT_IMAGE_BASE_PATH = '/images/products';

const DEFAULT_PRODUCT_IMAGES_BY_SKU: Record<string, string> = {
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

function defaultProductImageUrlForSku(sku: string): string | undefined {
  const imageName = DEFAULT_PRODUCT_IMAGES_BY_SKU[sku.trim().toUpperCase()];
  return imageName ? `${PRODUCT_IMAGE_BASE_PATH}/${imageName}` : undefined;
}

const SEED_IMAGE_PALETTES: Record<ProductCategory, { background: string; accent: string; text: string }> = {
  sunscreen: { background: '#fff7ed', accent: '#f59e0b', text: '#78350f' },
  skincare: { background: '#ecfeff', accent: '#0f766e', text: '#134e4a' },
  cosmetic: { background: '#fdf2f8', accent: '#db2777', text: '#831843' },
  post_procedure: { background: '#eff6ff', accent: '#2563eb', text: '#1e3a8a' },
  prescription: { background: '#f8fafc', accent: '#64748b', text: '#334155' },
};

function escapeSeedImageText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function seedCategoryLabel(category: ProductCategory): string {
  if (category === 'post_procedure') return 'Post Procedure';
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function splitSeedImageName(name: string): [string, string] {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 3) return [words.join(' '), ''];
  return [words.slice(0, 3).join(' '), words.slice(3, 6).join(' ')];
}

function buildSeedProductImageUrl(product: StoreCatalogSeedProduct): string {
  const palette = SEED_IMAGE_PALETTES[product.category] || SEED_IMAGE_PALETTES.skincare;
  const [lineOne, lineTwo] = splitSeedImageName(product.name);
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
    <rect x="338" y="94" width="224" height="392" rx="34" fill="#ffffff"/>
    <rect x="392" y="58" width="116" height="66" rx="18" fill="${palette.accent}"/>
    <rect x="376" y="210" width="148" height="128" rx="18" fill="${palette.accent}" opacity="0.14"/>
    <rect x="394" y="226" width="112" height="20" rx="10" fill="${palette.accent}" opacity="0.38"/>
    <rect x="394" y="260" width="112" height="12" rx="6" fill="${palette.accent}" opacity="0.24"/>
    <rect x="394" y="284" width="88" height="12" rx="6" fill="${palette.accent}" opacity="0.20"/>
    <text x="450" y="378" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="800" fill="${palette.text}">${escapeSeedImageText(product.brand)}</text>
    <text x="450" y="418" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" fill="#475569">${escapeSeedImageText(product.sku)}</text>
  </g>
  <text x="58" y="82" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="900" fill="${palette.accent}" letter-spacing="0">${escapeSeedImageText(seedCategoryLabel(product.category).toUpperCase())}</text>
  <text x="58" y="142" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="900" fill="${palette.text}">${escapeSeedImageText(lineOne)}</text>
  ${lineTwo ? `<text x="58" y="192" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="800" fill="${palette.text}" opacity="0.84">${escapeSeedImageText(lineTwo)}</text>` : ''}
</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`;
}

const EXPANDED_STORE_CATALOG: StoreCatalogSeedProduct[] = [
  { id: '10000000-0000-4000-8000-000000000001', sku: 'SPF-TINT-50', name: 'Tinted Mineral SPF 50', description: 'Broad-spectrum mineral sunscreen with a sheer tint for daily face coverage.', category: 'sunscreen', brand: 'ClearDerm', price: 4200, cost: 1850, inventoryCount: 36, reorderPoint: 8 },
  { id: '10000000-0000-4000-8000-000000000002', sku: 'SPF-CLEAR-46', name: 'Clear Daily SPF 46', description: 'Lightweight niacinamide sunscreen for acne-prone or sensitive skin.', category: 'sunscreen', brand: 'EltaMD', price: 4300, cost: 2100, inventoryCount: 42, reorderPoint: 10 },
  { id: '10000000-0000-4000-8000-000000000003', sku: 'SPF-MIN-MATTE', name: 'Matte Mineral SPF 40', description: 'Oil-control mineral sunscreen with a soft matte finish.', category: 'sunscreen', brand: 'La Roche-Posay', price: 3899, cost: 1760, inventoryCount: 28, reorderPoint: 8 },
  { id: '10000000-0000-4000-8000-000000000004', sku: 'SPF-BODY-50', name: 'Body Shield SPF 50', description: 'Water-resistant body sunscreen for outdoor activity.', category: 'sunscreen', brand: 'Neutrogena', price: 1799, cost: 820, inventoryCount: 54, reorderPoint: 14 },
  { id: '10000000-0000-4000-8000-000000000005', sku: 'SPF-KIDS-MIN', name: 'Kids Mineral SPF 50', description: 'Gentle zinc-based sunscreen for children and reactive skin.', category: 'sunscreen', brand: 'Blue Lizard', price: 2499, cost: 1125, inventoryCount: 24, reorderPoint: 8 },
  { id: '10000000-0000-4000-8000-000000000006', sku: 'SPF-STICK-SPORT', name: 'Sport SPF 50 Stick', description: 'Pocket-size sunscreen stick for ears, nose, scars, and reapplication.', category: 'sunscreen', brand: 'ClearDerm', price: 1899, cost: 760, inventoryCount: 40, reorderPoint: 12 },
  { id: '10000000-0000-4000-8000-000000000007', sku: 'SPF-POWDER-BRUSH', name: 'Brush-On SPF 30 Powder', description: 'Translucent mineral powder for reapplying SPF over makeup.', category: 'sunscreen', brand: 'Colorescience', price: 6900, cost: 3450, inventoryCount: 16, reorderPoint: 5 },
  { id: '10000000-0000-4000-8000-000000000008', sku: 'SPF-LIP-BALM', name: 'SPF 36 Lip Balm', description: 'Moisturizing lip protection for daily sun exposure.', category: 'sunscreen', brand: 'EltaMD', price: 1400, cost: 610, inventoryCount: 50, reorderPoint: 14 },
  { id: '10000000-0000-4000-8000-000000000009', sku: 'SPF-ROSACEA-TINT', name: 'Rosacea Calming Tinted SPF', description: 'Mineral sunscreen with green-neutralizing tint for facial redness.', category: 'sunscreen', brand: 'ClearDerm', price: 4600, cost: 2050, inventoryCount: 22, reorderPoint: 7 },
  { id: '10000000-0000-4000-8000-000000000010', sku: 'SPF-MELASMA-DEF', name: 'Melasma Defense SPF 50+', description: 'High-protection iron oxide sunscreen for pigment-prone skin.', category: 'sunscreen', brand: 'SkinCeuticals', price: 5600, cost: 2750, inventoryCount: 18, reorderPoint: 6 },
  { id: '10000000-0000-4000-8000-000000000011', sku: 'CLN-GENTLE-GEL', name: 'Gentle Gel Cleanser', description: 'Low-foam cleanser for normal, combination, and sensitive skin.', category: 'skincare', brand: 'ClearDerm', price: 2400, cost: 900, inventoryCount: 38, reorderPoint: 10 },
  { id: '10000000-0000-4000-8000-000000000012', sku: 'CLN-HYD-CREAM', name: 'Hydrating Cream Cleanser', description: 'Non-stripping cleanser for dry skin, eczema, and retinoid users.', category: 'skincare', brand: 'CeraVe', price: 1699, cost: 760, inventoryCount: 44, reorderPoint: 12 },
  { id: '10000000-0000-4000-8000-000000000013', sku: 'CLN-ACNE-SA', name: 'Salicylic Acid Acne Wash', description: 'Two-percent salicylic wash for clogged pores and oily skin.', category: 'skincare', brand: 'La Roche-Posay', price: 2299, cost: 1040, inventoryCount: 30, reorderPoint: 9 },
  { id: '10000000-0000-4000-8000-000000000014', sku: 'CLN-BPO-4', name: 'Benzoyl Peroxide 4% Wash', description: 'Creamy acne wash for face, chest, back, and folliculitis routines.', category: 'skincare', brand: 'PanOxyl', price: 1499, cost: 640, inventoryCount: 34, reorderPoint: 10 },
  { id: '10000000-0000-4000-8000-000000000015', sku: 'CLN-ECZEMA', name: 'Eczema Relief Body Wash', description: 'Fragrance-free wash with colloidal oatmeal for itch-prone skin.', category: 'skincare', brand: 'Aveeno', price: 1399, cost: 590, inventoryCount: 26, reorderPoint: 8 },
  { id: '10000000-0000-4000-8000-000000000016', sku: 'CRM-BARRIER', name: 'Barrier Repair Cream', description: 'Ceramide-rich moisturizer for irritated, dry, or retinoid-sensitive skin.', category: 'skincare', brand: 'ClearDerm', price: 3600, cost: 1425, inventoryCount: 32, reorderPoint: 8 },
  { id: '10000000-0000-4000-8000-000000000017', sku: 'LOT-LIGHT-DAILY', name: 'Light Daily Moisturizer', description: 'Oil-free daily moisturizer for acne-prone and combination skin.', category: 'skincare', brand: 'CeraVe', price: 1899, cost: 850, inventoryCount: 36, reorderPoint: 10 },
  { id: '10000000-0000-4000-8000-000000000018', sku: 'CRM-RICH-REPAIR', name: 'Rich Repair Cream', description: 'Intensive moisturizer for xerosis, eczema, and winter dryness.', category: 'skincare', brand: 'La Roche-Posay', price: 2499, cost: 1120, inventoryCount: 24, reorderPoint: 8 },
  { id: '10000000-0000-4000-8000-000000000019', sku: 'OINT-HEALING', name: 'Healing Ointment', description: 'Petrolatum-based ointment for wounds, lips, and compromised barrier areas.', category: 'skincare', brand: 'Aquaphor', price: 1299, cost: 560, inventoryCount: 58, reorderPoint: 16 },
  { id: '10000000-0000-4000-8000-000000000020', sku: 'CRM-HAND-ECZEMA', name: 'Hand Eczema Repair Cream', description: 'Thick hand cream for fissures, irritant dermatitis, and frequent washing.', category: 'skincare', brand: 'Vanicream', price: 1599, cost: 700, inventoryCount: 31, reorderPoint: 9 },
  { id: '10000000-0000-4000-8000-000000000021', sku: 'ACNE-BPO-SPOT', name: 'BPO 5% Spot Treatment', description: 'Targeted benzoyl peroxide gel for inflamed acne lesions.', category: 'skincare', brand: 'ClearDerm', price: 1800, cost: 700, inventoryCount: 33, reorderPoint: 10 },
  { id: '10000000-0000-4000-8000-000000000022', sku: 'ACNE-ADAP-01', name: 'Adapalene 0.1% Gel', description: 'OTC retinoid gel for acne maintenance and comedonal breakouts.', category: 'skincare', brand: 'Differin', price: 2199, cost: 960, inventoryCount: 27, reorderPoint: 8 },
  { id: '10000000-0000-4000-8000-000000000023', sku: 'ACNE-SA-PADS', name: 'Salicylic Clarifying Pads', description: 'Textured pads for oily skin, clogged pores, and gym-bag acne routines.', category: 'skincare', brand: 'ClearDerm', price: 2600, cost: 980, inventoryCount: 25, reorderPoint: 8 },
  { id: '10000000-0000-4000-8000-000000000024', sku: 'ACNE-NIACIN-10', name: 'Niacinamide 10% Serum', description: 'Oil-control serum for redness, pores, and post-acne discoloration.', category: 'skincare', brand: 'The Ordinary', price: 799, cost: 350, inventoryCount: 52, reorderPoint: 14 },
  { id: '10000000-0000-4000-8000-000000000025', sku: 'ACNE-PATCH-XL', name: 'Hydrocolloid Acne Patches', description: 'Assorted patches for whiteheads and healing picked spots.', category: 'skincare', brand: 'Hero Cosmetics', price: 1299, cost: 540, inventoryCount: 46, reorderPoint: 12 },
  { id: '10000000-0000-4000-8000-000000000026', sku: 'ACNE-BODY-SPRAY', name: 'Clarifying Body Spray', description: 'Back and chest acne spray with salicylic acid and soothing botanicals.', category: 'skincare', brand: 'ClearDerm', price: 2800, cost: 1100, inventoryCount: 21, reorderPoint: 7 },
  { id: '10000000-0000-4000-8000-000000000027', sku: 'AZE-REDNESS-10', name: 'Azelaic Acid 10% Booster', description: 'Leave-on booster for redness, uneven tone, and blemish-prone skin.', category: 'skincare', brand: "Paula's Choice", price: 3900, cost: 1800, inventoryCount: 20, reorderPoint: 7 },
  { id: '10000000-0000-4000-8000-000000000028', sku: 'SER-VITC-15', name: 'Vitamin C 15% Serum', description: 'Antioxidant serum for brightness, texture, and photodamage support.', category: 'cosmetic', brand: 'SkinCeuticals', price: 16600, cost: 8300, inventoryCount: 15, reorderPoint: 5 },
  { id: '10000000-0000-4000-8000-000000000029', sku: 'SER-HA-HYDRATE', name: 'Hydrating HA Serum', description: 'Hyaluronic acid serum for lightweight plumping hydration.', category: 'cosmetic', brand: 'AesthetiCare', price: 5200, cost: 2100, inventoryCount: 22, reorderPoint: 6 },
  { id: '10000000-0000-4000-8000-000000000030', sku: 'RETINOL-03', name: 'Retinol 0.3% Night Serum', description: 'Starter retinol for texture, fine lines, and preventive skin aging routines.', category: 'cosmetic', brand: 'SkinBetter', price: 8900, cost: 4200, inventoryCount: 14, reorderPoint: 5 },
  { id: '10000000-0000-4000-8000-000000000031', sku: 'RETINAL-ADV', name: 'Advanced Retinal Night Cream', description: 'Higher-strength retinal cream for experienced retinoid users.', category: 'cosmetic', brand: 'Avene', price: 7400, cost: 3350, inventoryCount: 12, reorderPoint: 4 },
  { id: '10000000-0000-4000-8000-000000000032', sku: 'EYE-PEPTIDE', name: 'Peptide Eye Repair', description: 'Peptide eye cream for dryness, crepey texture, and post-procedure support.', category: 'cosmetic', brand: 'AesthetiCare', price: 6400, cost: 2500, inventoryCount: 16, reorderPoint: 5 },
  { id: '10000000-0000-4000-8000-000000000033', sku: 'PAD-GLYCOLIC-10', name: 'Glycolic Renewal Pads', description: 'Ten-percent glycolic pads for dullness, keratosis pilaris, and texture.', category: 'cosmetic', brand: 'ClearDerm', price: 3200, cost: 1200, inventoryCount: 24, reorderPoint: 8 },
  { id: '10000000-0000-4000-8000-000000000034', sku: 'SER-TRANEX', name: 'Tranexamic Brightening Serum', description: 'Pigment-focused serum for melasma-prone and uneven skin tone routines.', category: 'cosmetic', brand: 'SkinCeuticals', price: 9800, cost: 4900, inventoryCount: 13, reorderPoint: 5 },
  { id: '10000000-0000-4000-8000-000000000035', sku: 'SER-GROWTH', name: 'Recovery Growth Factor Serum', description: 'Post-procedure and anti-aging serum for barrier recovery and glow.', category: 'cosmetic', brand: 'AesthetiCare', price: 11800, cost: 5200, inventoryCount: 10, reorderPoint: 4 },
  { id: '10000000-0000-4000-8000-000000000036', sku: 'CRM-NECK-FIRM', name: 'Neck Firming Cream', description: 'Firming cream for neck texture, crepiness, and cosmetic maintenance.', category: 'cosmetic', brand: 'Revision', price: 11200, cost: 5600, inventoryCount: 11, reorderPoint: 4 },
  { id: '10000000-0000-4000-8000-000000000037', sku: 'CRM-LIPID-RESTORE', name: 'Triple Lipid Restore Cream', description: 'Lipid-rich cosmetic moisturizer for dry, mature, or retinoid-treated skin.', category: 'cosmetic', brand: 'SkinCeuticals', price: 15000, cost: 7600, inventoryCount: 12, reorderPoint: 4 },
  { id: '10000000-0000-4000-8000-000000000038', sku: 'POST-LASER-KIT', name: 'Post-Laser Recovery Kit', description: 'Cleanser, balm, compress cloths, and SPF for laser recovery.', category: 'post_procedure', brand: 'AesthetiCare', price: 6800, cost: 2900, inventoryCount: 18, reorderPoint: 6 },
  { id: '10000000-0000-4000-8000-000000000039', sku: 'POST-PEEL-KIT', name: 'Chemical Peel Recovery Kit', description: 'Gentle cleanser, bland moisturizer, ointment, and sunscreen for peel aftercare.', category: 'post_procedure', brand: 'ClearDerm', price: 6200, cost: 2600, inventoryCount: 19, reorderPoint: 6 },
  { id: '10000000-0000-4000-8000-000000000040', sku: 'POST-BIOPSY-KIT', name: 'Biopsy Wound Care Kit', description: 'Petrolatum packets, nonstick pads, paper tape, and wound-care instructions.', category: 'post_procedure', brand: 'ClearDerm', price: 2200, cost: 850, inventoryCount: 44, reorderPoint: 12 },
  { id: '10000000-0000-4000-8000-000000000041', sku: 'SCAR-SIL-GEL', name: 'Silicone Scar Gel', description: 'Clear silicone gel for surgical scars and procedure-site healing.', category: 'post_procedure', brand: 'ScarAway', price: 2499, cost: 1150, inventoryCount: 28, reorderPoint: 8 },
  { id: '10000000-0000-4000-8000-000000000042', sku: 'SCAR-SIL-SHEETS', name: 'Silicone Scar Sheets', description: 'Reusable silicone sheets for hypertrophic scars and incision support.', category: 'post_procedure', brand: 'ScarAway', price: 3199, cost: 1460, inventoryCount: 22, reorderPoint: 7 },
  { id: '10000000-0000-4000-8000-000000000043', sku: 'POST-HYDRO-BAND', name: 'Hydrocolloid Bandages', description: 'Flexible hydrocolloid dressings for small wound coverage.', category: 'post_procedure', brand: 'Band-Aid', price: 999, cost: 420, inventoryCount: 48, reorderPoint: 12 },
  { id: '10000000-0000-4000-8000-000000000044', sku: 'POST-COOL-MASK', name: 'Cooling Recovery Mask', description: 'Single-use cooling mask for laser, microneedling, and peel appointments.', category: 'post_procedure', brand: 'AesthetiCare', price: 1800, cost: 640, inventoryCount: 35, reorderPoint: 10 },
  { id: '10000000-0000-4000-8000-000000000045', sku: 'POST-BARRIER-BALM', name: 'Procedure Barrier Balm', description: 'Bland occlusive balm for resurfacing, biopsy, and irritated skin recovery.', category: 'post_procedure', brand: 'ClearDerm', price: 1600, cost: 620, inventoryCount: 39, reorderPoint: 10 },
  { id: '10000000-0000-4000-8000-000000000046', sku: 'POST-SCAR-SPF', name: 'Scar SPF 50 Stick', description: 'Targeted mineral SPF stick for healing scars and post-procedure pigment control.', category: 'post_procedure', brand: 'La Roche-Posay', price: 1999, cost: 880, inventoryCount: 27, reorderPoint: 8 },
  { id: '10000000-0000-4000-8000-000000000047', sku: 'POST-SOAK-KIT', name: 'Vinegar Soak Kit', description: 'Measuring cup, gauze, and instructions for provider-directed soak routines.', category: 'post_procedure', brand: 'ClearDerm', price: 1500, cost: 500, inventoryCount: 30, reorderPoint: 8 },
  { id: '10000000-0000-4000-8000-000000000048', sku: 'HAIR-MINOX-FOAM', name: 'Minoxidil 5% Foam', description: 'OTC foam for hair thinning maintenance when appropriate for the patient.', category: 'skincare', brand: 'Rogaine', price: 3499, cost: 1700, inventoryCount: 18, reorderPoint: 6 },
  { id: '10000000-0000-4000-8000-000000000049', sku: 'HAIR-SCALP-SERUM', name: 'Soothing Scalp Serum', description: 'Leave-on scalp serum for dryness, itch, and flaking-prone routines.', category: 'skincare', brand: 'ClearDerm', price: 3000, cost: 1200, inventoryCount: 20, reorderPoint: 7 },
  { id: '10000000-0000-4000-8000-000000000050', sku: 'NAIL-REPAIR-LACQ', name: 'Brittle Nail Repair Lacquer', description: 'Hydrating nail lacquer for brittle, peeling, or post-gel damaged nails.', category: 'skincare', brand: 'ISDIN', price: 3200, cost: 1450, inventoryCount: 18, reorderPoint: 6 },
];

const storeReadyTenants = new Set<string>();
const storeReadyTenantPromises = new Map<string, Promise<void>>();

export async function ensureStoreSchemaAndCatalog(tenantId: string): Promise<void> {
  if (storeReadyTenants.has(tenantId)) return;

  const existingPromise = storeReadyTenantPromises.get(tenantId);
  if (existingPromise) {
    await existingPromise;
    return;
  }

  const setupPromise = ensureStoreSchemaAndCatalogInternal(tenantId).then(() => {
    storeReadyTenants.add(tenantId);
  });

  storeReadyTenantPromises.set(tenantId, setupPromise);

  try {
    await setupPromise;
  } finally {
    storeReadyTenantPromises.delete(tenantId);
  }
}

async function ensureStoreSchemaAndCatalogInternal(tenantId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(48151623, 42042)');
    await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        sku TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL,
        brand TEXT,
        price INTEGER NOT NULL DEFAULT 0,
        cost INTEGER NOT NULL DEFAULT 0,
        inventory_count INTEGER NOT NULL DEFAULT 0,
        reorder_point INTEGER NOT NULL DEFAULT 10,
        is_active BOOLEAN NOT NULL DEFAULT true,
        image_url TEXT,
        barcode TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        created_by TEXT,
        UNIQUE(tenant_id, sku)
      )
    `);
    await client.query(`
      ALTER TABLE products
        ADD COLUMN IF NOT EXISTS image_url TEXT
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_sales (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
        encounter_id TEXT REFERENCES encounters(id) ON DELETE SET NULL,
        sold_by TEXT,
        sale_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        subtotal INTEGER NOT NULL DEFAULT 0,
        tax INTEGER NOT NULL DEFAULT 0,
        discount INTEGER NOT NULL DEFAULT 0,
        total INTEGER NOT NULL DEFAULT 0,
        payment_method TEXT NOT NULL DEFAULT 'credit',
        payment_reference TEXT,
        status TEXT NOT NULL DEFAULT 'completed',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      ALTER TABLE product_sales
        ADD COLUMN IF NOT EXISTS patient_id TEXT,
        ADD COLUMN IF NOT EXISTS encounter_id TEXT,
        ADD COLUMN IF NOT EXISTS sold_by TEXT,
        ADD COLUMN IF NOT EXISTS tax INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS discount INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS total INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS promotion_code TEXT,
        ADD COLUMN IF NOT EXISTS promotion_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()
    `);
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'product_sales' AND column_name = 'sale_number'
        ) THEN
          ALTER TABLE product_sales ALTER COLUMN sale_number DROP NOT NULL;
        END IF;
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'product_sales' AND column_name = 'total_amount'
        ) THEN
          ALTER TABLE product_sales ALTER COLUMN total_amount DROP NOT NULL;
        END IF;
      END $$;
    `);
    await client.query(`
      DO $$
      DECLARE constraint_name TEXT;
      BEGIN
        FOR constraint_name IN
          SELECT con.conname
          FROM pg_constraint con
          JOIN pg_attribute att
            ON att.attrelid = con.conrelid
           AND att.attnum = ANY(con.conkey)
          WHERE con.conrelid = 'product_sales'::regclass
            AND con.contype = 'f'
            AND att.attname = 'sold_by'
        LOOP
          EXECUTE format('ALTER TABLE product_sales DROP CONSTRAINT IF EXISTS %I', constraint_name);
        END LOOP;
      END $$;
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_sale_items (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        sale_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price INTEGER NOT NULL DEFAULT 0,
        discount_amount INTEGER NOT NULL DEFAULT 0,
        line_total INTEGER NOT NULL DEFAULT 0,
        product_name TEXT NOT NULL DEFAULT '',
        product_sku TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      ALTER TABLE product_sale_items
        ADD COLUMN IF NOT EXISTS discount_amount INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS product_name TEXT DEFAULT '',
        ADD COLUMN IF NOT EXISTS product_sku TEXT DEFAULT ''
    `);
    await client.query(`
      DO $$
      DECLARE constraint_name TEXT;
      BEGIN
        FOR constraint_name IN
          SELECT con.conname
          FROM pg_constraint con
          JOIN pg_attribute att
            ON att.attrelid = con.conrelid
           AND att.attnum = ANY(con.conkey)
          WHERE con.conrelid = 'product_sale_items'::regclass
            AND con.contype = 'f'
            AND att.attname = 'product_id'
        LOOP
          EXECUTE format('ALTER TABLE product_sale_items DROP CONSTRAINT IF EXISTS %I', constraint_name);
        END LOOP;
      END $$;
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_inventory_transactions (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        reference_id TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        created_by TEXT
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS store_order_fulfillments (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        sale_id TEXT NOT NULL UNIQUE,
        patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        channel TEXT NOT NULL DEFAULT 'patient_portal',
        fulfillment_status TEXT NOT NULL DEFAULT 'paid',
        shipping_method TEXT NOT NULL DEFAULT 'standard',
        shipping_fee INTEGER NOT NULL DEFAULT 0,
        carrier TEXT,
        tracking_number TEXT,
        tracking_url TEXT,
        shipping_address JSONB NOT NULL DEFAULT '{}'::jsonb,
        notification_email TEXT,
        notification_status TEXT NOT NULL DEFAULT 'queued',
        last_notification_at TIMESTAMPTZ,
        stripe_checkout_session_id TEXT,
        stripe_payment_intent_id TEXT,
        stripe_payment_status TEXT NOT NULL DEFAULT 'paid',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      ALTER TABLE store_order_fulfillments
        ADD COLUMN IF NOT EXISTS shipping_discount INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS tracking_url TEXT
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS store_promotions (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        code TEXT,
        promotion_type TEXT NOT NULL,
        value INTEGER NOT NULL DEFAULT 0,
        minimum_subtotal INTEGER NOT NULL DEFAULT 0,
        starts_at TIMESTAMPTZ,
        ends_at TIMESTAMPTZ,
        is_active BOOLEAN NOT NULL DEFAULT true,
        is_automatic BOOLEAN NOT NULL DEFAULT false,
        applies_to TEXT NOT NULL DEFAULT 'order',
        max_redemptions INTEGER,
        redemption_count INTEGER NOT NULL DEFAULT 0,
        created_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_products_category ON products(tenant_id, category);
      CREATE INDEX IF NOT EXISTS idx_products_active ON products(tenant_id) WHERE is_active = true;
      CREATE INDEX IF NOT EXISTS idx_product_sales_tenant ON product_sales(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_product_sales_patient ON product_sales(patient_id);
      CREATE INDEX IF NOT EXISTS idx_product_sales_date ON product_sales(tenant_id, sale_date DESC);
      CREATE INDEX IF NOT EXISTS idx_product_sale_items_sale ON product_sale_items(sale_id);
      CREATE INDEX IF NOT EXISTS idx_store_fulfillments_tenant ON store_order_fulfillments(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_store_fulfillments_sale ON store_order_fulfillments(sale_id);
      CREATE INDEX IF NOT EXISTS idx_store_promotions_tenant_active ON store_promotions(tenant_id, is_active);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_store_promotions_tenant_code_unique
        ON store_promotions(tenant_id, lower(code))
        WHERE code IS NOT NULL AND code <> '';
    `);
    await client.query(`
      ALTER TABLE store_order_fulfillments
        ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT
    `);
    await client.query(`
      CREATE OR REPLACE FUNCTION decrease_product_inventory_on_sale()
      RETURNS TRIGGER AS $$
      BEGIN
        UPDATE products
        SET inventory_count = inventory_count - NEW.quantity,
            updated_at = NOW()
        WHERE id::text = NEW.product_id::text;

        IF FOUND AND (SELECT inventory_count FROM products WHERE id::text = NEW.product_id::text) < 0 THEN
          RAISE EXCEPTION 'Insufficient inventory: not enough units available';
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trigger_decrease_product_inventory ON product_sale_items;
      CREATE TRIGGER trigger_decrease_product_inventory
        AFTER INSERT ON product_sale_items
        FOR EACH ROW
        EXECUTE FUNCTION decrease_product_inventory_on_sale();
    `);
    await client.query(`
      CREATE OR REPLACE FUNCTION log_product_inventory_transaction()
      RETURNS TRIGGER AS $$
      DECLARE
        v_tenant_id TEXT;
        v_sale_id TEXT;
      BEGIN
        SELECT ps.tenant_id, ps.id::text INTO v_tenant_id, v_sale_id
        FROM product_sales ps
        WHERE ps.id::text = NEW.sale_id::text;

        IF v_tenant_id IS NOT NULL THEN
          INSERT INTO product_inventory_transactions (
            tenant_id, product_id, transaction_type, quantity, reference_id, notes, created_at
          ) VALUES (
            v_tenant_id, NEW.product_id::text, 'sold', -NEW.quantity, v_sale_id, 'Sold to patient', NOW()
          );
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trigger_log_product_inventory_on_sale ON product_sale_items;
      CREATE TRIGGER trigger_log_product_inventory_on_sale
        AFTER INSERT ON product_sale_items
        FOR EACH ROW
        EXECUTE FUNCTION log_product_inventory_transaction();
    `);

    for (const product of EXPANDED_STORE_CATALOG) {
      await client.query(
        `INSERT INTO products (
          tenant_id, sku, name, description, category, brand, price, cost,
          inventory_count, reorder_point, is_active, image_url, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, $11, NOW(), NOW())
        ON CONFLICT (tenant_id, sku) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          category = EXCLUDED.category,
          brand = EXCLUDED.brand,
          price = EXCLUDED.price,
          cost = EXCLUDED.cost,
          reorder_point = EXCLUDED.reorder_point,
          image_url = CASE
            WHEN products.image_url IS NULL OR products.image_url = '' THEN EXCLUDED.image_url
            WHEN products.image_url LIKE 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22900%22%20height%3D%22600%22%20viewBox%3D%220%200%20900%20600%22%' THEN EXCLUDED.image_url
            ELSE products.image_url
          END,
          is_active = true,
          updated_at = NOW()`,
        [
          tenantId,
          product.sku,
          product.name,
          product.description,
          product.category,
          product.brand,
          product.price,
          product.cost,
          product.inventoryCount,
          product.reorderPoint,
          product.imageUrl || defaultProductImageUrlForSku(product.sku) || buildSeedProductImageUrl(product),
        ]
      );
    }

    await client.query(
      `INSERT INTO store_promotions (
         tenant_id, name, code, promotion_type, value, minimum_subtotal,
         is_active, is_automatic, applies_to, created_at, updated_at
       )
       SELECT $1, 'Free standard shipping over $80', NULL, 'free_shipping', 0, 8000,
              true, true, 'order', NOW(), NOW()
       WHERE NOT EXISTS (
         SELECT 1 FROM store_promotions
         WHERE tenant_id = $1 AND name = 'Free standard shipping over $80'
       )`,
      [tenantId]
    );

    await client.query(
      `INSERT INTO store_promotions (
         tenant_id, name, code, promotion_type, value, minimum_subtotal,
         is_active, is_automatic, applies_to, created_at, updated_at
       )
       SELECT $1, 'Welcome 10% Off', 'WELCOME10', 'percentage', 10, 0,
              true, false, 'order', NOW(), NOW()
       WHERE NOT EXISTS (
         SELECT 1 FROM store_promotions
         WHERE tenant_id = $1 AND lower(code) = 'welcome10'
       )`,
      [tenantId]
    );

    await client.query(
      `INSERT INTO store_promotions (
         tenant_id, name, code, promotion_type, value, minimum_subtotal,
         is_active, is_automatic, applies_to, created_at, updated_at
       )
       SELECT $1, 'Event Day 50% Off', NULL, 'percentage', 50, 0,
              false, true, 'order', NOW(), NOW()
       WHERE NOT EXISTS (
         SELECT 1 FROM store_promotions
         WHERE tenant_id = $1 AND name = 'Event Day 50% Off'
       )`,
      [tenantId]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function normalizePromotionRow(row: any): StorePromotion {
  return {
    id: row.id,
    tenantId: row.tenantId || row.tenant_id,
    name: row.name,
    code: row.code || undefined,
    promotionType: row.promotionType || row.promotion_type,
    value: Number(row.value) || 0,
    minimumSubtotal: Number(row.minimumSubtotal ?? row.minimum_subtotal) || 0,
    startsAt: toIsoString(row.startsAt ?? row.starts_at),
    endsAt: toIsoString(row.endsAt ?? row.ends_at),
    isActive: Boolean(row.isActive ?? row.is_active),
    isAutomatic: Boolean(row.isAutomatic ?? row.is_automatic),
    appliesTo: 'order',
    maxRedemptions: row.maxRedemptions ?? row.max_redemptions ?? undefined,
    redemptionCount: Number(row.redemptionCount ?? row.redemption_count) || 0,
    createdBy: row.createdBy || row.created_by || undefined,
    createdAt: toIsoString(row.createdAt ?? row.created_at),
    updatedAt: toIsoString(row.updatedAt ?? row.updated_at),
  };
}

function activePromotionClause(prefix = ''): string {
  const p = prefix ? `${prefix}.` : '';
  return `
    ${p}is_active = true
    AND (${p}starts_at IS NULL OR ${p}starts_at <= NOW())
    AND (${p}ends_at IS NULL OR ${p}ends_at >= NOW())
    AND (${p}max_redemptions IS NULL OR ${p}redemption_count < ${p}max_redemptions)
  `;
}

function calculateOrderPromotionDiscount(promotion: StorePromotion, subtotal: number): number {
  if (subtotal < promotion.minimumSubtotal) return 0;
  if (promotion.promotionType === 'percentage') {
    return Math.min(subtotal, Math.round(subtotal * (Math.min(Math.max(promotion.value, 0), 100) / 100)));
  }
  if (promotion.promotionType === 'fixed') {
    return Math.min(subtotal, Math.max(0, promotion.value));
  }
  return 0;
}

function buildPromotionApplication(
  promotion: StorePromotion,
  discountCents: number
): StorePromotionApplication {
  return {
    id: promotion.id,
    name: promotion.name,
    code: promotion.code,
    promotionType: promotion.promotionType,
    discountCents,
    minimumSubtotal: promotion.minimumSubtotal,
    source: promotion.isAutomatic ? 'automatic' : 'code',
  };
}

export async function getStorePromotions(tenantId: string): Promise<StorePromotion[]> {
  await ensureStoreSchemaAndCatalog(tenantId);

  const result = await pool.query(
    `SELECT
       id, tenant_id as "tenantId", name, code, promotion_type as "promotionType",
       value, minimum_subtotal as "minimumSubtotal", starts_at as "startsAt",
       ends_at as "endsAt", is_active as "isActive", is_automatic as "isAutomatic",
       applies_to as "appliesTo", max_redemptions as "maxRedemptions",
       redemption_count as "redemptionCount", created_by as "createdBy",
       created_at as "createdAt", updated_at as "updatedAt"
     FROM store_promotions
     WHERE tenant_id = $1
     ORDER BY is_active DESC, is_automatic DESC, name ASC`,
    [tenantId]
  );

  return result.rows.map(normalizePromotionRow);
}

export async function getStorefrontPromotions(tenantId: string): Promise<StorePromotion[]> {
  await ensureStoreSchemaAndCatalog(tenantId);

  const result = await pool.query(
    `SELECT
       id, tenant_id as "tenantId", name, code, promotion_type as "promotionType",
       value, minimum_subtotal as "minimumSubtotal", starts_at as "startsAt",
       ends_at as "endsAt", is_active as "isActive", is_automatic as "isAutomatic",
       applies_to as "appliesTo", max_redemptions as "maxRedemptions",
       redemption_count as "redemptionCount", created_by as "createdBy",
       created_at as "createdAt", updated_at as "updatedAt"
     FROM store_promotions
     WHERE tenant_id = $1
       AND (${activePromotionClause('store_promotions')})
       AND (is_automatic = true OR code IS NOT NULL)
     ORDER BY is_automatic DESC, minimum_subtotal ASC, name ASC`,
    [tenantId]
  );

  return result.rows.map(normalizePromotionRow);
}

export async function createStorePromotion(
  tenantId: string,
  input: StorePromotionInput,
  createdBy?: string
): Promise<StorePromotion> {
  await ensureStoreSchemaAndCatalog(tenantId);

  const code = normalizePromotionCode(input.code);
  if (!input.name.trim()) {
    throw new Error('Promotion name is required');
  }
  if (!input.isAutomatic && !code) {
    throw new Error('Discount codes need a code or must be marked automatic');
  }
  if ((input.promotionType === 'percentage' || input.promotionType === 'fixed') && input.value <= 0) {
    throw new Error('Discount value must be greater than zero');
  }

  const result = await pool.query(
    `INSERT INTO store_promotions (
       tenant_id, name, code, promotion_type, value, minimum_subtotal,
       starts_at, ends_at, is_active, is_automatic, applies_to,
       max_redemptions, created_by, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9, $10, 'order',
       $11, $12, NOW(), NOW()
     )
     RETURNING
       id, tenant_id as "tenantId", name, code, promotion_type as "promotionType",
       value, minimum_subtotal as "minimumSubtotal", starts_at as "startsAt",
       ends_at as "endsAt", is_active as "isActive", is_automatic as "isAutomatic",
       applies_to as "appliesTo", max_redemptions as "maxRedemptions",
       redemption_count as "redemptionCount", created_by as "createdBy",
       created_at as "createdAt", updated_at as "updatedAt"`,
    [
      tenantId,
      input.name.trim(),
      code || null,
      input.promotionType,
      Math.max(0, Math.round(input.value)),
      Math.max(0, Math.round(input.minimumSubtotal || 0)),
      toNullableDate(input.startsAt),
      toNullableDate(input.endsAt),
      input.isActive ?? true,
      input.isAutomatic ?? false,
      input.maxRedemptions ?? null,
      createdBy || null,
    ]
  );

  return normalizePromotionRow(result.rows[0]);
}

export async function updateStorePromotion(
  tenantId: string,
  promotionId: string,
  input: Partial<StorePromotionInput>
): Promise<StorePromotion | null> {
  await ensureStoreSchemaAndCatalog(tenantId);

  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  const addUpdate = (column: string, value: unknown, cast = '') => {
    updates.push(`${column} = $${paramIndex}${cast}`);
    values.push(value);
    paramIndex++;
  };

  if (input.name !== undefined) {
    if (!input.name.trim()) throw new Error('Promotion name is required');
    addUpdate('name', input.name.trim());
  }
  if (input.code !== undefined) addUpdate('code', normalizePromotionCode(input.code) || null);
  if (input.promotionType !== undefined) addUpdate('promotion_type', input.promotionType);
  if (input.value !== undefined) addUpdate('value', Math.max(0, Math.round(input.value)));
  if (input.minimumSubtotal !== undefined) addUpdate('minimum_subtotal', Math.max(0, Math.round(input.minimumSubtotal || 0)));
  if (input.startsAt !== undefined) addUpdate('starts_at', toNullableDate(input.startsAt), '::timestamptz');
  if (input.endsAt !== undefined) addUpdate('ends_at', toNullableDate(input.endsAt), '::timestamptz');
  if (input.isActive !== undefined) addUpdate('is_active', input.isActive);
  if (input.isAutomatic !== undefined) addUpdate('is_automatic', input.isAutomatic);
  if (input.maxRedemptions !== undefined) addUpdate('max_redemptions', input.maxRedemptions ?? null);

  if (updates.length === 0) {
    const promotions = await getStorePromotions(tenantId);
    return promotions.find((promotion) => promotion.id === promotionId) || null;
  }

  updates.push('updated_at = NOW()');
  values.push(promotionId, tenantId);

  const result = await pool.query(
    `UPDATE store_promotions
     SET ${updates.join(', ')}
     WHERE id::text = $${paramIndex} AND tenant_id = $${paramIndex + 1}
     RETURNING
       id, tenant_id as "tenantId", name, code, promotion_type as "promotionType",
       value, minimum_subtotal as "minimumSubtotal", starts_at as "startsAt",
       ends_at as "endsAt", is_active as "isActive", is_automatic as "isAutomatic",
       applies_to as "appliesTo", max_redemptions as "maxRedemptions",
       redemption_count as "redemptionCount", created_by as "createdBy",
       created_at as "createdAt", updated_at as "updatedAt"`,
    values
  );

  return result.rows[0] ? normalizePromotionRow(result.rows[0]) : null;
}

export async function calculateStorePromotionQuote(
  tenantId: string,
  request: StorePromotionQuoteRequest
): Promise<StorePromotionQuote> {
  await ensureStoreSchemaAndCatalog(tenantId);

  const shippingMethod = request.shippingMethod || 'standard';
  const baseShippingFee = getStoreShippingFee(shippingMethod);
  const normalizedCode = normalizePromotionCode(request.promotionCode);
  const normalizedItems = (request.items || []).filter((item) => item.productId && item.quantity > 0);

  if (normalizedItems.length === 0) {
    throw new Error('At least one store item is required');
  }

  const quantityByProductId = new Map<string, number>();
  for (const item of normalizedItems) {
    quantityByProductId.set(item.productId, (quantityByProductId.get(item.productId) || 0) + item.quantity);
  }

  const productResult = await pool.query(
    `SELECT id, sku, name, price, inventory_count, is_active, category
     FROM products
     WHERE tenant_id = $1 AND id::text = ANY($2::text[])`,
    [tenantId, Array.from(quantityByProductId.keys())]
  );
  const productsById = new Map(productResult.rows.map((product) => [product.id, product]));

  let subtotal = 0;
  for (const item of normalizedItems) {
    const product = productsById.get(item.productId);
    if (!product) throw new Error('One or more products are no longer available');
    if (!product.is_active) throw new Error(`${product.name} is no longer active`);
    if (product.category === 'prescription') {
      throw new Error('Prescription products cannot be purchased through the store');
    }
    const requestedQuantity = quantityByProductId.get(item.productId) || item.quantity;
    if (Number(product.inventory_count) < requestedQuantity) {
      throw new Error(`Insufficient inventory for ${product.name}: only ${product.inventory_count} available`);
    }
    subtotal += ((item.unitPrice ?? Number(product.price)) || 0) * item.quantity - (item.discountAmount || 0);
  }
  subtotal = Math.max(0, subtotal);

  const automaticResult = await pool.query(
    `SELECT
       id, tenant_id as "tenantId", name, code, promotion_type as "promotionType",
       value, minimum_subtotal as "minimumSubtotal", starts_at as "startsAt",
       ends_at as "endsAt", is_active as "isActive", is_automatic as "isAutomatic",
       applies_to as "appliesTo", max_redemptions as "maxRedemptions",
       redemption_count as "redemptionCount", created_by as "createdBy",
       created_at as "createdAt", updated_at as "updatedAt"
     FROM store_promotions
     WHERE tenant_id = $1
       AND is_automatic = true
       AND (${activePromotionClause('store_promotions')})`,
    [tenantId]
  );

  const candidates = automaticResult.rows.map(normalizePromotionRow);
  let codePromotion: StorePromotion | null = null;
  if (normalizedCode) {
    const codeResult = await pool.query(
      `SELECT
         id, tenant_id as "tenantId", name, code, promotion_type as "promotionType",
         value, minimum_subtotal as "minimumSubtotal", starts_at as "startsAt",
         ends_at as "endsAt", is_active as "isActive", is_automatic as "isAutomatic",
         applies_to as "appliesTo", max_redemptions as "maxRedemptions",
         redemption_count as "redemptionCount", created_by as "createdBy",
         created_at as "createdAt", updated_at as "updatedAt"
       FROM store_promotions
       WHERE tenant_id = $1
         AND lower(code) = lower($2)
       LIMIT 1`,
      [tenantId, normalizedCode]
    );

    if (!codeResult.rowCount) {
      throw new Error('Discount code not found or inactive');
    }

    const possibleCodePromotion = normalizePromotionRow(codeResult.rows[0]);
    const now = Date.now();
    const startsAt = possibleCodePromotion.startsAt ? new Date(possibleCodePromotion.startsAt).getTime() : null;
    const endsAt = possibleCodePromotion.endsAt ? new Date(possibleCodePromotion.endsAt).getTime() : null;
    const isDateValid = (!startsAt || startsAt <= now) && (!endsAt || endsAt >= now);
    const hasRedemptions = possibleCodePromotion.maxRedemptions === undefined || possibleCodePromotion.redemptionCount < possibleCodePromotion.maxRedemptions;
    if (!possibleCodePromotion.isActive || !isDateValid || !hasRedemptions) {
      throw new Error('Discount code not found or inactive');
    }
    if (subtotal < possibleCodePromotion.minimumSubtotal) {
      throw new Error(`Discount code requires at least $${(possibleCodePromotion.minimumSubtotal / 100).toFixed(2)} in products`);
    }
    codePromotion = possibleCodePromotion;
    candidates.push(possibleCodePromotion);
  }

  const eligiblePromotions = candidates.filter((promotion) => subtotal >= promotion.minimumSubtotal);
  const orderDiscountCandidates = eligiblePromotions
    .filter((promotion) => promotion.promotionType !== 'free_shipping')
    .map((promotion) => ({
      promotion,
      discount: calculateOrderPromotionDiscount(promotion, subtotal),
    }))
    .filter((entry) => entry.discount > 0)
    .sort((a, b) => b.discount - a.discount);

  const bestOrderDiscount = orderDiscountCandidates[0] || null;
  const freeShippingPromotion = eligiblePromotions.find((promotion) => promotion.promotionType === 'free_shipping' && baseShippingFee > 0);

  const itemDiscount = bestOrderDiscount ? bestOrderDiscount.discount : 0;
  const shippingDiscount = freeShippingPromotion ? baseShippingFee : 0;
  const shippingFee = Math.max(0, baseShippingFee - shippingDiscount);
  const taxableAmount = Math.max(0, subtotal - itemDiscount);
  const tax = Math.round(taxableAmount * DEFAULT_TAX_RATE);
  const appliedPromotions = [
    ...(bestOrderDiscount ? [buildPromotionApplication(bestOrderDiscount.promotion, itemDiscount)] : []),
    ...(freeShippingPromotion ? [buildPromotionApplication(freeShippingPromotion, shippingDiscount)] : []),
  ];

  return {
    subtotal,
    itemDiscount,
    shippingDiscount,
    shippingFee,
    tax,
    total: taxableAmount + tax + shippingFee,
    promotionCode: codePromotion?.code,
    appliedPromotions,
  };
}

/**
 * Create a new product sale
 */
export async function createSale(
  tenantId: string,
  patientId: string,
  items: SaleItem[],
  paymentInfo: PaymentInfo,
  soldBy: string,
  encounterId?: string,
  discountAmount?: number,
  status: SaleStatus = 'completed',
  promotion?: SalePromotionContext
): Promise<Sale> {
  await ensureStoreSchemaAndCatalog(tenantId);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const saleId = crypto.randomUUID();
    let subtotal = 0;
    const saleItems: SaleItemDetail[] = [];

    // Validate and calculate items
    for (const item of items) {
      // Get product info
      const productResult = await client.query(
        `SELECT id, sku, name, price, inventory_count, is_active, image_url
         FROM products
         WHERE id = $1 AND tenant_id = $2`,
        [item.productId, tenantId]
      );

      if (productResult.rows.length === 0) {
        throw new Error(`Product not found: ${item.productId}`);
      }

      const product = productResult.rows[0];

      if (!product.is_active) {
        throw new Error(`Product is not active: ${product.name}`);
      }

      if (product.inventory_count < item.quantity) {
        throw new Error(`Insufficient inventory for ${product.name}: only ${product.inventory_count} available`);
      }

      const unitPrice = item.unitPrice ?? product.price;
      const itemDiscount = item.discountAmount ?? 0;
      const lineTotal = (unitPrice * item.quantity) - itemDiscount;

      subtotal += lineTotal;

      saleItems.push({
        id: crypto.randomUUID(),
        saleId,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice,
        discountAmount: itemDiscount,
        lineTotal,
        productName: product.name,
        productSku: product.sku,
        imageUrl: product.image_url || undefined,
      });
    }

    // Calculate totals
    const saleDiscount = Math.min(Math.max(0, discountAmount ?? 0), subtotal);
    const taxableAmount = Math.max(0, subtotal - saleDiscount);
    const tax = Math.round(taxableAmount * DEFAULT_TAX_RATE);
    const total = taxableAmount + tax;
    const promotionCode = normalizePromotionCode(promotion?.code) || normalizePromotionCode((promotion?.summary as StorePromotionQuote | undefined)?.promotionCode);
    const promotionSummary = promotion?.summary || {};

    // Create sale record
    await client.query(
      `INSERT INTO product_sales (
        id, tenant_id, patient_id, encounter_id, sold_by,
        sale_date, subtotal, tax, discount, total,
        payment_method, payment_reference, status, promotion_code, promotion_summary
      ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)`,
      [
        saleId,
        tenantId,
        patientId,
        encounterId || null,
        soldBy,
        subtotal,
        tax,
        saleDiscount,
        total,
        paymentInfo.method,
        paymentInfo.reference || null,
        status,
        promotionCode || null,
        JSON.stringify(promotionSummary),
      ]
    );

    // Create sale items (triggers will update inventory)
    for (const item of saleItems) {
      await client.query(
        `INSERT INTO product_sale_items (
          id, sale_id, product_id, quantity, unit_price,
          discount_amount, line_total, product_name, product_sku
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          item.id,
          saleId,
          item.productId,
          item.quantity,
          item.unitPrice,
          item.discountAmount,
          item.lineTotal,
          item.productName,
          item.productSku,
        ]
      );
    }

    const appliedPromotionIds = Array.from(new Set(
      ((promotion?.summary as StorePromotionQuote | undefined)?.appliedPromotions || [])
        .map((entry) => entry.id)
        .filter(Boolean)
    ));
    if (appliedPromotionIds.length > 0) {
      await client.query(
        `UPDATE store_promotions
         SET redemption_count = redemption_count + 1,
             updated_at = NOW()
         WHERE tenant_id = $1 AND id::text = ANY($2::text[])`,
        [tenantId, appliedPromotionIds]
      );
    }

    await client.query('COMMIT');

    return {
      id: saleId,
      tenantId,
      patientId,
      encounterId,
      soldBy,
      saleDate: new Date().toISOString(),
      subtotal,
      tax,
      discount: saleDiscount,
      total,
      paymentMethod: paymentInfo.method,
      paymentReference: paymentInfo.reference,
      status,
      promotionCode,
      promotionSummary,
      items: saleItems,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get product recommendations based on diagnosis codes
 */
export async function getProductRecommendations(
  tenantId: string,
  diagnosisCodes: string[]
): Promise<ProductRecommendation[]> {
  await ensureStoreSchemaAndCatalog(tenantId);

  if (!diagnosisCodes || diagnosisCodes.length === 0) {
    return [];
  }

  // Get recommendations for the given diagnosis codes
  const result = await pool.query(
    `SELECT
      pr.id,
      pr.tenant_id as "tenantId",
      pr.condition_code as "conditionCode",
      pr.condition_description as "conditionDescription",
      pr.product_ids as "productIds",
      pr.recommendation_text as "recommendationText",
      pr.priority,
      pr.is_active as "isActive"
    FROM product_recommendations pr
    WHERE pr.tenant_id = $1
      AND pr.condition_code = ANY($2)
      AND pr.is_active = true
    ORDER BY pr.priority ASC`,
    [tenantId, diagnosisCodes]
  );

  const recommendations = result.rows as ProductRecommendation[];

  // Fetch product details for each recommendation
  for (const rec of recommendations) {
    if (rec.productIds && rec.productIds.length > 0) {
      const productsResult = await pool.query(
        `SELECT
          id, tenant_id as "tenantId", sku, name, description,
          category, brand, price, cost, inventory_count as "inventoryCount",
          reorder_point as "reorderPoint", is_active as "isActive",
          image_url as "imageUrl", barcode
        FROM products
        WHERE id = ANY($1)
          AND tenant_id = $2
          AND is_active = true
        ORDER BY name`,
        [rec.productIds, tenantId]
      );
      rec.products = productsResult.rows;
    }
  }

  return recommendations;
}

/**
 * Adjust inventory for a product
 */
export async function adjustInventory(
  tenantId: string,
  productId: string,
  quantity: number,
  reason: TransactionType,
  notes?: string,
  userId?: string
): Promise<{ newCount: number }> {
  await ensureStoreSchemaAndCatalog(tenantId);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Update inventory count
    const updateResult = await client.query(
      `UPDATE products
       SET inventory_count = inventory_count + $1,
           updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3
       RETURNING inventory_count`,
      [quantity, productId, tenantId]
    );

    if (updateResult.rows.length === 0) {
      throw new Error('Product not found');
    }

    const newCount = updateResult.rows[0].inventory_count;

    if (newCount < 0) {
      throw new Error('Adjustment would result in negative inventory');
    }

    // Log the transaction
    await client.query(
      `INSERT INTO product_inventory_transactions (
        tenant_id, product_id, transaction_type, quantity, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, productId, reason, quantity, notes || null, userId || null]
    );

    await client.query('COMMIT');

    return { newCount };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get products with low stock
 */
export async function getLowStockProducts(tenantId: string): Promise<Product[]> {
  await ensureStoreSchemaAndCatalog(tenantId);

  const result = await pool.query(
    `SELECT
      id, tenant_id as "tenantId", sku, name, description,
      category, brand, price, cost, inventory_count as "inventoryCount",
      reorder_point as "reorderPoint", is_active as "isActive",
      image_url as "imageUrl", barcode,
      created_at as "createdAt", updated_at as "updatedAt"
    FROM products
    WHERE tenant_id = $1
      AND inventory_count <= reorder_point
      AND is_active = true
    ORDER BY inventory_count ASC`,
    [tenantId]
  );

  return result.rows;
}

/**
 * Get sales report with analytics
 */
export async function getSalesReport(
  tenantId: string,
  filters: SalesReportFilters
): Promise<SalesReport> {
  await ensureStoreSchemaAndCatalog(tenantId);

  const { startDate, endDate, category, soldBy } = filters;

  // Build date filter
  const dateConditions: string[] = [];
  const params: any[] = [tenantId];
  let paramIndex = 2;

  const dateRangeSql = buildProductSaleDateRangeSql("ps.sale_date", startDate, endDate, paramIndex);
  dateConditions.push(...dateRangeSql.conditions);
  params.push(...dateRangeSql.params);
  paramIndex = dateRangeSql.nextParamIndex;

  if (soldBy) {
    dateConditions.push(`ps.sold_by = $${paramIndex}`);
    params.push(soldBy);
    paramIndex++;
  }

  const dateFilter = dateConditions.length > 0
    ? `AND ${dateConditions.join(' AND ')}`
    : '';

  // Summary stats
  const summaryResult = await pool.query(
    `SELECT
      COUNT(DISTINCT ps.id) as total_sales,
      COALESCE(SUM(ps.total), 0) as total_revenue,
      COALESCE(SUM(ps.discount), 0) as total_discounts,
      COALESCE(SUM(ps.tax), 0) as total_tax,
      COUNT(DISTINCT ps.patient_id) as unique_customers
    FROM product_sales ps
    WHERE ps.tenant_id = $1
      AND ps.status = 'completed'
      ${dateFilter}`,
    params
  );

  const summary = summaryResult.rows[0];

  // Top products
  const topProductsResult = await pool.query(
    `SELECT
      psi.product_id as "productId",
      psi.product_name as "productName",
      SUM(psi.quantity) as "quantitySold",
      SUM(psi.line_total) as "revenue"
    FROM product_sale_items psi
    JOIN product_sales ps ON psi.sale_id::text = ps.id::text
    WHERE ps.tenant_id = $1
      AND ps.status = 'completed'
      ${dateFilter}
    GROUP BY psi.product_id, psi.product_name
    ORDER BY "quantitySold" DESC
    LIMIT 10`,
    params
  );

  // Sales by category
  let categoryParams = [...params];
  let categoryFilter = dateFilter;

  if (category) {
    categoryFilter += ` AND p.category = $${paramIndex}`;
    categoryParams.push(category);
  }

  const categoryResult = await pool.query(
    `SELECT
      p.category,
      COUNT(DISTINCT ps.id) as count,
      COALESCE(SUM(psi.line_total), 0) as revenue
    FROM product_sale_items psi
    JOIN product_sales ps ON psi.sale_id::text = ps.id::text
    JOIN products p ON psi.product_id::text = p.id::text
    WHERE ps.tenant_id = $1
      AND ps.status = 'completed'
      ${categoryFilter}
    GROUP BY p.category
    ORDER BY revenue DESC`,
    categoryParams
  );

  // Daily sales
  const dailyResult = await pool.query(
    `SELECT
      DATE(ps.sale_date) as date,
      COUNT(DISTINCT ps.id) as count,
      COALESCE(SUM(ps.total), 0) as revenue
    FROM product_sales ps
    WHERE ps.tenant_id = $1
      AND ps.status = 'completed'
      ${dateFilter}
    GROUP BY DATE(ps.sale_date)
    ORDER BY date DESC
    LIMIT 30`,
    params
  );

  return {
    totalSales: parseInt(summary.total_sales) || 0,
    totalRevenue: parseInt(summary.total_revenue) || 0,
    totalDiscounts: parseInt(summary.total_discounts) || 0,
    totalTax: parseInt(summary.total_tax) || 0,
    uniqueCustomers: parseInt(summary.unique_customers) || 0,
    topProducts: topProductsResult.rows.map(row => ({
      productId: row.productId,
      productName: row.productName,
      quantitySold: parseInt(row.quantitySold) || 0,
      revenue: parseInt(row.revenue) || 0,
    })),
    salesByCategory: categoryResult.rows.map(row => ({
      category: row.category as ProductCategory,
      count: parseInt(row.count) || 0,
      revenue: parseInt(row.revenue) || 0,
    })),
    dailySales: dailyResult.rows.map(row => ({
      date: row.date,
      count: parseInt(row.count) || 0,
      revenue: parseInt(row.revenue) || 0,
    })),
  };
}

/**
 * Apply discount to a pending sale
 */
export async function applyDiscount(
  tenantId: string,
  saleId: string,
  discountType: DiscountType,
  amount: number
): Promise<Sale> {
  await ensureStoreSchemaAndCatalog(tenantId);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get current sale
    const saleResult = await client.query(
      `SELECT * FROM product_sales
       WHERE id = $1 AND tenant_id = $2`,
      [saleId, tenantId]
    );

    if (saleResult.rows.length === 0) {
      throw new Error('Sale not found');
    }

    const sale = saleResult.rows[0];

    if (sale.status !== 'pending') {
      throw new Error('Can only apply discount to pending sales');
    }

    // Calculate new discount
    let newDiscount = 0;

    switch (discountType) {
      case 'percentage':
        newDiscount = Math.round(sale.subtotal * (amount / 100));
        break;
      case 'fixed':
        newDiscount = amount;
        break;
      case 'loyalty':
        // Loyalty discount: 10% for amount >= 100 points, 5% otherwise
        const loyaltyRate = amount >= 100 ? 0.10 : 0.05;
        newDiscount = Math.round(sale.subtotal * loyaltyRate);
        break;
    }

    // Ensure discount doesn't exceed subtotal
    newDiscount = Math.min(newDiscount, sale.subtotal);

    // Recalculate totals
    const taxableAmount = sale.subtotal - newDiscount;
    const newTax = Math.round(taxableAmount * DEFAULT_TAX_RATE);
    const newTotal = taxableAmount + newTax;

    // Update sale
    await client.query(
      `UPDATE product_sales
       SET discount = $1, tax = $2, total = $3, updated_at = NOW()
       WHERE id::text = $4`,
      [newDiscount, newTax, newTotal, saleId]
    );

    await client.query('COMMIT');

    // Get updated sale
    const updatedResult = await client.query(
      `SELECT
        ps.id, ps.tenant_id as "tenantId", ps.patient_id as "patientId",
        ps.encounter_id as "encounterId", ps.sold_by as "soldBy",
        ps.sale_date as "saleDate", ps.subtotal, ps.tax, ps.discount,
        ps.total, ps.payment_method as "paymentMethod",
        ps.payment_reference as "paymentReference", ps.status,
        p.first_name as "patientFirstName", p.last_name as "patientLastName"
      FROM product_sales ps
      LEFT JOIN patients p ON ps.patient_id = p.id
      WHERE ps.id::text = $1`,
      [saleId]
    );

    return updatedResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get all products
 */
export async function getProducts(
  tenantId: string,
  options?: {
    category?: ProductCategory;
    isActive?: boolean;
    search?: string;
    lowStockOnly?: boolean;
  }
): Promise<Product[]> {
  await ensureStoreSchemaAndCatalog(tenantId);

  const conditions: string[] = ['tenant_id = $1'];
  const params: any[] = [tenantId];
  let paramIndex = 2;

  if (options?.category) {
    conditions.push(`category = $${paramIndex}`);
    params.push(options.category);
    paramIndex++;
  }

  if (options?.isActive !== undefined) {
    conditions.push(`is_active = $${paramIndex}`);
    params.push(options.isActive);
    paramIndex++;
  }

  if (options?.search) {
    conditions.push(`(name ILIKE $${paramIndex} OR sku ILIKE $${paramIndex} OR brand ILIKE $${paramIndex})`);
    params.push(`%${options.search}%`);
    paramIndex++;
  }

  if (options?.lowStockOnly) {
    conditions.push('inventory_count <= reorder_point');
  }

  const result = await pool.query(
    `SELECT
      id, tenant_id as "tenantId", sku, name, description,
      category, brand, price, cost, inventory_count as "inventoryCount",
      reorder_point as "reorderPoint", is_active as "isActive",
      image_url as "imageUrl", barcode,
      created_at as "createdAt", updated_at as "updatedAt"
    FROM products
    WHERE ${conditions.join(' AND ')}
    ORDER BY name ASC`,
    params
  );

  return result.rows;
}

/**
 * Get a single product by ID
 */
export async function getProduct(
  tenantId: string,
  productId: string
): Promise<Product | null> {
  await ensureStoreSchemaAndCatalog(tenantId);

  const result = await pool.query(
    `SELECT
      id, tenant_id as "tenantId", sku, name, description,
      category, brand, price, cost, inventory_count as "inventoryCount",
      reorder_point as "reorderPoint", is_active as "isActive",
      image_url as "imageUrl", barcode,
      created_at as "createdAt", updated_at as "updatedAt"
    FROM products
    WHERE id = $1 AND tenant_id = $2`,
    [productId, tenantId]
  );

  return result.rows[0] || null;
}

/**
 * Create a new product
 */
export async function createProduct(
  tenantId: string,
  data: {
    sku: string;
    name: string;
    description?: string;
    category: ProductCategory;
    brand?: string;
    price: number;
    cost?: number;
    inventoryCount?: number;
    reorderPoint?: number;
    imageUrl?: string | null;
    barcode?: string;
  },
  createdBy?: string
): Promise<Product> {
  await ensureStoreSchemaAndCatalog(tenantId);

  const id = crypto.randomUUID();

  const result = await pool.query(
    `INSERT INTO products (
      id, tenant_id, sku, name, description, category, brand,
      price, cost, inventory_count, reorder_point, is_active,
      image_url, barcode, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, $12, $13, $14)
    RETURNING
      id, tenant_id as "tenantId", sku, name, description,
      category, brand, price, cost, inventory_count as "inventoryCount",
      reorder_point as "reorderPoint", is_active as "isActive",
      image_url as "imageUrl", barcode,
      created_at as "createdAt", updated_at as "updatedAt"`,
    [
      id,
      tenantId,
      data.sku,
      data.name,
      data.description || null,
      data.category,
      data.brand || null,
      data.price,
      data.cost || 0,
      data.inventoryCount || 0,
      data.reorderPoint || 10,
      data.imageUrl || null,
      data.barcode || null,
      createdBy || null,
    ]
  );

  return result.rows[0];
}

/**
 * Update a product
 */
export async function updateProduct(
  tenantId: string,
  productId: string,
  data: Partial<{
    sku: string;
    name: string;
    description: string;
    category: ProductCategory;
    brand: string;
    price: number;
    cost: number;
    reorderPoint: number;
    isActive: boolean;
    imageUrl: string | null;
    barcode: string;
  }>
): Promise<Product | null> {
  await ensureStoreSchemaAndCatalog(tenantId);

  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (data.sku !== undefined) {
    updates.push(`sku = $${paramCount++}`);
    values.push(data.sku);
  }
  if (data.name !== undefined) {
    updates.push(`name = $${paramCount++}`);
    values.push(data.name);
  }
  if (data.description !== undefined) {
    updates.push(`description = $${paramCount++}`);
    values.push(data.description);
  }
  if (data.category !== undefined) {
    updates.push(`category = $${paramCount++}`);
    values.push(data.category);
  }
  if (data.brand !== undefined) {
    updates.push(`brand = $${paramCount++}`);
    values.push(data.brand);
  }
  if (data.price !== undefined) {
    updates.push(`price = $${paramCount++}`);
    values.push(data.price);
  }
  if (data.cost !== undefined) {
    updates.push(`cost = $${paramCount++}`);
    values.push(data.cost);
  }
  if (data.reorderPoint !== undefined) {
    updates.push(`reorder_point = $${paramCount++}`);
    values.push(data.reorderPoint);
  }
  if (data.isActive !== undefined) {
    updates.push(`is_active = $${paramCount++}`);
    values.push(data.isActive);
  }
  if (data.imageUrl !== undefined) {
    updates.push(`image_url = $${paramCount++}`);
    values.push(data.imageUrl || null);
  }
  if (data.barcode !== undefined) {
    updates.push(`barcode = $${paramCount++}`);
    values.push(data.barcode);
  }

  if (updates.length === 0) {
    return getProduct(tenantId, productId);
  }

  updates.push('updated_at = NOW()');
  values.push(productId, tenantId);

  const result = await pool.query(
    `UPDATE products
     SET ${updates.join(', ')}
     WHERE id = $${paramCount++} AND tenant_id = $${paramCount}
     RETURNING
       id, tenant_id as "tenantId", sku, name, description,
       category, brand, price, cost, inventory_count as "inventoryCount",
       reorder_point as "reorderPoint", is_active as "isActive",
       image_url as "imageUrl", barcode,
       created_at as "createdAt", updated_at as "updatedAt"`,
    values
  );

  return result.rows[0] || null;
}

/**
 * Get sales for a patient
 */
export async function getPatientSales(
  tenantId: string,
  patientId: string
): Promise<Sale[]> {
  await ensureStoreSchemaAndCatalog(tenantId);

  const result = await pool.query(
    `SELECT
      ps.id, ps.tenant_id as "tenantId", ps.patient_id as "patientId",
      ps.encounter_id as "encounterId", ps.sold_by as "soldBy",
      ps.sale_date as "saleDate", ps.subtotal, ps.tax, ps.discount,
      ps.total, ps.payment_method as "paymentMethod",
      ps.payment_reference as "paymentReference", ps.status,
      ps.promotion_code as "promotionCode", ps.promotion_summary as "promotionSummary",
      p.first_name as "patientFirstName", p.last_name as "patientLastName"
    FROM product_sales ps
    LEFT JOIN patients p ON ps.patient_id = p.id
    WHERE ps.tenant_id = $1 AND ps.patient_id = $2
    ORDER BY ps.sale_date DESC`,
    [tenantId, patientId]
  );

  return result.rows;
}

/**
 * Get sale by ID with items
 */
export async function getSale(
  tenantId: string,
  saleId: string
): Promise<Sale | null> {
  await ensureStoreSchemaAndCatalog(tenantId);

  const saleResult = await pool.query(
    `SELECT
      ps.id, ps.tenant_id as "tenantId", ps.patient_id as "patientId",
      ps.encounter_id as "encounterId", ps.sold_by as "soldBy",
      ps.sale_date as "saleDate", ps.subtotal, ps.tax, ps.discount,
      ps.total, ps.payment_method as "paymentMethod",
      ps.payment_reference as "paymentReference", ps.status,
      ps.promotion_code as "promotionCode", ps.promotion_summary as "promotionSummary",
      p.first_name as "patientFirstName", p.last_name as "patientLastName"
    FROM product_sales ps
    LEFT JOIN patients p ON ps.patient_id = p.id
    WHERE ps.id::text = $1 AND ps.tenant_id = $2`,
    [saleId, tenantId]
  );

  if (saleResult.rows.length === 0) {
    return null;
  }

  const sale = saleResult.rows[0] as Sale;

  // Get sale items
  const itemsResult = await pool.query(
    `SELECT
      id, sale_id as "saleId", product_id as "productId",
      quantity, unit_price as "unitPrice", discount_amount as "discountAmount",
      line_total as "lineTotal", product_name as "productName",
      product_sku as "productSku"
    FROM product_sale_items
    WHERE sale_id::text = $1
    ORDER BY product_name`,
    [saleId]
  );

  sale.items = itemsResult.rows;

  return sale;
}

function isMissingStoreFulfillmentTable(error: any): boolean {
  return error?.code === "42P01";
}

function toIsoString(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function normalizeStoreOrderRow(row: any): StoreOrder {
  return {
    id: row.id,
    tenantId: row.tenantId,
    patientId: row.patientId,
    encounterId: row.encounterId || undefined,
    soldBy: row.soldBy,
    saleDate: toIsoString(row.saleDate) || new Date().toISOString(),
    subtotal: Number(row.subtotal) || 0,
    tax: Number(row.tax) || 0,
    discount: Number(row.discount) || 0,
    total: Number(row.total) || 0,
    paymentMethod: row.paymentMethod,
    paymentReference: row.paymentReference || undefined,
    status: row.status,
    promotionCode: row.promotionCode || undefined,
    promotionSummary: parseJsonObject(row.promotionSummary),
    patientFirstName: row.patientFirstName || undefined,
    patientLastName: row.patientLastName || undefined,
    channel: row.channel || 'staff',
    fulfillmentStatus: row.fulfillmentStatus || 'paid',
    shippingMethod: row.shippingMethod || 'standard',
    shippingFee: Number(row.shippingFee) || 0,
    shippingDiscount: Number(row.shippingDiscount) || 0,
    carrier: row.carrier || undefined,
    trackingNumber: row.trackingNumber || undefined,
    trackingUrl: row.trackingUrl || undefined,
    shippingAddress: row.shippingAddress || {},
    notificationEmail: row.notificationEmail || undefined,
    notificationStatus: row.notificationStatus || 'queued',
    lastNotificationAt: toIsoString(row.lastNotificationAt),
    stripeCheckoutSessionId: row.stripeCheckoutSessionId || undefined,
    stripePaymentIntentId: row.stripePaymentIntentId || undefined,
    stripePaymentStatus: row.stripePaymentStatus || 'paid',
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

async function attachSaleItems(orders: StoreOrder[]): Promise<StoreOrder[]> {
  if (orders.length === 0) return orders;

  const saleIds = orders.map((order) => order.id);
  const itemsResult = await pool.query(
    `SELECT
       psi.sale_id as "saleId", psi.id, psi.product_id as "productId",
       psi.quantity, psi.unit_price as "unitPrice", psi.discount_amount as "discountAmount",
       psi.line_total as "lineTotal", psi.product_name as "productName",
       psi.product_sku as "productSku",
       p.image_url as "imageUrl"
     FROM product_sale_items psi
     LEFT JOIN products p ON p.id::text = psi.product_id::text
     WHERE psi.sale_id::text = ANY($1::text[])
     ORDER BY psi.product_name`,
    [saleIds]
  );

  const bySale = new Map<string, SaleItemDetail[]>();
  for (const item of itemsResult.rows) {
    const saleId = item.saleId;
    const current = bySale.get(saleId) || [];
    current.push({
      id: item.id,
      saleId,
      productId: item.productId,
      quantity: Number(item.quantity) || 0,
      unitPrice: Number(item.unitPrice) || 0,
      discountAmount: Number(item.discountAmount) || 0,
      lineTotal: Number(item.lineTotal) || 0,
      productName: item.productName,
      productSku: item.productSku,
      imageUrl: item.imageUrl || undefined,
    });
    bySale.set(saleId, current);
  }

  return orders.map((order) => ({
    ...order,
    items: bySale.get(order.id) || [],
  }));
}

async function getStoreOrdersWithoutFulfillment(
  tenantId: string,
  filters: {
    startDate?: string;
    endDate?: string;
    saleId?: string;
    limit?: number;
  } = {}
): Promise<StoreOrder[]> {
  const conditions: string[] = ['ps.tenant_id = $1'];
  const params: any[] = [tenantId];
  let paramIndex = 2;

  if (filters.saleId) {
    conditions.push(`ps.id::text = $${paramIndex}`);
    params.push(filters.saleId);
    paramIndex++;
  }

  const dateRangeSql = buildProductSaleDateRangeSql(
    "ps.sale_date",
    filters.startDate,
    filters.endDate,
    paramIndex
  );
  conditions.push(...dateRangeSql.conditions);
  params.push(...dateRangeSql.params);
  paramIndex = dateRangeSql.nextParamIndex;

  const limit = Math.min(Math.max(filters.limit || 100, 1), 500);
  params.push(limit);

  const result = await pool.query(
    `SELECT
       ps.id, ps.tenant_id as "tenantId", ps.patient_id as "patientId",
       ps.encounter_id as "encounterId", ps.sold_by as "soldBy",
       ps.sale_date as "saleDate", ps.subtotal, ps.tax, ps.discount,
       ps.total, 0 as "shippingFee", ps.payment_method as "paymentMethod",
       0 as "shippingDiscount", ps.payment_reference as "paymentReference", ps.status,
       ps.promotion_code as "promotionCode", ps.promotion_summary as "promotionSummary",
       p.first_name as "patientFirstName", p.last_name as "patientLastName",
       'staff' as channel, 'paid' as "fulfillmentStatus",
       'standard' as "shippingMethod", NULL as carrier,
       NULL as "trackingNumber", NULL as "trackingUrl", '{}'::jsonb as "shippingAddress",
       p.email as "notificationEmail", 'queued' as "notificationStatus",
       NULL as "lastNotificationAt", NULL as "stripeCheckoutSessionId", ps.payment_reference as "stripePaymentIntentId",
       CASE WHEN ps.status = 'completed' THEN 'paid' ELSE ps.status END as "stripePaymentStatus",
       ps.created_at as "createdAt", ps.updated_at as "updatedAt"
     FROM product_sales ps
     LEFT JOIN patients p ON ps.patient_id = p.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY ps.sale_date DESC
     LIMIT $${paramIndex}`,
    params
  );

  return attachSaleItems(result.rows.map(normalizeStoreOrderRow));
}

export async function getStoreOrders(
  tenantId: string,
  filters: {
    startDate?: string;
    endDate?: string;
    fulfillmentStatus?: StoreFulfillmentStatus;
    search?: string;
    saleId?: string;
    limit?: number;
  } = {}
): Promise<StoreOrder[]> {
  await ensureStoreSchemaAndCatalog(tenantId);

  const conditions: string[] = ['ps.tenant_id = $1'];
  const params: any[] = [tenantId];
  let paramIndex = 2;

  if (filters.saleId) {
    conditions.push(`ps.id::text = $${paramIndex}`);
    params.push(filters.saleId);
    paramIndex++;
  }

  const dateRangeSql = buildProductSaleDateRangeSql(
    "ps.sale_date",
    filters.startDate,
    filters.endDate,
    paramIndex
  );
  conditions.push(...dateRangeSql.conditions);
  params.push(...dateRangeSql.params);
  paramIndex = dateRangeSql.nextParamIndex;

  if (filters.fulfillmentStatus) {
    conditions.push(`COALESCE(sof.fulfillment_status, 'paid') = $${paramIndex}`);
    params.push(filters.fulfillmentStatus);
    paramIndex++;
  }

  if (filters.search) {
    conditions.push(`(
      ps.id::text ILIKE $${paramIndex}
      OR ps.payment_reference ILIKE $${paramIndex}
      OR sof.tracking_number ILIKE $${paramIndex}
      OR p.first_name ILIKE $${paramIndex}
      OR p.last_name ILIKE $${paramIndex}
      OR CONCAT_WS(' ', p.first_name, p.last_name) ILIKE $${paramIndex}
    )`);
    params.push(`%${filters.search}%`);
    paramIndex++;
  }

  const limit = Math.min(Math.max(filters.limit || 100, 1), 500);
  params.push(limit);

  try {
    const result = await pool.query(
      `SELECT
         ps.id, ps.tenant_id as "tenantId", ps.patient_id as "patientId",
         ps.encounter_id as "encounterId", ps.sold_by as "soldBy",
         ps.sale_date as "saleDate", ps.subtotal, ps.tax, ps.discount,
         (ps.total + COALESCE(sof.shipping_fee, 0)) as total,
         COALESCE(sof.shipping_fee, 0) as "shippingFee",
         COALESCE(sof.shipping_discount, 0) as "shippingDiscount",
         ps.payment_method as "paymentMethod",
         ps.payment_reference as "paymentReference", ps.status,
         ps.promotion_code as "promotionCode", ps.promotion_summary as "promotionSummary",
         p.first_name as "patientFirstName", p.last_name as "patientLastName",
         COALESCE(sof.channel, 'staff') as channel,
         COALESCE(sof.fulfillment_status, 'paid') as "fulfillmentStatus",
         COALESCE(sof.shipping_method, 'standard') as "shippingMethod",
         sof.carrier, sof.tracking_number as "trackingNumber",
         sof.tracking_url as "trackingUrl",
         COALESCE(sof.shipping_address, '{}'::jsonb) as "shippingAddress",
         COALESCE(sof.notification_email, p.email) as "notificationEmail",
         COALESCE(sof.notification_status, 'queued') as "notificationStatus",
         sof.last_notification_at as "lastNotificationAt",
         sof.stripe_checkout_session_id as "stripeCheckoutSessionId",
         COALESCE(sof.stripe_payment_intent_id, ps.payment_reference) as "stripePaymentIntentId",
         COALESCE(sof.stripe_payment_status, CASE WHEN ps.status = 'completed' THEN 'paid' ELSE ps.status END) as "stripePaymentStatus",
         COALESCE(sof.created_at, ps.created_at) as "createdAt",
         COALESCE(sof.updated_at, ps.updated_at) as "updatedAt"
       FROM product_sales ps
       LEFT JOIN patients p ON ps.patient_id = p.id
       LEFT JOIN store_order_fulfillments sof ON sof.sale_id::text = ps.id::text
       WHERE ${conditions.join(' AND ')}
       ORDER BY ps.sale_date DESC
       LIMIT $${paramIndex}`,
      params
    );

    return attachSaleItems(result.rows.map(normalizeStoreOrderRow));
  } catch (error: any) {
    if (isMissingStoreFulfillmentTable(error)) {
      return getStoreOrdersWithoutFulfillment(tenantId, filters);
    }
    throw error;
  }
}

export async function createStoreFulfillment(
  tenantId: string,
  saleId: string,
  patientId: string,
  data: StoreFulfillmentInput
): Promise<void> {
  await ensureStoreSchemaAndCatalog(tenantId);

  try {
    await pool.query(
      `INSERT INTO store_order_fulfillments (
       id, tenant_id, sale_id, patient_id, channel, fulfillment_status,
         shipping_method, shipping_fee, shipping_discount, carrier, tracking_number, tracking_url,
         shipping_address, notification_email, notification_status, last_notification_at,
         stripe_checkout_session_id, stripe_payment_intent_id, stripe_payment_status
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14,
         $15, CASE WHEN $15 IN ('sent', 'failed') THEN NOW() ELSE NULL END,
         $16, $17, $18
       )
       ON CONFLICT (sale_id) DO UPDATE SET
         channel = EXCLUDED.channel,
         fulfillment_status = EXCLUDED.fulfillment_status,
         shipping_method = EXCLUDED.shipping_method,
         shipping_fee = EXCLUDED.shipping_fee,
         shipping_discount = EXCLUDED.shipping_discount,
         carrier = EXCLUDED.carrier,
         tracking_number = EXCLUDED.tracking_number,
         tracking_url = EXCLUDED.tracking_url,
         shipping_address = EXCLUDED.shipping_address,
         notification_email = EXCLUDED.notification_email,
         notification_status = EXCLUDED.notification_status,
         last_notification_at = CASE
           WHEN EXCLUDED.notification_status IN ('sent', 'failed') THEN NOW()
           ELSE store_order_fulfillments.last_notification_at
         END,
         stripe_checkout_session_id = EXCLUDED.stripe_checkout_session_id,
         stripe_payment_intent_id = EXCLUDED.stripe_payment_intent_id,
         stripe_payment_status = EXCLUDED.stripe_payment_status,
         updated_at = NOW()`,
      [
        crypto.randomUUID(),
        tenantId,
        saleId,
        patientId,
        data.channel || 'patient_portal',
        data.fulfillmentStatus || 'paid',
        data.shippingMethod || 'standard',
        Math.max(0, data.shippingFee || 0),
        Math.max(0, data.shippingDiscount || 0),
        data.carrier || null,
        data.trackingNumber || null,
        data.trackingUrl || null,
        JSON.stringify(data.shippingAddress || {}),
        data.notificationEmail || null,
        data.notificationStatus || 'queued',
        data.stripeCheckoutSessionId || null,
        data.stripePaymentIntentId || null,
        data.stripePaymentStatus || 'paid',
      ]
    );
  } catch (error: any) {
    if (isMissingStoreFulfillmentTable(error)) return;
    throw error;
  }
}

export async function updateStoreFulfillment(
  tenantId: string,
  saleId: string,
  data: StoreFulfillmentInput
): Promise<StoreOrder | null> {
  await ensureStoreSchemaAndCatalog(tenantId);

  try {
    await pool.query(
      `INSERT INTO store_order_fulfillments (id, tenant_id, sale_id, patient_id)
       SELECT $1, $2, ps.id, ps.patient_id
       FROM product_sales ps
       WHERE ps.id::text = $3 AND ps.tenant_id = $2
       ON CONFLICT (sale_id) DO NOTHING`,
      [crypto.randomUUID(), tenantId, saleId]
    );

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const addUpdate = (column: string, value: unknown, cast = '') => {
      updates.push(`${column} = $${paramIndex}${cast}`);
      values.push(value);
      paramIndex++;
    };

    if (data.fulfillmentStatus !== undefined) addUpdate('fulfillment_status', data.fulfillmentStatus);
    if (data.shippingMethod !== undefined) addUpdate('shipping_method', data.shippingMethod);
    if (data.shippingFee !== undefined) addUpdate('shipping_fee', Math.max(0, data.shippingFee));
    if (data.shippingDiscount !== undefined) addUpdate('shipping_discount', Math.max(0, data.shippingDiscount));
    if (data.carrier !== undefined) addUpdate('carrier', data.carrier);
    if (data.trackingNumber !== undefined) addUpdate('tracking_number', data.trackingNumber);
    if (data.trackingUrl !== undefined) addUpdate('tracking_url', data.trackingUrl);
    if (data.shippingAddress !== undefined) addUpdate('shipping_address', JSON.stringify(data.shippingAddress), '::jsonb');
    if (data.notificationEmail !== undefined) addUpdate('notification_email', data.notificationEmail);
    if (data.notificationStatus !== undefined) {
      addUpdate('notification_status', data.notificationStatus);
      if (['sent', 'failed'].includes(data.notificationStatus)) {
        updates.push('last_notification_at = NOW()');
      }
    }
    if (data.stripeCheckoutSessionId !== undefined) addUpdate('stripe_checkout_session_id', data.stripeCheckoutSessionId);
    if (data.stripePaymentIntentId !== undefined) addUpdate('stripe_payment_intent_id', data.stripePaymentIntentId);
    if (data.stripePaymentStatus !== undefined) addUpdate('stripe_payment_status', data.stripePaymentStatus);

    if (updates.length > 0) {
      updates.push('updated_at = NOW()');
      values.push(saleId, tenantId);

      await pool.query(
        `UPDATE store_order_fulfillments
         SET ${updates.join(', ')}
         WHERE sale_id::text = $${paramIndex} AND tenant_id = $${paramIndex + 1}`,
        values
      );
    }

    const [order] = await getStoreOrders(tenantId, { saleId, limit: 1 });
    return order || null;
  } catch (error: any) {
    if (isMissingStoreFulfillmentTable(error)) {
      const [order] = await getStoreOrdersWithoutFulfillment(tenantId, { saleId, limit: 1 });
      return order || null;
    }
    throw error;
  }
}

export async function markStoreOrderPaid(
  tenantId: string,
  saleId: string,
  data: {
    stripeCheckoutSessionId?: string | null;
    stripePaymentIntentId?: string | null;
    stripePaymentStatus?: string;
    paymentReference?: string | null;
  } = {}
): Promise<StoreOrder | null> {
  await ensureStoreSchemaAndCatalog(tenantId);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const saleResult = await client.query(
      `UPDATE product_sales
       SET status = 'completed',
           payment_reference = COALESCE($3, payment_reference),
           updated_at = NOW()
       WHERE id::text = $1 AND tenant_id = $2
       RETURNING id, patient_id`,
      [saleId, tenantId, data.paymentReference || data.stripeCheckoutSessionId || data.stripePaymentIntentId || null]
    );

    if (!saleResult.rowCount) {
      await client.query('ROLLBACK');
      return null;
    }

    const patientId = saleResult.rows[0].patient_id;
    await client.query(
      `INSERT INTO store_order_fulfillments (
         id, tenant_id, sale_id, patient_id, channel, fulfillment_status,
         stripe_checkout_session_id, stripe_payment_intent_id, stripe_payment_status,
         notification_status, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, 'patient_portal', 'paid', $5, $6, $7, 'queued', NOW(), NOW())
       ON CONFLICT (sale_id) DO UPDATE SET
         fulfillment_status = CASE
           WHEN store_order_fulfillments.fulfillment_status = 'awaiting_payment' THEN 'paid'
           ELSE store_order_fulfillments.fulfillment_status
         END,
         stripe_checkout_session_id = COALESCE(EXCLUDED.stripe_checkout_session_id, store_order_fulfillments.stripe_checkout_session_id),
         stripe_payment_intent_id = COALESCE(EXCLUDED.stripe_payment_intent_id, store_order_fulfillments.stripe_payment_intent_id),
         stripe_payment_status = EXCLUDED.stripe_payment_status,
         updated_at = NOW()`,
      [
        crypto.randomUUID(),
        tenantId,
        saleId,
        patientId,
        data.stripeCheckoutSessionId || null,
        data.stripePaymentIntentId || null,
        data.stripePaymentStatus || 'paid',
      ]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const [order] = await getStoreOrders(tenantId, { saleId, limit: 1 });
  return order || null;
}

/**
 * Get inventory status summary
 */
export async function getInventoryStatus(tenantId: string): Promise<{
  totalProducts: number;
  totalValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  byCategory: Array<{
    category: ProductCategory;
    count: number;
    value: number;
  }>;
}> {
  await ensureStoreSchemaAndCatalog(tenantId);

  const summaryResult = await pool.query(
    `SELECT
      COUNT(*) as total_products,
      COALESCE(SUM(inventory_count * cost), 0) as total_value,
      COUNT(*) FILTER (WHERE inventory_count <= reorder_point AND inventory_count > 0) as low_stock_count,
      COUNT(*) FILTER (WHERE inventory_count = 0) as out_of_stock_count
    FROM products
    WHERE tenant_id = $1 AND is_active = true`,
    [tenantId]
  );

  const categoryResult = await pool.query(
    `SELECT
      category,
      COUNT(*) as count,
      COALESCE(SUM(inventory_count * cost), 0) as value
    FROM products
    WHERE tenant_id = $1 AND is_active = true
    GROUP BY category
    ORDER BY category`,
    [tenantId]
  );

  const summary = summaryResult.rows[0];

  return {
    totalProducts: parseInt(summary.total_products) || 0,
    totalValue: parseInt(summary.total_value) || 0,
    lowStockCount: parseInt(summary.low_stock_count) || 0,
    outOfStockCount: parseInt(summary.out_of_stock_count) || 0,
    byCategory: categoryResult.rows.map(row => ({
      category: row.category as ProductCategory,
      count: parseInt(row.count) || 0,
      value: parseInt(row.value) || 0,
    })),
  };
}
