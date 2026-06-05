import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  Boxes,
  CalendarDays,
  ChevronDown,
  CreditCard,
  DollarSign,
  ExternalLink,
  Percent,
  Loader2,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  Send,
  Ticket,
  Truck,
  Upload,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Skeleton } from '../components/ui';
import {
  adjustProductInventory,
  createProduct,
  createStorePromotion,
  fetchInventoryStatus,
  fetchLowStockProducts,
  fetchProductSales,
  fetchProducts,
  fetchSalesReport,
  fetchStorePromotions,
  updateProduct,
  updateStorePromotion,
  updateStoreOrderFulfillment,
} from '../api';
import { getProductImageUrl } from '../utils/productImages';
import type {
  InventoryStatus,
  Product,
  ProductCategory,
  SalesReport,
  StoreFulfillmentStatus,
  StoreNotificationStatus,
  StoreOrder,
  StorePromotion,
  StorePromotionData,
  StorePromotionType,
  StoreShippingMethod,
} from '../types';

type StoreTab = 'orders' | 'products' | 'deals' | 'shipping' | 'payments' | 'notifications';
type StoreOrderRange = 'today' | 'week' | 'month' | 'all';

interface StoreOrderRangeOption {
  value: StoreOrderRange;
  label: string;
  metricLabel: string;
}

interface StoreOrderRangeBounds {
  startDate?: string;
  endDate?: string;
  label: string;
  metricLabel: string;
}

interface StaleProductAlert {
  product: Product;
  daysSinceSale: number;
  lastSoldAt?: string;
  severity: 'warning' | 'critical';
  trailingTwelveMonthUnits: number;
  trailingTwelveMonthRevenue: number;
}

interface ProductForm {
  sku: string;
  name: string;
  brand: string;
  description: string;
  category: ProductCategory;
  price: string;
  cost: string;
  inventoryCount: string;
  reorderPoint: string;
  imageUrl: string;
}

interface PromotionForm {
  name: string;
  code: string;
  promotionType: StorePromotionType;
  value: string;
  minimumSubtotal: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  isAutomatic: boolean;
  maxRedemptions: string;
}

interface OrderDraft {
  fulfillmentStatus: StoreFulfillmentStatus;
  shippingMethod: StoreShippingMethod;
  carrier: string;
  trackingNumber: string;
  trackingUrl: string;
  notificationEmail: string;
  notificationStatus: StoreNotificationStatus;
  stripePaymentStatus: string;
}

interface ProductDraft {
  price: string;
  cost: string;
  reorderPoint: string;
  isActive: boolean;
  imageUrl: string;
}

const EMPTY_PRODUCT_FORM: ProductForm = {
  sku: '',
  name: '',
  brand: '',
  description: '',
  category: 'skincare',
  price: '',
  cost: '',
  inventoryCount: '0',
  reorderPoint: '5',
  imageUrl: '',
};

const EMPTY_PROMOTION_FORM: PromotionForm = {
  name: '',
  code: '',
  promotionType: 'percentage',
  value: '10',
  minimumSubtotal: '0',
  startsAt: '',
  endsAt: '',
  isActive: true,
  isAutomatic: false,
  maxRedemptions: '',
};

const CATEGORY_OPTIONS: Array<{ value: ProductCategory | 'all'; label: string }> = [
  { value: 'all', label: 'All products' },
  { value: 'skincare', label: 'Skincare' },
  { value: 'sunscreen', label: 'Sunscreen' },
  { value: 'cosmetic', label: 'Cosmetic' },
  { value: 'post_procedure', label: 'Post-procedure' },
  { value: 'prescription', label: 'Prescription' },
];

const ORDER_RANGE_OPTIONS: StoreOrderRangeOption[] = [
  { value: 'today', label: 'Today', metricLabel: 'Today' },
  { value: 'week', label: 'This Week', metricLabel: 'Week' },
  { value: 'month', label: 'This Month', metricLabel: 'Month' },
  { value: 'all', label: 'All Time', metricLabel: 'All-Time' },
];
const TWELVE_MONTH_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;

const FULFILLMENT_LABELS: Record<StoreFulfillmentStatus, string> = {
  awaiting_payment: 'Awaiting Payment',
  paid: 'Paid',
  packing: 'Packing',
  label_created: 'Label Created',
  shipped: 'Shipped',
  delivered: 'Delivered',
  exception: 'Exception',
  cancelled: 'Cancelled',
};

function normalizeTab(value: string | null): StoreTab {
  if (value === 'products' || value === 'deals' || value === 'shipping' || value === 'payments' || value === 'notifications') {
    return value;
  }
  return 'orders';
}

function normalizeOrderRange(value: string | null): StoreOrderRange {
  if (value === 'week' || value === 'month' || value === 'all') {
    return value;
  }
  return 'today';
}

const NOTIFICATION_LABELS: Record<StoreNotificationStatus, string> = {
  queued: 'Queued',
  sent: 'Sent',
  failed: 'Failed',
  muted: 'Muted',
};

function centsToDollars(cents: number): string {
  return (Number(cents || 0) / 100).toFixed(2);
}

function dollarsToCents(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0;
}

function promotionFormToPayload(form: PromotionForm): StorePromotionData {
  return {
    name: form.name.trim(),
    code: form.isAutomatic ? null : form.code.trim().toUpperCase() || null,
    promotionType: form.promotionType,
    value: form.promotionType === 'free_shipping'
      ? 0
      : form.promotionType === 'fixed'
        ? dollarsToCents(form.value)
        : (Number.parseInt(form.value, 10) || 0),
    minimumSubtotal: dollarsToCents(form.minimumSubtotal),
    startsAt: form.startsAt || null,
    endsAt: form.endsAt || null,
    isActive: form.isActive,
    isAutomatic: form.isAutomatic,
    maxRedemptions: form.maxRedemptions ? Math.max(1, Number.parseInt(form.maxRedemptions, 10) || 1) : null,
  };
}

function dateTimeInputValue(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function endOfTodayInputValue(): string {
  const end = new Date();
  end.setHours(23, 59, 0, 0);
  return dateTimeInputValue(end.toISOString());
}

function formatPromotionValue(promotion: Pick<StorePromotion, 'promotionType' | 'value'>): string {
  if (promotion.promotionType === 'free_shipping') return 'Free shipping';
  if (promotion.promotionType === 'percentage') return `${promotion.value}% off`;
  return `${formatCurrency(promotion.value)} off`;
}

function formatPromotionWindow(promotion: StorePromotion): string {
  if (!promotion.startsAt && !promotion.endsAt) return 'Always available';
  if (promotion.startsAt && promotion.endsAt) return `${formatDate(promotion.startsAt)} - ${formatDate(promotion.endsAt)}`;
  if (promotion.startsAt) return `Starts ${formatDate(promotion.startsAt)}`;
  return `Ends ${formatDate(promotion.endsAt)}`;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format((Number(cents) || 0) / 100);
}

function formatDate(value?: string): string {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDateOnly(value?: string): string {
  if (!value) return 'All recorded sale dates';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'All recorded sale dates';
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function toLocalDateTimeInput(date: Date, endOfDay = false): string {
  const pad = (value: number, length = 2) => String(value).padStart(length, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  if (endOfDay) {
    return `${year}-${month}-${day}T23:59:59.999`;
  }
  return `${year}-${month}-${day}T00:00:00.000`;
}

function startOfLocalWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = start.getDay();
  const offset = day === 0 ? 6 : day - 1;
  start.setDate(start.getDate() - offset);
  return start;
}

function getOrderRangeBounds(range: StoreOrderRange, now = new Date()): StoreOrderRangeBounds {
  const option = ORDER_RANGE_OPTIONS.find((entry) => entry.value === range) || ORDER_RANGE_OPTIONS[0];
  if (range === 'all') {
    return { label: option.label, metricLabel: option.metricLabel };
  }

  let start: Date;
  let end: Date;
  if (range === 'week') {
    start = startOfLocalWeek(now);
    end = new Date(start);
    end.setDate(start.getDate() + 6);
  } else if (range === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    end = new Date(start);
  }

  return {
    startDate: toLocalDateTimeInput(start),
    endDate: toLocalDateTimeInput(end, true),
    label: option.label,
    metricLabel: option.metricLabel,
  };
}

function orderRangeSummary(bounds: StoreOrderRangeBounds): string {
  if (!bounds.startDate || !bounds.endDate) {
    return 'All recorded sale dates';
  }
  return `${formatDateOnly(bounds.startDate)} - ${formatDateOnly(bounds.endDate)}`;
}

function daysSince(value?: string, now = Date.now()): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((now - timestamp) / (24 * 60 * 60 * 1000)));
}

function saleItemRevenue(item: NonNullable<StoreOrder['items']>[number]): number {
  const explicitTotal = Number(item.lineTotal);
  if (Number.isFinite(explicitTotal)) return explicitTotal;
  const unitPrice = Number(item.unitPrice) || 0;
  const discountAmount = Number(item.discountAmount) || 0;
  return Math.max(0, unitPrice * item.quantity - discountAmount);
}

function patientName(order: StoreOrder): string {
  return [order.patientFirstName, order.patientLastName].filter(Boolean).join(' ') || 'Portal patient';
}

function buildOrderDraft(order: StoreOrder): OrderDraft {
  return {
    fulfillmentStatus: order.fulfillmentStatus || 'paid',
    shippingMethod: order.shippingMethod || 'standard',
    carrier: order.carrier || '',
    trackingNumber: order.trackingNumber || '',
    trackingUrl: order.trackingUrl || '',
    notificationEmail: order.notificationEmail || '',
    notificationStatus: order.notificationStatus || 'queued',
    stripePaymentStatus: order.stripePaymentStatus || 'paid',
  };
}

function buildProductDraft(product: Product): ProductDraft {
  return {
    price: centsToDollars(product.price),
    cost: centsToDollars(product.cost),
    reorderPoint: String(product.reorderPoint),
    isActive: product.isActive,
    imageUrl: product.imageUrl || '',
  };
}

function readImageFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    return Promise.reject(new Error('Choose an image file'));
  }
  if (file.size > 5 * 1024 * 1024) {
    return Promise.reject(new Error('Product images must be 5 MB or smaller'));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

function normalizeTrackingUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function ProductThumb({ product, compact = false }: { product: Pick<Product, 'name' | 'brand' | 'category' | 'sku' | 'imageUrl'>; compact?: boolean }) {
  return (
    <div className={compact ? 'store-ops-product-thumb compact' : 'store-ops-product-thumb'}>
      <img src={getProductImageUrl(product)} alt="" />
    </div>
  );
}

export function StoreOperationsPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<StoreTab>(() => normalizeTab(searchParams.get('tab')));
  const [orderRange, setOrderRange] = useState<StoreOrderRange>(() => normalizeOrderRange(searchParams.get('range')));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [orderHistory, setOrderHistory] = useState<StoreOrder[]>([]);
  const [promotions, setPromotions] = useState<StorePromotion[]>([]);
  const [inventoryStatus, setInventoryStatus] = useState<InventoryStatus | null>(null);
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
  const [salesReport, setSalesReport] = useState<SalesReport | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ProductCategory | 'all'>('all');
  const [productForm, setProductForm] = useState<ProductForm>(EMPTY_PRODUCT_FORM);
  const [promotionForm, setPromotionForm] = useState<PromotionForm>(EMPTY_PROMOTION_FORM);
  const [orderDrafts, setOrderDrafts] = useState<Record<string, OrderDraft>>({});
  const [productDrafts, setProductDrafts] = useState<Record<string, ProductDraft>>({});
  const [adjustProductId, setAdjustProductId] = useState('');
  const [adjustQuantity, setAdjustQuantity] = useState('0');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [showStaleDetails, setShowStaleDetails] = useState(false);

  const loadStore = useCallback(async () => {
    if (!session) {
      setProducts([]);
      setOrders([]);
      setOrderHistory([]);
      setPromotions([]);
      setLoading(false);
      return;
    }

    const rangeBounds = getOrderRangeBounds(orderRange);
    const orderFilters = {
      limit: 250,
      ...(rangeBounds.startDate ? { startDate: rangeBounds.startDate } : {}),
      ...(rangeBounds.endDate ? { endDate: rangeBounds.endDate } : {}),
    };
    const reportFilters = {
      ...(rangeBounds.startDate ? { startDate: rangeBounds.startDate } : {}),
      ...(rangeBounds.endDate ? { endDate: rangeBounds.endDate } : {}),
    };

    try {
      setLoading(true);
      const [productRes, orderRes, orderHistoryRes, inventoryRes, lowStockRes, reportRes, promotionRes] = await Promise.all([
        fetchProducts(session.tenantId, session.accessToken),
        fetchProductSales(session.tenantId, session.accessToken, orderFilters),
        fetchProductSales(session.tenantId, session.accessToken, { limit: 1000 }),
        fetchInventoryStatus(session.tenantId, session.accessToken),
        fetchLowStockProducts(session.tenantId, session.accessToken),
        fetchSalesReport(session.tenantId, session.accessToken, reportFilters),
        fetchStorePromotions(session.tenantId, session.accessToken),
      ]);

      const scopedOrders = orderRes.orders || [];
      const historyOrders = orderHistoryRes.orders || scopedOrders;
      const draftOrders = [...scopedOrders, ...historyOrders];

      setProducts(productRes.products || []);
      setOrders(scopedOrders);
      setOrderHistory(historyOrders);
      setPromotions(promotionRes.promotions || []);
      setInventoryStatus(inventoryRes.status || null);
      setLowStockProducts(lowStockRes.products || []);
      setSalesReport(reportRes.report || null);
      setProductDrafts(
        Object.fromEntries((productRes.products || []).map((product) => [product.id, buildProductDraft(product)]))
      );
      setOrderDrafts(
        Object.fromEntries(draftOrders.map((order) => [order.id, buildOrderDraft(order)]))
      );
    } catch (error) {
      console.error('Failed to load store operations:', error);
      showError('Failed to load store operations');
    } finally {
      setLoading(false);
    }
  }, [orderRange, session, showError]);

  useEffect(() => {
    loadStore();
  }, [loadStore]);

  useEffect(() => {
    setActiveTab(normalizeTab(searchParams.get('tab')));
    setOrderRange(normalizeOrderRange(searchParams.get('range')));
  }, [searchParams]);

  const selectTab = (tab: StoreTab) => {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    if (tab === 'orders') {
      next.delete('tab');
    } else {
      next.set('tab', tab);
    }
    setSearchParams(next, { replace: true });
  };

  const selectOrderRange = (range: StoreOrderRange) => {
    setOrderRange(range);
    const next = new URLSearchParams(searchParams);
    if (range === 'today') {
      next.delete('range');
    } else {
      next.set('range', range);
    }
    setSearchParams(next, { replace: true });
  };

  const filteredProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory = categoryFilter === 'all' || product.category === categoryFilter;
      const matchesSearch = !q || [product.name, product.sku, product.brand, product.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
      return matchesCategory && matchesSearch;
    });
  }, [categoryFilter, products, searchTerm]);

  const filteredOrders = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((order) => [
      order.id,
      patientName(order),
      order.paymentReference,
      order.trackingNumber,
      order.trackingUrl,
      order.fulfillmentStatus,
      ...(order.items || []).map((item) => item.productName),
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(q)));
  }, [orders, searchTerm]);

  const orderRangeBounds = useMemo(() => getOrderRangeBounds(orderRange), [orderRange]);
  const ordersToShip = useMemo(
    () => orderHistory.filter((order) => !['shipped', 'delivered', 'cancelled'].includes(order.fulfillmentStatus)),
    [orderHistory]
  );

  const orderRevenue = useMemo(() => orders.reduce((sum, order) => sum + order.total, 0), [orders]);
  const capturedPayments = useMemo(
    () => orders.filter((order) => order.stripePaymentStatus === 'paid').reduce((sum, order) => sum + order.total, 0),
    [orders]
  );
  const queuedNotifications = useMemo(
    () => orderHistory.filter((order) => order.notificationStatus === 'queued').length,
    [orderHistory]
  );
  const activeDealCount = useMemo(
    () => promotions.filter((promotion) => promotion.isActive).length,
    [promotions]
  );
  const discountGiven = useMemo(
    () => orders.reduce((sum, order) => sum + (order.discount || 0) + (order.shippingDiscount || 0), 0),
    [orders]
  );
  const inventoryValue = inventoryStatus?.totalValue || products.reduce((sum, product) => sum + product.cost * product.inventoryCount, 0);

  const productCostById = useMemo(
    () => new Map(products.map((product) => [product.id, product.cost])),
    [products]
  );
  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  );
  const estimatedCogs = useMemo(
    () => orders.reduce((sum, order) => sum + (order.items || []).reduce((itemSum, item) => {
      return itemSum + (productCostById.get(item.productId) || 0) * item.quantity;
    }, 0), 0),
    [orders, productCostById]
  );
  const lastSaleByProductId = useMemo(() => {
    const lastSale = new Map<string, string>();
    for (const order of orderHistory) {
      if (order.status === 'cancelled' || order.status === 'refunded') continue;
      const saleTimestamp = new Date(order.saleDate).getTime();
      if (!Number.isFinite(saleTimestamp)) continue;
      for (const item of order.items || []) {
        const current = lastSale.get(item.productId);
        if (!current || saleTimestamp > new Date(current).getTime()) {
          lastSale.set(item.productId, order.saleDate);
        }
      }
    }
    return lastSale;
  }, [orderHistory]);
  const trailingTwelveMonthSalesByProductId = useMemo(() => {
    const totals = new Map<string, { units: number; revenue: number }>();
    const cutoff = Date.now() - TWELVE_MONTH_WINDOW_MS;
    for (const order of orderHistory) {
      if (order.status === 'cancelled' || order.status === 'refunded') continue;
      const saleTimestamp = new Date(order.saleDate).getTime();
      if (!Number.isFinite(saleTimestamp) || saleTimestamp < cutoff) continue;
      for (const item of order.items || []) {
        const current = totals.get(item.productId) || { units: 0, revenue: 0 };
        current.units += item.quantity;
        current.revenue += saleItemRevenue(item);
        totals.set(item.productId, current);
      }
    }
    return totals;
  }, [orderHistory]);
  const staleProductAlerts = useMemo<StaleProductAlert[]>(() => {
    const now = Date.now();
    return products
      .filter((product) => product.isActive && product.inventoryCount > 0)
      .map((product) => {
        const lastSoldAt = lastSaleByProductId.get(product.id);
        const comparisonDate = lastSoldAt || product.createdAt || product.updatedAt;
        const daysSinceSale = daysSince(comparisonDate, now);
        if (daysSinceSale === null || daysSinceSale < 30) {
          return null;
        }
        return {
          product,
          daysSinceSale,
          lastSoldAt,
          severity: daysSinceSale >= 90 ? 'critical' : 'warning',
          trailingTwelveMonthUnits: trailingTwelveMonthSalesByProductId.get(product.id)?.units || 0,
          trailingTwelveMonthRevenue: trailingTwelveMonthSalesByProductId.get(product.id)?.revenue || 0,
        } satisfies StaleProductAlert;
      })
      .filter((alert): alert is StaleProductAlert => Boolean(alert))
      .sort((a, b) => {
        if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
        return b.daysSinceSale - a.daysSinceSale;
      });
  }, [lastSaleByProductId, products, trailingTwelveMonthSalesByProductId]);
  const stale90Count = staleProductAlerts.filter((alert) => alert.severity === 'critical').length;
  const staleDrilldownThreshold = stale90Count > 0 ? 90 : 30;
  const staleDrilldownItems = useMemo(
    () => staleProductAlerts.filter((alert) => alert.daysSinceSale >= staleDrilldownThreshold),
    [staleDrilldownThreshold, staleProductAlerts]
  );
  const staleDrilldownRevenue = useMemo(
    () => staleDrilldownItems.reduce((sum, alert) => sum + alert.trailingTwelveMonthRevenue, 0),
    [staleDrilldownItems]
  );
  const staleDrilldownUnits = useMemo(
    () => staleDrilldownItems.reduce((sum, alert) => sum + alert.trailingTwelveMonthUnits, 0),
    [staleDrilldownItems]
  );
  const staleDrilldownLabel = `${staleDrilldownItems.length} item${staleDrilldownItems.length === 1 ? '' : 's'} not sold in ${staleDrilldownThreshold}+ days`;

  const updateOrderDraft = (orderId: string, patch: Partial<OrderDraft>) => {
    setOrderDrafts((current) => ({
      ...current,
      [orderId]: {
        ...(current[orderId] || buildOrderDraft(orders.find((order) => order.id === orderId)!)),
        ...patch,
      },
    }));
  };

  const updateProductDraft = (productId: string, patch: Partial<ProductDraft>) => {
    setProductDrafts((current) => ({
      ...current,
      [productId]: {
        ...(current[productId] || buildProductDraft(products.find((product) => product.id === productId)!)),
        ...patch,
      },
    }));
  };

  const handleImageUpload = async (file: File | undefined, onImage: (imageUrl: string) => void) => {
    if (!file) return;
    try {
      const imageUrl = await readImageFile(file);
      onImage(imageUrl);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to load product image');
    }
  };

  const handleCreateProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session || saving) return;
    if (!productForm.sku.trim() || !productForm.name.trim()) {
      showError('SKU and product name are required');
      return;
    }

    try {
      setSaving(true);
      await createProduct(session.tenantId, session.accessToken, {
        sku: productForm.sku.trim(),
        name: productForm.name.trim(),
        brand: productForm.brand.trim() || undefined,
        description: productForm.description.trim() || undefined,
        category: productForm.category,
        price: dollarsToCents(productForm.price),
        cost: dollarsToCents(productForm.cost),
        inventoryCount: Number.parseInt(productForm.inventoryCount, 10) || 0,
        reorderPoint: Number.parseInt(productForm.reorderPoint, 10) || 0,
        imageUrl: productForm.imageUrl.trim() || undefined,
      });
      setProductForm(EMPTY_PRODUCT_FORM);
      showSuccess('Product added to store');
      await loadStore();
    } catch (error) {
      console.error('Failed to create store product:', error);
      showError(error instanceof Error ? error.message : 'Failed to create product');
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePromotion = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session || saving) return;
    if (!promotionForm.name.trim()) {
      showError('Deal name is required');
      return;
    }
    if (!promotionForm.isAutomatic && !promotionForm.code.trim()) {
      showError('Discount code deals need a code');
      return;
    }

    try {
      setSaving(true);
      await createStorePromotion(session.tenantId, session.accessToken, promotionFormToPayload(promotionForm));
      setPromotionForm(EMPTY_PROMOTION_FORM);
      showSuccess('Store deal added');
      await loadStore();
    } catch (error) {
      console.error('Failed to create store promotion:', error);
      showError(error instanceof Error ? error.message : 'Failed to create store deal');
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePromotion = async (promotion: StorePromotion) => {
    if (!session || saving) return;
    try {
      setSaving(true);
      const response = await updateStorePromotion(session.tenantId, session.accessToken, promotion.id, {
        isActive: !promotion.isActive,
      });
      setPromotions((current) => current.map((item) => item.id === promotion.id ? response.promotion : item));
      showSuccess(response.promotion.isActive ? 'Deal activated' : 'Deal paused');
    } catch (error) {
      console.error('Failed to update store promotion:', error);
      showError(error instanceof Error ? error.message : 'Failed to update store deal');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProduct = async (product: Product) => {
    if (!session || saving) return;
    const draft = productDrafts[product.id] || buildProductDraft(product);

    try {
      setSaving(true);
      const response = await updateProduct(session.tenantId, session.accessToken, product.id, {
        price: dollarsToCents(draft.price),
        cost: dollarsToCents(draft.cost),
        reorderPoint: Number.parseInt(draft.reorderPoint, 10) || 0,
        isActive: draft.isActive,
        imageUrl: draft.imageUrl.trim() || null,
      });
      setProducts((current) => current.map((item) => item.id === product.id ? { ...item, ...response.product } : item));
      setProductDrafts((current) => ({ ...current, [product.id]: buildProductDraft(response.product) }));
      showSuccess('Product details updated');
    } catch (error) {
      console.error('Failed to update store product:', error);
      showError(error instanceof Error ? error.message : 'Failed to update product');
    } finally {
      setSaving(false);
    }
  };

  const handleAdjustInventory = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session || saving || !adjustProductId) return;
    const quantity = Number.parseInt(adjustQuantity, 10);
    if (!Number.isFinite(quantity) || quantity === 0) {
      showError('Enter a non-zero inventory quantity');
      return;
    }

    try {
      setSaving(true);
      await adjustProductInventory(
        session.tenantId,
        session.accessToken,
        adjustProductId,
        quantity,
        quantity > 0 ? 'received' : 'adjustment',
        adjustNotes.trim() || 'Store operations adjustment'
      );
      setAdjustQuantity('0');
      setAdjustNotes('');
      showSuccess('Inventory adjusted');
      await loadStore();
    } catch (error) {
      console.error('Failed to adjust product inventory:', error);
      showError(error instanceof Error ? error.message : 'Failed to adjust inventory');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveOrder = async (order: StoreOrder) => {
    if (!session || saving) return;
    const draft = orderDrafts[order.id] || buildOrderDraft(order);

    try {
      setSaving(true);
      const response = await updateStoreOrderFulfillment(session.tenantId, session.accessToken, order.id, {
        fulfillmentStatus: draft.fulfillmentStatus,
        shippingMethod: draft.shippingMethod,
        carrier: draft.carrier.trim() || null,
        trackingNumber: draft.trackingNumber.trim() || null,
        trackingUrl: normalizeTrackingUrl(draft.trackingUrl) || null,
        notificationEmail: draft.notificationEmail.trim() || null,
        notificationStatus: draft.notificationStatus,
        stripePaymentStatus: draft.stripePaymentStatus.trim() || 'paid',
      });
      setOrders((current) => current.map((item) => item.id === order.id ? response.order : item));
      setOrderHistory((current) => current.map((item) => item.id === order.id ? response.order : item));
      setOrderDrafts((current) => ({ ...current, [order.id]: buildOrderDraft(response.order) }));
      showSuccess('Store order updated');
    } catch (error) {
      console.error('Failed to update store order:', error);
      showError(error instanceof Error ? error.message : 'Failed to update store order');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickFulfillment = async (order: StoreOrder, fulfillmentStatus: StoreFulfillmentStatus) => {
    if (!session || saving) return;
    const draft = orderDrafts[order.id] || buildOrderDraft(order);

    try {
      setSaving(true);
      const response = await updateStoreOrderFulfillment(session.tenantId, session.accessToken, order.id, {
        fulfillmentStatus,
        shippingMethod: draft.shippingMethod,
        carrier: draft.carrier.trim() || null,
        trackingNumber: draft.trackingNumber.trim() || null,
        trackingUrl: normalizeTrackingUrl(draft.trackingUrl) || null,
        notificationEmail: draft.notificationEmail.trim() || null,
        notificationStatus: draft.notificationStatus,
        stripePaymentStatus: draft.stripePaymentStatus.trim() || 'paid',
      });
      setOrders((current) => current.map((item) => item.id === order.id ? response.order : item));
      setOrderHistory((current) => current.map((item) => item.id === order.id ? response.order : item));
      setOrderDrafts((current) => ({ ...current, [order.id]: buildOrderDraft(response.order) }));
      showSuccess(fulfillmentStatus === 'delivered' ? 'Order marked delivered' : 'Order marked shipped');
    } catch (error) {
      console.error('Failed to update store order:', error);
      showError(error instanceof Error ? error.message : 'Failed to update store order');
    } finally {
      setSaving(false);
    }
  };

  if (!session) {
    return (
      <div className="store-ops-page">
        <div className="store-ops-empty">
          <h1>Store Operations</h1>
          <p>Sign in to manage store orders and inventory.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="store-ops-page">
      <header className="store-ops-hero">
        <div>
          <span className="store-ops-eyebrow">Retail Operations</span>
          <h1>Store Operations</h1>
          <p>Portal orders, product margins, inventory, Stripe payment status, shipping, and patient notifications.</p>
        </div>
        <button type="button" className="store-ops-refresh" onClick={loadStore} disabled={loading}>
          {loading ? <Loader2 size={18} className="spin" /> : <RefreshCw size={18} />}
          Refresh
        </button>
      </header>

      <section className="store-ops-range-bar" aria-label="Store order date range">
        <div>
          <span>Order View</span>
          <strong>{orderRangeBounds.label}</strong>
          <p>{orderRangeSummary(orderRangeBounds)}</p>
        </div>
        <div className="store-ops-range-buttons">
          {ORDER_RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={orderRange === option.value ? 'active' : ''}
              onClick={() => selectOrderRange(option.value)}
            >
              <CalendarDays size={15} />
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="store-ops-metrics" aria-label="Store metrics">
        <article>
          <DollarSign size={21} />
          <span>{orderRangeBounds.metricLabel} Revenue</span>
          <strong>{formatCurrency(salesReport?.totalRevenue || orderRevenue)}</strong>
        </article>
        <article>
          <Truck size={21} />
          <span>Orders To Ship</span>
          <strong>{ordersToShip.length}</strong>
        </article>
        <article>
          <Boxes size={21} />
          <span>Inventory Value</span>
          <strong>{formatCurrency(inventoryValue)}</strong>
        </article>
        <article>
          <PackageCheck size={21} />
          <span>Low Stock</span>
          <strong>{inventoryStatus?.lowStockCount ?? lowStockProducts.length}</strong>
        </article>
        <article>
          <CreditCard size={21} />
          <span>Stripe Captured</span>
          <strong>{formatCurrency(capturedPayments)}</strong>
        </article>
        <article>
          <Ticket size={21} />
          <span>Active Deals</span>
          <strong>{activeDealCount}</strong>
        </article>
        <article>
          <Bell size={21} />
          <span>Queued Notices</span>
          <strong>{queuedNotifications}</strong>
        </article>
      </section>

      {staleProductAlerts.length > 0 && (
        <section className="store-ops-stale-drilldown" aria-label="Slow-moving product alerts">
          <button
            type="button"
            className={`store-ops-stale-summary ${staleDrilldownThreshold === 90 ? 'critical' : 'warning'}`}
            aria-expanded={showStaleDetails}
            aria-controls="store-ops-stale-details"
            onClick={() => setShowStaleDetails((value) => !value)}
          >
            <span className="store-ops-stale-summary-icon">
              <AlertTriangle size={18} />
            </span>
            <span className="store-ops-stale-summary-copy">
              <strong>{staleDrilldownLabel}</strong>
              <span>
                {formatCurrency(staleDrilldownRevenue)} sold in the last 12 months across {staleDrilldownUnits} unit{staleDrilldownUnits === 1 ? '' : 's'}
              </span>
            </span>
            <ChevronDown className={showStaleDetails ? 'open' : ''} size={18} />
          </button>

          {showStaleDetails && (
            <div id="store-ops-stale-details" className="store-ops-stale-details">
              <header>
                <div>
                  <h2>Slow-Moving Product Detail</h2>
                  <p>Products over the current {staleDrilldownThreshold}+ day threshold with trailing 12-month sales.</p>
                </div>
                <strong>{staleDrilldownItems.length}</strong>
              </header>
              <div className="store-ops-stale-detail-list">
                {staleDrilldownItems.map((alert) => (
                  <article key={alert.product.id} className={alert.severity}>
                    <ProductThumb product={alert.product} compact />
                    <div className="store-ops-stale-product">
                      <strong>{alert.product.name}</strong>
                      <span>{alert.product.sku} · {alert.product.inventoryCount} in stock</span>
                    </div>
                    <div className="store-ops-stale-detail-metric">
                      <span>Last sold</span>
                      <strong>{alert.lastSoldAt ? formatDate(alert.lastSoldAt) : 'No recorded sale'}</strong>
                    </div>
                    <div className="store-ops-stale-detail-metric">
                      <span>12M units</span>
                      <strong>{alert.trailingTwelveMonthUnits}</strong>
                    </div>
                    <div className="store-ops-stale-detail-metric">
                      <span>12M sold</span>
                      <strong>{formatCurrency(alert.trailingTwelveMonthRevenue)}</strong>
                    </div>
                    <div className="store-ops-stale-detail-metric age">
                      <span>Age</span>
                      <strong>{alert.daysSinceSale}d</strong>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <nav className="store-ops-tabs" aria-label="Store operations sections">
        {([
          ['orders', 'Orders'],
          ['products', 'Products'],
          ['deals', 'Deals'],
          ['shipping', 'Shipping'],
          ['payments', 'Payments'],
          ['notifications', 'Notifications'],
        ] as Array<[StoreTab, string]>).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            className={activeTab === tab ? 'active' : ''}
            onClick={() => selectTab(tab)}
          >
            {label}
          </button>
        ))}
      </nav>

      {loading ? (
        <div className="store-ops-loading">
          <Skeleton height="4rem" />
          <Skeleton height="22rem" />
        </div>
      ) : (
        <>
          {activeTab === 'orders' && (
            <section className="store-ops-grid store-ops-grid-wide">
              <div className="store-ops-panel">
                <div className="store-ops-panel-header">
                  <div>
                    <h2>Order Queue</h2>
                    <p>{filteredOrders.length} of {orders.length} {orderRangeBounds.label.toLowerCase()} store orders</p>
                  </div>
                  <div className="store-ops-search">
                    <Search size={16} />
                    <input
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="Search orders"
                    />
                  </div>
                </div>
                <div className="store-ops-order-list">
                  {filteredOrders.length === 0 ? (
                    <div className="store-ops-empty compact">No store orders yet.</div>
                  ) : (
                    filteredOrders.map((order) => {
                      const draft = orderDrafts[order.id] || buildOrderDraft(order);
                      return (
                        <article key={order.id} className={`store-ops-order ${draft.fulfillmentStatus}`}>
                          <div className="store-ops-order-main">
                            <div>
                              <span className="store-ops-order-id">#{order.id.slice(0, 8)}</span>
                              <h3>{patientName(order)}</h3>
                              <p>{formatDate(order.saleDate)} · {formatCurrency(order.total)} · {order.items?.length || 0} line items</p>
                              {(order.discount || order.shippingDiscount || order.promotionCode) ? (
                                <p className="store-ops-order-deal">
                                  {order.promotionCode ? `${order.promotionCode} · ` : ''}
                                  {formatCurrency((order.discount || 0) + (order.shippingDiscount || 0))} discount applied
                                </p>
                              ) : null}
                            </div>
                            <span className={`store-ops-status ${draft.fulfillmentStatus}`}>
                              {FULFILLMENT_LABELS[draft.fulfillmentStatus]}
                            </span>
                          </div>
                          <div className="store-ops-order-items" aria-label={`Items in order for ${patientName(order)}`}>
                            {(order.items || []).length === 0 ? (
                              <div className="store-ops-order-line empty">No line items attached.</div>
                            ) : (
                              (order.items || []).map((item) => {
                                const product = productsById.get(item.productId);
                                const imageProduct = {
                                  id: item.productId,
                                  name: item.productName,
                                  brand: product?.brand || '',
                                  category: product?.category || 'skincare',
                                  sku: item.productSku,
                                  imageUrl: item.imageUrl || product?.imageUrl,
                                };
                                return (
                                  <div key={item.id} className="store-ops-order-line">
                                    <ProductThumb product={imageProduct} compact />
                                    <div className="store-ops-order-line-copy">
                                      <strong>{item.productName}</strong>
                                      <span>{item.productSku || 'No SKU'}</span>
                                    </div>
                                    <span className="store-ops-order-line-qty">Qty {item.quantity}</span>
                                    <span>{formatCurrency(item.unitPrice)} ea</span>
                                    <strong>{formatCurrency(item.lineTotal)}</strong>
                                  </div>
                                );
                              })
                            )}
                          </div>
                          <div className="store-ops-order-controls">
                            <label>
                              Status
                              <select
                                aria-label={`Fulfillment status for ${patientName(order)}`}
                                value={draft.fulfillmentStatus}
                                onChange={(event) => updateOrderDraft(order.id, { fulfillmentStatus: event.target.value as StoreFulfillmentStatus })}
                              >
                                {Object.entries(FULFILLMENT_LABELS).map(([value, label]) => (
                                  <option key={value} value={value}>{label}</option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Carrier
                              <input
                                aria-label={`Carrier for ${patientName(order)}`}
                                value={draft.carrier}
                                onChange={(event) => updateOrderDraft(order.id, { carrier: event.target.value })}
                                placeholder="USPS"
                              />
                            </label>
                            <label>
                              Tracking
                              <input
                                aria-label={`Tracking number for ${patientName(order)}`}
                                value={draft.trackingNumber}
                                onChange={(event) => updateOrderDraft(order.id, { trackingNumber: event.target.value })}
                                placeholder="Tracking number"
                              />
                            </label>
                            <label>
                              Tracking Link
                              <input
                                aria-label={`Tracking link for ${patientName(order)}`}
                                value={draft.trackingUrl}
                                onChange={(event) => updateOrderDraft(order.id, { trackingUrl: event.target.value })}
                                placeholder="https://www.fedex.com/fedextrack/..."
                              />
                            </label>
                            {draft.trackingUrl.trim() ? (
                              <a
                                className="store-ops-tracking-link"
                                href={normalizeTrackingUrl(draft.trackingUrl)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <ExternalLink size={14} />
                                Track
                              </a>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => handleQuickFulfillment(order, 'shipped')}
                              disabled={saving}
                              aria-label={`Mark shipped for ${patientName(order)}`}
                            >
                              <Truck size={16} />
                              Shipped
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickFulfillment(order, 'delivered')}
                              disabled={saving}
                              aria-label={`Mark delivered for ${patientName(order)}`}
                            >
                              <PackageCheck size={16} />
                              Delivered
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveOrder(order)}
                              disabled={saving}
                              aria-label={`Save order update for ${patientName(order)}`}
                            >
                              Save
                            </button>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </div>

              <aside className="store-ops-panel store-ops-story">
                <h2>Store Story</h2>
                <dl>
                  <div>
                    <dt>Revenue</dt>
                    <dd>{formatCurrency(orderRevenue)}</dd>
                  </div>
                  <div>
                    <dt>Estimated margin</dt>
                    <dd>{formatCurrency(Math.max(0, orderRevenue - estimatedCogs))}</dd>
                  </div>
                  <div>
                    <dt>Top product</dt>
                    <dd>{salesReport?.topProducts?.[0]?.productName || 'No product sales yet'}</dd>
                  </div>
                  <div>
                    <dt>Risk</dt>
                    <dd>
                      {stale90Count > 0
                        ? `${stale90Count} item${stale90Count === 1 ? '' : 's'} stalled 90+ days`
                        : staleProductAlerts.length > 0
                          ? `${staleProductAlerts.length} slow mover${staleProductAlerts.length === 1 ? '' : 's'}`
                          : lowStockProducts.length > 0
                            ? `${lowStockProducts.length} reorder item${lowStockProducts.length === 1 ? '' : 's'}`
                            : 'Inventory is healthy'}
                    </dd>
                  </div>
                </dl>
              </aside>
            </section>
          )}

          {activeTab === 'products' && (
            <section className="store-ops-grid">
              <div className="store-ops-panel">
                <div className="store-ops-panel-header">
                  <div>
                    <h2>Product Catalog</h2>
                    <p>Pricing, margins, active status, and reorder points</p>
                  </div>
                  <div className="store-ops-inline-filters">
                    <select
                      aria-label="Filter products by category"
                      value={categoryFilter}
                      onChange={(event) => setCategoryFilter(event.target.value as ProductCategory | 'all')}
                    >
                      {CATEGORY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="store-ops-product-table">
                  {filteredProducts.map((product) => {
                    const draft = productDrafts[product.id] || buildProductDraft(product);
                    const margin = product.price > 0 ? Math.round(((product.price - product.cost) / product.price) * 100) : 0;
                    return (
                      <article key={product.id} className={!draft.isActive ? 'inactive' : ''}>
                        <div className="store-ops-product-identity">
                          <ProductThumb product={{ ...product, imageUrl: draft.imageUrl }} compact />
                          <div>
                            <strong>{product.name}</strong>
                            <span>{product.sku} · {product.brand || 'No brand'} · {product.category.replace('_', ' ')}</span>
                          </div>
                        </div>
                        <div className="store-ops-product-controls">
                          <label>
                            Price
                            <input
                              aria-label={`Price for ${product.name}`}
                              value={draft.price}
                              onChange={(event) => updateProductDraft(product.id, { price: event.target.value })}
                              inputMode="decimal"
                            />
                          </label>
                          <label>
                            Cost
                            <input
                              aria-label={`Cost for ${product.name}`}
                              value={draft.cost}
                              onChange={(event) => updateProductDraft(product.id, { cost: event.target.value })}
                              inputMode="decimal"
                            />
                          </label>
                          <label>
                            Reorder
                            <input
                              aria-label={`Reorder point for ${product.name}`}
                              value={draft.reorderPoint}
                              onChange={(event) => updateProductDraft(product.id, { reorderPoint: event.target.value })}
                              inputMode="numeric"
                            />
                          </label>
                          <div className="store-ops-product-stock">
                            <span>{product.inventoryCount} on hand</span>
                            <span>{margin}% margin</span>
                          </div>
                          <label className="store-ops-check">
                            <input
                              type="checkbox"
                              checked={draft.isActive}
                              onChange={(event) => updateProductDraft(product.id, { isActive: event.target.checked })}
                            />
                            Active
                          </label>
                          <button type="button" onClick={() => handleSaveProduct(product)} disabled={saving}>
                            Save
                          </button>
                        </div>
                        <div className="store-ops-product-image-manager">
                          <ProductThumb product={{ ...product, imageUrl: draft.imageUrl }} />
                          <label>
                            Image URL
                            <input
                              aria-label={`Image URL for ${product.name}`}
                              value={draft.imageUrl}
                              onChange={(event) => updateProductDraft(product.id, { imageUrl: event.target.value })}
                              placeholder="https://... or upload"
                            />
                          </label>
                          <label className="store-ops-upload-button">
                            <Upload size={15} />
                            Upload
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(event) => {
                                void handleImageUpload(event.target.files?.[0], (imageUrl) => updateProductDraft(product.id, { imageUrl }));
                                event.currentTarget.value = '';
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            className="store-ops-clear-image"
                            onClick={() => updateProductDraft(product.id, { imageUrl: '' })}
                          >
                            <X size={15} />
                            Clear
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>

              <aside className="store-ops-panel">
                <h2>Add Product</h2>
                <form className="store-ops-form" onSubmit={handleCreateProduct}>
                  <label>
                    SKU
                    <input value={productForm.sku} onChange={(event) => setProductForm((current) => ({ ...current, sku: event.target.value }))} />
                  </label>
                  <label>
                    Product name
                    <input value={productForm.name} onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))} />
                  </label>
                  <label>
                    Brand
                    <input value={productForm.brand} onChange={(event) => setProductForm((current) => ({ ...current, brand: event.target.value }))} />
                  </label>
                  <label>
                    Category
                    <select value={productForm.category} onChange={(event) => setProductForm((current) => ({ ...current, category: event.target.value as ProductCategory }))}>
                      {CATEGORY_OPTIONS.filter((option) => option.value !== 'all').map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <div className="store-ops-form-row">
                    <label>
                      Price
                      <input value={productForm.price} onChange={(event) => setProductForm((current) => ({ ...current, price: event.target.value }))} inputMode="decimal" />
                    </label>
                    <label>
                      Cost
                      <input value={productForm.cost} onChange={(event) => setProductForm((current) => ({ ...current, cost: event.target.value }))} inputMode="decimal" />
                    </label>
                  </div>
                  <div className="store-ops-form-row">
                    <label>
                      Stock
                      <input value={productForm.inventoryCount} onChange={(event) => setProductForm((current) => ({ ...current, inventoryCount: event.target.value }))} inputMode="numeric" />
                    </label>
                    <label>
                      Reorder
                      <input value={productForm.reorderPoint} onChange={(event) => setProductForm((current) => ({ ...current, reorderPoint: event.target.value }))} inputMode="numeric" />
                    </label>
                  </div>
                  <label>
                    Description
                    <textarea value={productForm.description} onChange={(event) => setProductForm((current) => ({ ...current, description: event.target.value }))} />
                  </label>
                  <div className="store-ops-image-field">
                    <span>Product image</span>
                    <div className="store-ops-image-editor">
                      <ProductThumb
                        product={{
                          name: productForm.name || 'New Product',
                          brand: productForm.brand || 'Office Store',
                          category: productForm.category,
                          sku: productForm.sku || 'NEW',
                          imageUrl: productForm.imageUrl,
                        }}
                      />
                      <div className="store-ops-image-controls">
                        <input
                          aria-label="Product image URL"
                          value={productForm.imageUrl}
                          onChange={(event) => setProductForm((current) => ({ ...current, imageUrl: event.target.value }))}
                          placeholder="https://... or upload a file"
                        />
                        <div>
                          <label className="store-ops-upload-button">
                            <Upload size={15} />
                            Upload
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(event) => {
                                void handleImageUpload(event.target.files?.[0], (imageUrl) => setProductForm((current) => ({ ...current, imageUrl })));
                                event.currentTarget.value = '';
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            className="store-ops-clear-image"
                            onClick={() => setProductForm((current) => ({ ...current, imageUrl: '' }))}
                          >
                            <X size={15} />
                            Clear
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <button type="submit" disabled={saving}>
                    <Plus size={16} />
                    Add Product
                  </button>
                </form>
              </aside>
            </section>
          )}

          {activeTab === 'deals' && (
            <section className="store-ops-grid">
              <div className="store-ops-panel">
                <div className="store-ops-panel-header">
                  <div>
                    <h2>Store Deals</h2>
                    <p>Discount codes, free-shipping thresholds, timed sale days, and tracked redemptions</p>
                  </div>
                  <div className="store-ops-deal-summary">
                    <Ticket size={16} />
                    <strong>{activeDealCount} active</strong>
                    <span>{formatCurrency(discountGiven)} given {orderRangeBounds.label.toLowerCase()}</span>
                  </div>
                </div>
                <div className="store-ops-deal-list">
                  {promotions.length === 0 ? (
                    <div className="store-ops-empty compact">No store deals have been created yet.</div>
                  ) : (
                    promotions.map((promotion) => (
                      <article key={promotion.id} className={!promotion.isActive ? 'paused' : ''}>
                        <div>
                          <span className="store-ops-deal-kind">{promotion.isAutomatic ? 'Automatic' : promotion.code || 'Code'}</span>
                          <h3>{promotion.name}</h3>
                          <p>{formatPromotionValue(promotion)} · {formatPromotionWindow(promotion)}</p>
                        </div>
                        <div className="store-ops-deal-meta">
                          <span>Min {formatCurrency(promotion.minimumSubtotal)}</span>
                          <span>{promotion.redemptionCount}{promotion.maxRedemptions ? ` / ${promotion.maxRedemptions}` : ''} redeemed</span>
                        </div>
                        <button type="button" onClick={() => handleTogglePromotion(promotion)} disabled={saving}>
                          {promotion.isActive ? 'Pause' : 'Activate'}
                        </button>
                      </article>
                    ))
                  )}
                </div>
              </div>

              <aside className="store-ops-panel">
                <h2>Add Deal</h2>
                <form className="store-ops-form store-ops-deal-form" onSubmit={handleCreatePromotion}>
                  <label>
                    Deal name
                    <input
                      value={promotionForm.name}
                      onChange={(event) => setPromotionForm((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Free standard shipping over $80"
                    />
                  </label>
                  <div className="store-ops-form-row">
                    <label>
                      Type
                      <select
                        value={promotionForm.promotionType}
                        onChange={(event) => setPromotionForm((current) => ({ ...current, promotionType: event.target.value as StorePromotionType }))}
                      >
                        <option value="percentage">Percent off</option>
                        <option value="fixed">Fixed dollars off</option>
                        <option value="free_shipping">Free shipping</option>
                      </select>
                    </label>
                    <label>
                      Value
                      <input
                        value={promotionForm.value}
                        disabled={promotionForm.promotionType === 'free_shipping'}
                        onChange={(event) => setPromotionForm((current) => ({ ...current, value: event.target.value }))}
                        inputMode="numeric"
                        placeholder={promotionForm.promotionType === 'percentage' ? '10' : '15.00'}
                      />
                    </label>
                  </div>
                  <label>
                    Discount code
                    <input
                      value={promotionForm.code}
                      disabled={promotionForm.isAutomatic}
                      onChange={(event) => setPromotionForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
                      placeholder="WELCOME10"
                    />
                  </label>
                  <label className="store-ops-check">
                    <input
                      type="checkbox"
                      checked={promotionForm.isAutomatic}
                      onChange={(event) => setPromotionForm((current) => ({ ...current, isAutomatic: event.target.checked, code: event.target.checked ? '' : current.code }))}
                    />
                    Apply automatically
                  </label>
                  <div className="store-ops-form-row">
                    <label>
                      Minimum cart
                      <input
                        value={promotionForm.minimumSubtotal}
                        onChange={(event) => setPromotionForm((current) => ({ ...current, minimumSubtotal: event.target.value }))}
                        inputMode="decimal"
                        placeholder="80.00"
                      />
                    </label>
                    <label>
                      Max redemptions
                      <input
                        value={promotionForm.maxRedemptions}
                        onChange={(event) => setPromotionForm((current) => ({ ...current, maxRedemptions: event.target.value }))}
                        inputMode="numeric"
                        placeholder="No limit"
                      />
                    </label>
                  </div>
                  <div className="store-ops-form-row">
                    <label>
                      Starts
                      <input
                        type="datetime-local"
                        value={promotionForm.startsAt}
                        onChange={(event) => setPromotionForm((current) => ({ ...current, startsAt: event.target.value }))}
                      />
                    </label>
                    <label>
                      Ends
                      <input
                        type="datetime-local"
                        value={promotionForm.endsAt}
                        onChange={(event) => setPromotionForm((current) => ({ ...current, endsAt: event.target.value }))}
                      />
                    </label>
                  </div>
                  <label className="store-ops-check">
                    <input
                      type="checkbox"
                      checked={promotionForm.isActive}
                      onChange={(event) => setPromotionForm((current) => ({ ...current, isActive: event.target.checked }))}
                    />
                    Active now
                  </label>
                  <div className="store-ops-template-list">
                    <button
                      type="button"
                      onClick={() => setPromotionForm({
                        ...EMPTY_PROMOTION_FORM,
                        name: 'Free standard shipping over $80',
                        promotionType: 'free_shipping',
                        value: '0',
                        minimumSubtotal: '80.00',
                        isAutomatic: true,
                      })}
                    >
                      <Truck size={15} />
                      Free shipping
                    </button>
                    <button
                      type="button"
                      onClick={() => setPromotionForm({
                        ...EMPTY_PROMOTION_FORM,
                        name: 'Sale Day 50% Off',
                        promotionType: 'percentage',
                        value: '50',
                        isAutomatic: true,
                        startsAt: dateTimeInputValue(new Date().toISOString()),
                        endsAt: endOfTodayInputValue(),
                      })}
                    >
                      <Percent size={15} />
                      50% sale day
                    </button>
                  </div>
                  <button type="submit" disabled={saving}>
                    <Plus size={16} />
                    Add Deal
                  </button>
                </form>
              </aside>
            </section>
          )}

          {activeTab === 'shipping' && (
            <section className="store-ops-grid">
              <div className="store-ops-panel">
                <h2>Shipping Workbench</h2>
                <div className="store-ops-shipping-list">
                  {ordersToShip.map((order) => {
                    const draft = orderDrafts[order.id] || buildOrderDraft(order);
                    return (
                      <article key={order.id}>
                        <div>
                          <strong>{patientName(order)}</strong>
                          <span>{formatDate(order.saleDate)} · {order.shippingMethod} · {order.items?.map((item) => `${item.quantity}x ${item.productName}`).join(' · ') || 'No items'}</span>
                        </div>
                        <select
                          aria-label={`Shipping method for ${patientName(order)}`}
                          value={draft.shippingMethod}
                          onChange={(event) => updateOrderDraft(order.id, { shippingMethod: event.target.value as StoreShippingMethod })}
                        >
                          <option value="standard">Standard</option>
                          <option value="priority">Priority</option>
                          <option value="pickup">Pickup</option>
                        </select>
                        <input
                          aria-label={`Shipping carrier for ${patientName(order)}`}
                          value={draft.carrier}
                          onChange={(event) => updateOrderDraft(order.id, { carrier: event.target.value })}
                          placeholder="Carrier"
                        />
                        <input
                          aria-label={`Shipping tracking number for ${patientName(order)}`}
                          value={draft.trackingNumber}
                          onChange={(event) => updateOrderDraft(order.id, { trackingNumber: event.target.value })}
                          placeholder="Tracking #"
                        />
                        <input
                          aria-label={`Shipping tracking link for ${patientName(order)}`}
                          value={draft.trackingUrl}
                          onChange={(event) => updateOrderDraft(order.id, { trackingUrl: event.target.value })}
                          placeholder="Tracking link"
                        />
                        <button type="button" onClick={() => handleQuickFulfillment(order, 'shipped')} disabled={saving}>
                          <Truck size={16} />
                          Shipped
                        </button>
                        <button type="button" onClick={() => handleQuickFulfillment(order, 'delivered')} disabled={saving}>
                          <PackageCheck size={16} />
                          Delivered
                        </button>
                      </article>
                    );
                  })}
                </div>
              </div>
              <aside className="store-ops-panel">
                <h2>Inventory Adjustments</h2>
                <form className="store-ops-form" onSubmit={handleAdjustInventory}>
                  <label>
                    Product
                    <select value={adjustProductId} onChange={(event) => setAdjustProductId(event.target.value)}>
                      <option value="">Select product</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>{product.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Quantity
                    <input value={adjustQuantity} onChange={(event) => setAdjustQuantity(event.target.value)} inputMode="numeric" />
                  </label>
                  <label>
                    Notes
                    <textarea value={adjustNotes} onChange={(event) => setAdjustNotes(event.target.value)} />
                  </label>
                  <button type="submit" disabled={saving || !adjustProductId}>
                    <Boxes size={16} />
                    Adjust Inventory
                  </button>
                </form>
                <div className="store-ops-low-stock">
                  <h3>Low Stock</h3>
                  {lowStockProducts.length === 0 ? (
                    <p>No low-stock store products.</p>
                  ) : (
                    lowStockProducts.map((product) => (
                      <span key={product.id}>{product.name}: {product.inventoryCount} left</span>
                    ))
                  )}
                </div>
              </aside>
            </section>
          )}

          {activeTab === 'payments' && (
            <section className="store-ops-grid">
              <div className="store-ops-panel">
                <h2>Stripe Payment Queue</h2>
                <div className="store-ops-payment-grid">
                  {orders.map((order) => {
                    const draft = orderDrafts[order.id] || buildOrderDraft(order);
                    return (
                      <article key={order.id}>
                        <div>
                          <strong>{patientName(order)}</strong>
                          <span>{formatDate(order.saleDate)} · {formatCurrency(order.total)} · {order.paymentReference || 'No reference'}</span>
                        </div>
                        <label>
                          Stripe status
                          <input
                            aria-label={`Stripe payment status for ${patientName(order)}`}
                            value={draft.stripePaymentStatus}
                            onChange={(event) => updateOrderDraft(order.id, { stripePaymentStatus: event.target.value })}
                          />
                        </label>
                        <button type="button" onClick={() => handleSaveOrder(order)} disabled={saving}>
                          <CreditCard size={16} />
                          Save
                        </button>
                      </article>
                    );
                  })}
                </div>
              </div>
              <aside className="store-ops-panel store-ops-story">
                <h2>Payment Summary</h2>
                <dl>
                  <div>
                    <dt>Captured</dt>
                    <dd>{formatCurrency(capturedPayments)}</dd>
                  </div>
                  <div>
                    <dt>Pending review</dt>
                    <dd>{orders.filter((order) => order.stripePaymentStatus !== 'paid').length}</dd>
                  </div>
                  <div>
                    <dt>Refund/cancel risk</dt>
                    <dd>{orders.filter((order) => ['exception', 'cancelled'].includes(order.fulfillmentStatus)).length}</dd>
                  </div>
                </dl>
              </aside>
            </section>
          )}

          {activeTab === 'notifications' && (
            <section className="store-ops-grid">
              <div className="store-ops-panel">
                <h2>Patient Notifications</h2>
                <div className="store-ops-notice-list">
                  {orders.map((order) => {
                    const draft = orderDrafts[order.id] || buildOrderDraft(order);
                    return (
                      <article key={order.id}>
                        <div>
                          <strong>{patientName(order)}</strong>
                          <span>{formatDate(order.saleDate)} · {draft.notificationEmail || 'No email'} · {NOTIFICATION_LABELS[draft.notificationStatus]}</span>
                        </div>
                        <select
                          aria-label={`Notification status for ${patientName(order)}`}
                          value={draft.notificationStatus}
                          onChange={(event) => updateOrderDraft(order.id, { notificationStatus: event.target.value as StoreNotificationStatus })}
                        >
                          {Object.entries(NOTIFICATION_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                        <button type="button" onClick={() => handleSaveOrder(order)} disabled={saving}>
                          <Send size={16} />
                          Save
                        </button>
                      </article>
                    );
                  })}
                </div>
              </div>
              <aside className="store-ops-panel">
                <h2>Notification Templates</h2>
                <div className="store-ops-template-list">
                  <span>Order confirmation</span>
                  <span>Shipping label created</span>
                  <span>Package shipped</span>
                  <span>Pickup ready</span>
                  <span>Delivery exception</span>
                </div>
              </aside>
            </section>
          )}
        </>
      )}
    </div>
  );
}
