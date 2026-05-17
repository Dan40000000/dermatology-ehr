import { Link, useLocation } from 'react-router-dom';
import { CreditCard, Package, ShieldCheck, Truck } from 'lucide-react';

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
    </main>
  );
}
