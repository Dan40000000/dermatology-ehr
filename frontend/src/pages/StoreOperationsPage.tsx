import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Bell,
  Boxes,
  CreditCard,
  DollarSign,
  Loader2,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  Send,
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
  fetchInventoryStatus,
  fetchLowStockProducts,
  fetchProductSales,
  fetchProducts,
  fetchSalesReport,
  updateProduct,
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
  StoreShippingMethod,
} from '../types';

type StoreTab = 'orders' | 'products' | 'shipping' | 'payments' | 'notifications';

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

interface OrderDraft {
  fulfillmentStatus: StoreFulfillmentStatus;
  shippingMethod: StoreShippingMethod;
  carrier: string;
  trackingNumber: string;
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

const CATEGORY_OPTIONS: Array<{ value: ProductCategory | 'all'; label: string }> = [
  { value: 'all', label: 'All products' },
  { value: 'skincare', label: 'Skincare' },
  { value: 'sunscreen', label: 'Sunscreen' },
  { value: 'cosmetic', label: 'Cosmetic' },
  { value: 'post_procedure', label: 'Post-procedure' },
  { value: 'prescription', label: 'Prescription' },
];

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
  if (value === 'products' || value === 'shipping' || value === 'payments' || value === 'notifications') {
    return value;
  }
  return 'orders';
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

function patientName(order: StoreOrder): string {
  return [order.patientFirstName, order.patientLastName].filter(Boolean).join(' ') || 'Portal patient';
}

function buildOrderDraft(order: StoreOrder): OrderDraft {
  return {
    fulfillmentStatus: order.fulfillmentStatus || 'paid',
    shippingMethod: order.shippingMethod || 'standard',
    carrier: order.carrier || '',
    trackingNumber: order.trackingNumber || '',
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [inventoryStatus, setInventoryStatus] = useState<InventoryStatus | null>(null);
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
  const [salesReport, setSalesReport] = useState<SalesReport | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ProductCategory | 'all'>('all');
  const [productForm, setProductForm] = useState<ProductForm>(EMPTY_PRODUCT_FORM);
  const [orderDrafts, setOrderDrafts] = useState<Record<string, OrderDraft>>({});
  const [productDrafts, setProductDrafts] = useState<Record<string, ProductDraft>>({});
  const [adjustProductId, setAdjustProductId] = useState('');
  const [adjustQuantity, setAdjustQuantity] = useState('0');
  const [adjustNotes, setAdjustNotes] = useState('');

  const loadStore = useCallback(async () => {
    if (!session) {
      setProducts([]);
      setOrders([]);
      setLoading(false);
      return;
    }

    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();

    try {
      setLoading(true);
      const [productRes, orderRes, inventoryRes, lowStockRes, reportRes] = await Promise.all([
        fetchProducts(session.tenantId, session.accessToken),
        fetchProductSales(session.tenantId, session.accessToken, { limit: 100 }),
        fetchInventoryStatus(session.tenantId, session.accessToken),
        fetchLowStockProducts(session.tenantId, session.accessToken),
        fetchSalesReport(session.tenantId, session.accessToken, { startDate: start, endDate: end }),
      ]);

      setProducts(productRes.products || []);
      setOrders(orderRes.orders || []);
      setInventoryStatus(inventoryRes.status || null);
      setLowStockProducts(lowStockRes.products || []);
      setSalesReport(reportRes.report || null);
      setProductDrafts(
        Object.fromEntries((productRes.products || []).map((product) => [product.id, buildProductDraft(product)]))
      );
      setOrderDrafts(
        Object.fromEntries((orderRes.orders || []).map((order) => [order.id, buildOrderDraft(order)]))
      );
    } catch (error) {
      console.error('Failed to load store operations:', error);
      showError('Failed to load store operations');
    } finally {
      setLoading(false);
    }
  }, [session, showError]);

  useEffect(() => {
    loadStore();
  }, [loadStore]);

  useEffect(() => {
    setActiveTab(normalizeTab(searchParams.get('tab')));
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
      order.fulfillmentStatus,
      ...(order.items || []).map((item) => item.productName),
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(q)));
  }, [orders, searchTerm]);

  const ordersToShip = useMemo(
    () => orders.filter((order) => !['shipped', 'delivered', 'cancelled'].includes(order.fulfillmentStatus)),
    [orders]
  );

  const orderRevenue = useMemo(() => orders.reduce((sum, order) => sum + order.total, 0), [orders]);
  const capturedPayments = useMemo(
    () => orders.filter((order) => order.stripePaymentStatus === 'paid').reduce((sum, order) => sum + order.total, 0),
    [orders]
  );
  const queuedNotifications = useMemo(
    () => orders.filter((order) => order.notificationStatus === 'queued').length,
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
      setProducts((current) => current.map((item) => item.id === product.id ? response.product : item));
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
        notificationEmail: draft.notificationEmail.trim() || null,
        notificationStatus: draft.notificationStatus,
        stripePaymentStatus: draft.stripePaymentStatus.trim() || 'paid',
      });
      setOrders((current) => current.map((item) => item.id === order.id ? response.order : item));
      setOrderDrafts((current) => ({ ...current, [order.id]: buildOrderDraft(response.order) }));
      showSuccess('Store order updated');
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

      <section className="store-ops-metrics" aria-label="Store metrics">
        <article>
          <DollarSign size={21} />
          <span>Month Revenue</span>
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
          <Bell size={21} />
          <span>Queued Notices</span>
          <strong>{queuedNotifications}</strong>
        </article>
      </section>

      <nav className="store-ops-tabs" aria-label="Store operations sections">
        {([
          ['orders', 'Orders'],
          ['products', 'Products'],
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
                    <p>{orders.length} recent store orders</p>
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
                    <dd>{lowStockProducts.length > 0 ? `${lowStockProducts.length} reorder item${lowStockProducts.length === 1 ? '' : 's'}` : 'Inventory is healthy'}</dd>
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
                          <span>{order.shippingMethod} · {order.items?.map((item) => `${item.quantity}x ${item.productName}`).join(' · ') || 'No items'}</span>
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
                        <button type="button" onClick={() => handleSaveOrder(order)} disabled={saving}>
                          <Truck size={16} />
                          Update
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
                          <span>{formatCurrency(order.total)} · {order.paymentReference || 'No reference'}</span>
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
                          <span>{draft.notificationEmail || 'No email'} · {NOTIFICATION_LABELS[draft.notificationStatus]}</span>
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
