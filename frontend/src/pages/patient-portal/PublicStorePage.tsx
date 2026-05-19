import { Link, useLocation } from 'react-router-dom';
import { CreditCard, Package, ShieldCheck, Truck } from 'lucide-react';

const previewProducts = [
  {
    name: 'Tinted Mineral SPF 50',
    brand: 'DermShield',
    price: '$42',
    tag: 'Sunscreen',
    image: '/images/products/sunscreen-mineral-tube.jpg',
  },
  {
    name: 'Barrier Repair Cream',
    brand: 'CalmDerm',
    price: '$34',
    tag: 'Eczema support',
    image: '/images/products/cream-cerave-style.jpg',
  },
  {
    name: 'Vitamin C Brightening Serum',
    brand: 'Ava Clinical',
    price: '$68',
    tag: 'Cosmetic',
    image: '/images/products/serum-ampoules.jpg',
  },
  {
    name: 'Post-Procedure Recovery Kit',
    brand: 'Office Protocol',
    price: '$58',
    tag: 'Aftercare',
    image: '/images/products/first-aid-supplies.jpg',
  },
];

const storeHighlights = [
  'Curated dermatology products',
  'Portal checkout and receipts',
  'Shipping updates from the office',
  'Inventory controlled by the provider team',
];

export function PublicStorePage() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const tenantId = params.get('tenantId') || 'tenant-demo';
  const redirect = encodeURIComponent('/portal/store');

  return (
    <main className="public-store-page">
      <section className="public-store-hero">
        <div>
          <span>Dermatology Office Store</span>
          <h1>Skin care products from your dermatology office</h1>
          <p>Sign in to the portal to order active office products, pay through Stripe checkout, and receive shipping updates.</p>
          <div className="public-store-highlight-row" aria-label="Store highlights">
            {storeHighlights.map((highlight) => (
              <span key={highlight}>{highlight}</span>
            ))}
          </div>
          <div className="public-store-actions">
            <Link to={`/portal/login?tenantId=${encodeURIComponent(tenantId)}&redirect=${redirect}`}>
              Shop in Portal
            </Link>
            <Link to={`/portal/register?tenantId=${encodeURIComponent(tenantId)}&redirect=${redirect}`} className="secondary">
              Create Account
            </Link>
          </div>
        </div>
        <div className="public-store-panel" aria-label="Store workflow">
          <div><Package size={22} /><span>Catalog</span></div>
          <div><CreditCard size={22} /><span>Stripe Payment</span></div>
          <div><Truck size={22} /><span>Delivery</span></div>
          <div><ShieldCheck size={22} /><span>Portal Updates</span></div>
        </div>
      </section>

      <section className="public-store-preview" aria-label="Store product preview">
        <div className="public-store-preview__header">
          <div>
            <span>Catalog Preview</span>
            <h2>Products patients can recognize before they sign in</h2>
          </div>
          <Link to={`/portal/login?tenantId=${encodeURIComponent(tenantId)}&redirect=${redirect}`}>
            View Live Inventory
          </Link>
        </div>
        <div className="public-store-preview-grid">
          {previewProducts.map((product) => (
            <article key={product.name} className="public-store-product-card">
              <img src={product.image} alt="" />
              <div>
                <span>{product.tag}</span>
                <h3>{product.name}</h3>
                <p>{product.brand}</p>
              </div>
              <strong>{product.price}</strong>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
