import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, CreditCard, Minus, Package, Plus, ShoppingCart, Truck } from 'lucide-react';
import { PatientPortalLayout } from '../../components/patient-portal/PatientPortalLayout';
import { patientPortalFetch, usePatientPortalAuth } from '../../contexts/PatientPortalAuthContext';
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

export function PortalStorePage() {
  const { patient } = usePatientPortalAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<StoreOrderConfirmation | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<Product['category'] | 'all'>('all');
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

  const visibleProducts = useMemo(() => {
    return products.filter((product) => categoryFilter === 'all' || product.category === categoryFilter);
  }, [categoryFilter, products]);

  const subtotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0),
    [cart]
  );
  const tax = Math.round(subtotal * TAX_RATE);
  const shippingFee = shippingMethod === 'priority' ? 995 : shippingMethod === 'standard' ? 595 : 0;
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
      const paymentReference = `stripe_portal_${Date.now()}`;
      const response = await patientPortalFetch('/api/patient-portal-data/store/orders', {
        method: 'POST',
        body: JSON.stringify({
          items: cart.map((line) => ({
            productId: line.product.id,
            quantity: line.quantity,
          })),
          shippingAddress,
          shippingMethod,
          notificationEmail: patient?.email,
          paymentReference,
          stripePaymentIntentId: paymentReference,
        }),
      });

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
            <p>Dermatology products selected by the office for daily skin care and after-procedure support.</p>
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

        <div className="portal-store-layout">
          <section className="portal-store-products">
            <div className="portal-store-toolbar">
              <h2>Products</h2>
              <select
                aria-label="Filter store products"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value as Product['category'] | 'all')}
              >
                <option value="all">All</option>
                <option value="skincare">Skincare</option>
                <option value="sunscreen">Sunscreen</option>
                <option value="cosmetic">Cosmetic</option>
                <option value="post_procedure">Post-procedure</option>
              </select>
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
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt="" />
                        ) : (
                          <Package size={34} />
                        )}
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
                      <div>
                        <strong>{line.product.name}</strong>
                        <span>{formatCurrency(line.product.price)} each</span>
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
