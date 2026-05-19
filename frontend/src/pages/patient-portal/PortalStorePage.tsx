import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle, CreditCard, Minus, Package, Plus, Search, ShoppingCart, Truck } from 'lucide-react';
import { PatientPortalLayout } from '../../components/patient-portal/PatientPortalLayout';
import { patientPortalFetch, usePatientPortalAuth } from '../../contexts/PatientPortalAuthContext';
import { getProductImageUrl } from '../../utils/productImages';
import type { Product, StoreShippingAddress } from '../../types';

interface CartLine {
  product: Product;
  quantity: number;
}

interface StoreOrderConfirmation {
  id: string;
  total: number;
  fulfillmentStatus?: string;
  trackingNumber?: string;
}

const TAX_RATE = 0.0825;
const FEATURED_SKUS = ['SPF-TINT-50', 'CRM-BARRIER', 'POST-LASER-KIT', 'SER-VITC-15'];
const CONCERN_FILTERS = [
  { value: 'all', label: 'All routines', keywords: [] },
  { value: 'acne', label: 'Acne', keywords: ['acne', 'pores', 'benzoyl', 'salicylic', 'adapalene', 'blemish'] },
  { value: 'sun', label: 'Sun protection', keywords: ['spf', 'sunscreen', 'sun', 'mineral', 'melasma'] },
  { value: 'sensitive', label: 'Sensitive skin', keywords: ['sensitive', 'eczema', 'barrier', 'gentle', 'irritated', 'reactive'] },
  { value: 'procedure', label: 'After procedures', keywords: ['post', 'procedure', 'wound', 'scar', 'laser', 'peel', 'biopsy'] },
  { value: 'anti-aging', label: 'Anti-aging', keywords: ['retinol', 'retinal', 'vitamin c', 'peptide', 'firming', 'growth'] },
] as const;

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format((Number(cents) || 0) / 100);
}

function categoryLabel(value: string): string {
  if (value === 'post_procedure') return 'Post-procedure';
  if (value === 'sunscreen') return 'Sunscreen';
  if (value === 'cosmetic') return 'Cosmetic';
  if (value === 'skincare') return 'Skincare';
  return value;
}

function productSearchText(product: Product): string {
  return [
    product.name,
    product.brand,
    product.sku,
    product.description,
    categoryLabel(product.category),
  ].filter(Boolean).join(' ').toLowerCase();
}

export function PortalStorePage() {
  const { patient } = usePatientPortalAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<StoreOrderConfirmation | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<Product['category'] | 'all'>('all');
  const [concernFilter, setConcernFilter] = useState<(typeof CONCERN_FILTERS)[number]['value']>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [shippingMethod, setShippingMethod] = useState<'standard' | 'priority' | 'pickup'>('standard');
  const [shippingAddress, setShippingAddress] = useState<StoreShippingAddress>({
    name: `${patient?.firstName || ''} ${patient?.lastName || ''}`.trim(),
    street: '',
    city: '',
    state: '',
    zip: '',
    phone: '',
  });

  useEffect(() => {
    setShippingAddress((current) => ({
      ...current,
      name: current.name || `${patient?.firstName || ''} ${patient?.lastName || ''}`.trim(),
    }));
  }, [patient?.firstName, patient?.lastName]);

  useEffect(() => {
    let cancelled = false;

    const loadProducts = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await patientPortalFetch('/api/patient-portal-data/store/products');
        if (!cancelled) {
          setProducts((data.products || []).filter((product: Product) => product.category !== 'prescription'));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load store products');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadProducts();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    const checkoutStatus = searchParams.get('store_checkout');
    if (checkoutStatus === 'cancelled') {
      setError('Checkout was cancelled. No payment was captured.');
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('session_id');
      nextParams.delete('store_checkout');
      nextParams.delete('orderId');
      setSearchParams(nextParams, { replace: true });
      return;
    }

    if (!sessionId || checkoutStatus !== 'success') return;

    let cancelled = false;
    const syncCheckout = async () => {
      try {
        setPlacingOrder(true);
        setError(null);
        const response = await patientPortalFetch(`/api/patient-portal-data/store/checkout-session/${encodeURIComponent(sessionId)}/sync`, {
          method: 'POST',
        });
        const order = response.order;
        if (!cancelled && order) {
          setConfirmation({
            id: order.id,
            total: order.total || 0,
            fulfillmentStatus: order.fulfillmentStatus,
            trackingNumber: order.trackingNumber,
          });
          const refreshed = await patientPortalFetch('/api/patient-portal-data/store/products');
          if (!cancelled) {
            setProducts((refreshed.products || []).filter((product: Product) => product.category !== 'prescription'));
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Payment was received, but order sync needs review.');
        }
      } finally {
        if (!cancelled) {
          setPlacingOrder(false);
          const nextParams = new URLSearchParams(searchParams);
          nextParams.delete('session_id');
          nextParams.delete('store_checkout');
          nextParams.delete('orderId');
          setSearchParams(nextParams, { replace: true });
        }
      }
    };

    void syncCheckout();
    return () => {
      cancelled = true;
    };
  }, [searchParams, setSearchParams]);

  const visibleProducts = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const concern = CONCERN_FILTERS.find((filter) => filter.value === concernFilter);

    return products.filter((product) => {
      const searchText = productSearchText(product);
      const matchesCategory = categoryFilter === 'all' || product.category === categoryFilter;
      const matchesSearch = !normalizedSearch || searchText.includes(normalizedSearch);
      const matchesConcern = !concern || concern.value === 'all' || concern.keywords.some((keyword) => searchText.includes(keyword));
      return matchesCategory && matchesSearch && matchesConcern;
    });
  }, [categoryFilter, concernFilter, products, searchQuery]);

  const categoryCounts = useMemo(() => {
    return products.reduce<Record<string, number>>((counts, product) => {
      counts[product.category] = (counts[product.category] || 0) + 1;
      return counts;
    }, {});
  }, [products]);

  const featuredProducts = useMemo(() => {
    const bySku = new Map(products.map((product) => [product.sku, product]));
    return FEATURED_SKUS.map((sku) => bySku.get(sku)).filter(Boolean) as Product[];
  }, [products]);

  const subtotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0),
    [cart]
  );
  const tax = Math.round(subtotal * TAX_RATE);
  const shippingFee = cart.length > 0 ? (shippingMethod === 'priority' ? 995 : shippingMethod === 'standard' ? 595 : 0) : 0;
  const total = subtotal + tax + shippingFee;
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  const addToCart = (product: Product) => {
    setConfirmation(null);
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing) {
        return current.map((line) =>
          line.product.id === product.id
            ? { ...line, quantity: Math.min(line.quantity + 1, product.inventoryCount) }
            : line
        );
      }
      return [...current, { product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: string, quantity: number) => {
    setCart((current) => current
      .map((line) =>
        line.product.id === productId
          ? { ...line, quantity: Math.max(0, Math.min(quantity, line.product.inventoryCount)) }
          : line
      )
      .filter((line) => line.quantity > 0));
  };

  const validateShipping = () => {
    if (shippingMethod === 'pickup') return true;
    return Boolean(
      shippingAddress.name.trim() &&
      shippingAddress.street.trim() &&
      shippingAddress.city.trim() &&
      shippingAddress.state.trim().length === 2 &&
      shippingAddress.zip.trim()
    );
  };

  const placeOrder = async () => {
    if (cart.length === 0 || placingOrder) return;
    if (!validateShipping()) {
      setError('Complete the delivery address before placing the order.');
      return;
    }

    try {
      setPlacingOrder(true);
      setError(null);
      const response = await patientPortalFetch('/api/patient-portal-data/store/checkout-session', {
        method: 'POST',
        body: JSON.stringify({
          items: cart.map((line) => ({
            productId: line.product.id,
            quantity: line.quantity,
          })),
          shippingAddress,
          shippingMethod,
          notificationEmail: patient?.email,
        }),
      });

      if (response.checkout?.url) {
        window.location.assign(response.checkout.url);
        return;
      }

      const order = response.order || response.sale;
      setConfirmation({
        id: order.id,
        total: order.total || total,
        fulfillmentStatus: order.fulfillmentStatus,
        trackingNumber: order.trackingNumber,
      });
      setCart([]);
      const refreshed = await patientPortalFetch('/api/patient-portal-data/store/products');
      setProducts((refreshed.products || []).filter((product: Product) => product.category !== 'prescription'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place order');
    } finally {
      setPlacingOrder(false);
    }
  };

  return (
    <PatientPortalLayout>
      <div className="portal-store-page">
        <header className="portal-store-header">
          <div>
            <span>Skin Care Store</span>
            <h1>Office Store</h1>
            <p>Dermatology products selected by the office for daily skin care, sun protection, acne support, cosmetic routines, and after-procedure recovery.</p>
            <div className="portal-store-header-stats" aria-label="Store catalog summary">
              <span>{products.length || 50} curated products</span>
              <span>{categoryCounts.sunscreen || 0} sunscreens</span>
              <span>{categoryCounts.post_procedure || 0} recovery items</span>
            </div>
          </div>
          <div className="portal-store-cart-pill">
            <ShoppingCart size={18} />
            <strong>{cartCount}</strong>
            <span>{formatCurrency(total)}</span>
          </div>
        </header>

        {confirmation && (
          <div className="portal-store-confirmation" role="status">
            <CheckCircle size={22} />
            <div>
              <strong>Order placed</strong>
              <span>#{confirmation.id.slice(0, 8)} · {formatCurrency(confirmation.total)}</span>
            </div>
          </div>
        )}

        {error && (
          <div className="portal-store-error" role="alert">
            {error}
          </div>
        )}

        {!loading && featuredProducts.length > 0 && (
          <section className="portal-store-featured" aria-label="Featured dermatology store products">
            {featuredProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => {
                  setSearchQuery(product.name);
                  setCategoryFilter('all');
                  setConcernFilter('all');
                }}
              >
                <img src={getProductImageUrl(product)} alt="" />
                <span>{categoryLabel(product.category)}</span>
                <strong>{product.name}</strong>
                <small>{formatCurrency(product.price)}</small>
              </button>
            ))}
          </section>
        )}

        <div className="portal-store-layout">
          <section className="portal-store-products">
            <div className="portal-store-toolbar">
              <div>
                <h2>Products</h2>
                <p>{visibleProducts.length} matching item{visibleProducts.length === 1 ? '' : 's'}</p>
              </div>
              <div className="portal-store-filterbar">
                <label className="portal-store-search">
                  <Search size={16} />
                  <span className="sr-only">Search store products</span>
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search products, brands, routines"
                  />
                </label>
                <select
                  aria-label="Filter store products by category"
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value as Product['category'] | 'all')}
                >
                  <option value="all">All categories</option>
                  <option value="skincare">Skincare ({categoryCounts.skincare || 0})</option>
                  <option value="sunscreen">Sunscreen ({categoryCounts.sunscreen || 0})</option>
                  <option value="cosmetic">Cosmetic ({categoryCounts.cosmetic || 0})</option>
                  <option value="post_procedure">Post-procedure ({categoryCounts.post_procedure || 0})</option>
                </select>
              </div>
            </div>

            <div className="portal-store-concerns" aria-label="Filter store products by skin concern">
              {CONCERN_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  className={concernFilter === filter.value ? 'active' : ''}
                  onClick={() => setConcernFilter(filter.value)}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="portal-store-loading">Loading store...</div>
            ) : visibleProducts.length === 0 ? (
              <div className="portal-store-empty">No products are available right now.</div>
            ) : (
              <div className="portal-store-product-grid">
                {visibleProducts.map((product) => {
                  const isOut = product.inventoryCount <= 0;
                  const isLow = product.inventoryCount > 0 && product.inventoryCount <= product.reorderPoint;
                  return (
                    <article key={product.id} className="portal-store-product">
                      <div className="portal-store-product-media">
                        <img src={getProductImageUrl(product)} alt="" />
                      </div>
                      <div className="portal-store-product-copy">
                        <span>{categoryLabel(product.category)}</span>
                        <h3>{product.name}</h3>
                        {product.brand && <p className="brand">{product.brand}</p>}
                        {product.description && <p>{product.description}</p>}
                      </div>
                      <div className="portal-store-product-footer">
                        <div>
                          <strong>{formatCurrency(product.price)}</strong>
                          <span className={isOut ? 'out' : isLow ? 'low' : ''}>
                            {isOut ? 'Out of stock' : isLow ? 'Low stock' : 'In stock'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => addToCart(product)}
                          disabled={isOut}
                          aria-label={`Add ${product.name} to cart`}
                        >
                          <Plus size={16} />
                          Add
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="portal-store-checkout">
            <div className="portal-store-panel">
              <h2>Cart</h2>
              {cart.length === 0 ? (
                <p className="portal-store-muted">No items in cart.</p>
              ) : (
                <div className="portal-store-cart-lines">
                  {cart.map((line) => (
                    <div key={line.product.id} className="portal-store-cart-line">
                      <div className="portal-store-cart-product">
                        <img src={getProductImageUrl(line.product)} alt="" />
                        <div>
                          <strong>{line.product.name}</strong>
                          <span>{formatCurrency(line.product.price)} each</span>
                        </div>
                      </div>
                      <div className="portal-store-qty">
                        <button
                          type="button"
                          onClick={() => updateQuantity(line.product.id, line.quantity - 1)}
                          aria-label={`Decrease ${line.product.name}`}
                        >
                          <Minus size={14} />
                        </button>
                        <span>{line.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(line.product.id, line.quantity + 1)}
                          disabled={line.quantity >= line.product.inventoryCount}
                          aria-label={`Increase ${line.product.name}`}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="portal-store-panel">
              <h2>Delivery</h2>
              <div className="portal-store-shipping-methods">
                {([
                  ['standard', 'Standard', Truck],
                  ['priority', 'Priority', Truck],
                  ['pickup', 'Pickup', Package],
                ] as const).map(([value, label, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    className={shippingMethod === value ? 'active' : ''}
                    onClick={() => setShippingMethod(value)}
                  >
                    <Icon size={16} />
                    {label}
                  </button>
                ))}
              </div>
              <div className="portal-store-address">
                <label>
                  Name
                  <input value={shippingAddress.name} onChange={(event) => setShippingAddress((current) => ({ ...current, name: event.target.value }))} />
                </label>
                <label>
                  Street
                  <input value={shippingAddress.street} onChange={(event) => setShippingAddress((current) => ({ ...current, street: event.target.value }))} />
                </label>
                <div>
                  <label>
                    City
                    <input value={shippingAddress.city} onChange={(event) => setShippingAddress((current) => ({ ...current, city: event.target.value }))} />
                  </label>
                  <label>
                    State
                    <input maxLength={2} value={shippingAddress.state} onChange={(event) => setShippingAddress((current) => ({ ...current, state: event.target.value.toUpperCase() }))} />
                  </label>
                  <label>
                    ZIP
                    <input value={shippingAddress.zip} onChange={(event) => setShippingAddress((current) => ({ ...current, zip: event.target.value }))} />
                  </label>
                </div>
                <label>
                  Phone
                  <input value={shippingAddress.phone || ''} onChange={(event) => setShippingAddress((current) => ({ ...current, phone: event.target.value }))} />
                </label>
              </div>
            </div>

            <div className="portal-store-panel">
              <h2>Payment</h2>
              <div className="portal-store-payment-card">
                <CreditCard size={20} />
                <div>
                  <strong>Stripe checkout</strong>
                  <span>Secure payment token is attached to the order.</span>
                </div>
              </div>
              <div className="portal-store-summary">
                <div><span>Subtotal</span><strong>{formatCurrency(subtotal)}</strong></div>
                <div><span>Tax</span><strong>{formatCurrency(tax)}</strong></div>
                <div><span>Delivery</span><strong>{formatCurrency(shippingFee)}</strong></div>
                <div className="total"><span>Total</span><strong>{formatCurrency(total)}</strong></div>
              </div>
              <button
                type="button"
                className="portal-store-place-order"
                onClick={placeOrder}
                disabled={cart.length === 0 || placingOrder}
              >
                {placingOrder ? 'Placing Order...' : `Place Order ${formatCurrency(total)}`}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </PatientPortalLayout>
  );
}
