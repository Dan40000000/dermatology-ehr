import { useEffect } from 'react';
import { Link } from 'react-router-dom';

export function BetaLandingPage() {
  // Clear portal session every time the landing page is visited
  useEffect(() => {
    localStorage.removeItem('patientPortalToken');
    localStorage.removeItem('patientPortalTenantId');
    localStorage.removeItem('patientPortalPatient');
    localStorage.removeItem('derm_session');
    window.dispatchEvent(new Event('derm_session_cleared'));
  }, []);

  return (
    <div className="lp-shell">
      {/* Rich background layers */}
      <div className="lp-bg-mesh" />
      <div className="lp-bg-glow lp-bg-glow--green" />
      <div className="lp-bg-glow lp-bg-glow--indigo" />
      <div className="lp-bg-glow lp-bg-glow--teal" />

      {/* Decorative rings */}
      <div className="lp-ring lp-ring-1" />
      <div className="lp-ring lp-ring-2" />
      <div className="lp-ring lp-ring-3" />

      {/* Floating orbs */}
      <div className="lp-orb lp-orb-a" />
      <div className="lp-orb lp-orb-b" />
      <div className="lp-orb lp-orb-c" />
      <div className="lp-orb lp-orb-d" />
      <div className="lp-orb lp-orb-e" />

      {/* Dot grid */}
      <div className="lp-dots" />

      {/* Grain */}
      <div className="lp-grain" />

      <main className="lp-main">
        {/* Beta pill */}
        <div className="lp-badge">
          <span className="lp-dot" />
          Beta Access
        </div>

        {/* Wordmark */}
        <div className="lp-wordmark">
          <h1 className="lp-title">Dermatology</h1>
          <div className="lp-divider">
            <span className="lp-divider-line" />
            <span className="lp-divider-diamond" />
            <span className="lp-divider-line" />
          </div>
          <span className="lp-subtitle">Demo&nbsp;&nbsp;Office</span>
        </div>

        {/* Destination cards */}
        <div className="lp-cards">
          {/* Patient Portal */}
          <Link to="/portal/login" className="lp-card lp-card--emerald">
            <div className="lp-card-bg" />
            <div className="lp-card-shimmer" />
            <div className="lp-card-inner">
              <div className="lp-card-icon lp-card-icon--emerald">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="7" r="4.2" stroke="currentColor" strokeWidth="1.6"/>
                  <path d="M4 21c0-4.42 3.58-8 8-8s8 3.58 8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="lp-card-body">
                <span className="lp-card-label">Patient Portal</span>
                <span className="lp-card-desc">Appointments, records &amp; messages</span>
              </div>
              <div className="lp-card-cta lp-card-cta--emerald">
                Enter
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
            {/* Accent bar */}
            <div className="lp-card-accent lp-card-accent--emerald" />
          </Link>

          {/* Provider Login */}
          <Link to="/login?fresh=1" className="lp-card lp-card--indigo">
            <div className="lp-card-bg" />
            <div className="lp-card-shimmer" />
            <div className="lp-card-inner">
              <div className="lp-card-icon lp-card-icon--indigo">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                  <rect x="2.5" y="3.5" width="19" height="17" rx="3" stroke="currentColor" strokeWidth="1.6"/>
                  <path d="M7 8.5h10M7 12h10M7 15.5h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="lp-card-body">
                <span className="lp-card-label">Provider Login</span>
                <span className="lp-card-desc">Clinical staff &amp; practice management</span>
              </div>
              <div className="lp-card-cta lp-card-cta--indigo">
                Enter
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
            <div className="lp-card-accent lp-card-accent--indigo" />
          </Link>

        </div>

        <p className="lp-footer">Beta v0.1 &nbsp;·&nbsp; Authorized testers only &nbsp;·&nbsp; Not for clinical use</p>
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@300;400;500;600&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .lp-shell {
          min-height: 100vh;
          background: #e8f5ee;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 48px 24px;
          position: relative;
          overflow: hidden;
          font-family: 'DM Sans', system-ui, sans-serif;
        }

        /* ── Gradient mesh base ── */
        .lp-bg-mesh {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 120% 80% at 0% 0%,   #c8f5e0 0%, transparent 55%),
            radial-gradient(ellipse 100% 70% at 100% 100%, #ddd6fe 0%, transparent 55%),
            radial-gradient(ellipse 80%  80% at 55%  45%,  #f0fdf9 0%, transparent 60%),
            linear-gradient(160deg, #e6f7ef 0%, #ede9fe 100%);
        }

        /* ── Color glows ── */
        .lp-bg-glow {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          filter: blur(100px);
          animation: float-slow 20s ease-in-out infinite;
        }

        .lp-bg-glow--green {
          width: 700px; height: 700px;
          background: rgba(16, 185, 129, 0.28);
          top: -200px; left: -200px;
        }

        .lp-bg-glow--indigo {
          width: 600px; height: 600px;
          background: rgba(99, 102, 241, 0.22);
          bottom: -180px; right: -180px;
          animation-direction: reverse;
          animation-duration: 24s;
        }

        .lp-bg-glow--teal {
          width: 400px; height: 400px;
          background: rgba(20, 184, 166, 0.15);
          top: 50%; left: 55%;
          transform: translate(-50%, -50%);
          animation-duration: 18s;
          animation-delay: 4s;
        }

        @keyframes float-slow {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%       { transform: translate(30px, -24px) scale(1.06); }
          66%       { transform: translate(-20px, 18px) scale(0.95); }
        }

        /* ── Decorative rings ── */
        .lp-ring {
          position: absolute;
          border-radius: 50%;
          border: 1px solid rgba(16, 185, 129, 0.15);
          pointer-events: none;
          animation: spin-ring 60s linear infinite;
        }

        .lp-ring-1 {
          width: 900px; height: 900px;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          border-color: rgba(16, 185, 129, 0.1);
        }

        .lp-ring-2 {
          width: 660px; height: 660px;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          border-color: rgba(99, 102, 241, 0.1);
          animation-direction: reverse;
          animation-duration: 45s;
        }

        .lp-ring-3 {
          width: 420px; height: 420px;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          border-color: rgba(16, 185, 129, 0.08);
          border-style: dashed;
          animation-duration: 80s;
        }

        @keyframes spin-ring {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to   { transform: translate(-50%, -50%) rotate(360deg); }
        }

        /* ── Floating orbs ── */
        .lp-orb {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          filter: blur(0px);
          animation: bob 8s ease-in-out infinite;
        }

        .lp-orb-a {
          width: 14px; height: 14px;
          background: #10b981;
          opacity: 0.7;
          top: 22%; left: 14%;
          animation-delay: 0s;
        }

        .lp-orb-b {
          width: 8px; height: 8px;
          background: #6366f1;
          opacity: 0.6;
          top: 18%; right: 18%;
          animation-delay: 1.5s;
        }

        .lp-orb-c {
          width: 18px; height: 18px;
          background: radial-gradient(circle, #34d399, #10b981);
          opacity: 0.5;
          bottom: 28%; left: 10%;
          animation-delay: 3s;
        }

        .lp-orb-d {
          width: 10px; height: 10px;
          background: #818cf8;
          opacity: 0.55;
          bottom: 20%; right: 15%;
          animation-delay: 2s;
        }

        .lp-orb-e {
          width: 6px; height: 6px;
          background: #059669;
          opacity: 0.8;
          top: 60%; right: 12%;
          animation-delay: 4.5s;
        }

        @keyframes bob {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-14px); }
        }

        /* ── Dot grid ── */
        .lp-dots {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background-image: radial-gradient(circle, rgba(5, 150, 105, 0.2) 1px, transparent 1px);
          background-size: 36px 36px;
          mask-image: radial-gradient(ellipse 75% 75% at 50% 50%, black 30%, transparent 100%);
        }

        /* ── Grain ── */
        .lp-grain {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.04;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-size: 180px 180px;
        }

        /* ── Main ── */
        .lp-main {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100%;
          max-width: 640px;
        }

        /* ── Badge ── */
        .lp-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 18px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.7);
          border: 1px solid rgba(16, 185, 129, 0.35);
          backdrop-filter: blur(12px);
          font-size: 0.65rem;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #065f46;
          margin-bottom: 44px;
          box-shadow: 0 2px 12px rgba(16, 185, 129, 0.12);
          opacity: 0;
          animation: rise 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.05s forwards;
        }

        .lp-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #10b981;
          flex-shrink: 0;
          animation: pulse-dot 2.4s ease-in-out infinite;
        }

        @keyframes pulse-dot {
          0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6); }
          50%       { box-shadow: 0 0 0 5px rgba(16, 185, 129, 0); }
        }

        /* ── Wordmark ── */
        .lp-wordmark {
          text-align: center;
          margin-bottom: 52px;
          opacity: 0;
          animation: rise 0.65s cubic-bezier(0.16, 1, 0.3, 1) 0.14s forwards;
        }

        .lp-title {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: clamp(3.4rem, 10vw, 6rem);
          font-weight: 700;
          letter-spacing: -0.025em;
          line-height: 1;
          color: #064e3b;
          text-shadow: 0 2px 40px rgba(16, 185, 129, 0.2);
          position: relative;
        }

        /* Decorative divider */
        .lp-divider {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          margin: 12px 0 10px;
        }

        .lp-divider-line {
          flex: 1;
          max-width: 80px;
          height: 1px;
          background: linear-gradient(to right, transparent, rgba(5, 150, 105, 0.4));
        }

        .lp-divider-line:last-child {
          background: linear-gradient(to left, transparent, rgba(5, 150, 105, 0.4));
        }

        .lp-divider-diamond {
          width: 6px; height: 6px;
          background: #10b981;
          transform: rotate(45deg);
          flex-shrink: 0;
          opacity: 0.7;
        }

        .lp-subtitle {
          display: block;
          font-family: 'DM Sans', system-ui, sans-serif;
          font-size: clamp(0.8rem, 2.5vw, 1.1rem);
          font-weight: 400;
          letter-spacing: 0.38em;
          text-transform: uppercase;
          color: #6b7280;
        }

        /* ── Cards ── */
        .lp-cards {
          display: flex;
          flex-direction: column;
          gap: 14px;
          width: 100%;
          opacity: 0;
          animation: rise 0.65s cubic-bezier(0.16, 1, 0.3, 1) 0.26s forwards;
        }

        .lp-card {
          position: relative;
          display: block;
          text-decoration: none;
          border-radius: 20px;
          overflow: hidden;
          border: 1.5px solid transparent;
          backdrop-filter: blur(20px);
          transition:
            transform 0.28s cubic-bezier(0.16, 1, 0.3, 1),
            box-shadow 0.28s ease,
            border-color 0.28s ease;
        }

        .lp-card--emerald {
          border-color: rgba(255, 255, 255, 0.8);
          box-shadow:
            0 2px 8px rgba(0, 0, 0, 0.06),
            0 8px 30px rgba(16, 185, 129, 0.12),
            inset 0 1px 0 rgba(255, 255, 255, 0.9);
        }

        .lp-card--emerald:hover {
          transform: translateY(-6px) scale(1.015);
          border-color: rgba(16, 185, 129, 0.5);
          box-shadow:
            0 4px 12px rgba(0, 0, 0, 0.06),
            0 20px 60px rgba(16, 185, 129, 0.25),
            0 0 0 1px rgba(16, 185, 129, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.9);
        }

        .lp-card--indigo {
          border-color: rgba(255, 255, 255, 0.8);
          box-shadow:
            0 2px 8px rgba(0, 0, 0, 0.06),
            0 8px 30px rgba(99, 102, 241, 0.12),
            inset 0 1px 0 rgba(255, 255, 255, 0.9);
        }

        .lp-card--indigo:hover {
          transform: translateY(-6px) scale(1.015);
          border-color: rgba(99, 102, 241, 0.5);
          box-shadow:
            0 4px 12px rgba(0, 0, 0, 0.06),
            0 20px 60px rgba(99, 102, 241, 0.25),
            0 0 0 1px rgba(99, 102, 241, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.9);
        }

        /* Card background tint */
        .lp-card-bg {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .lp-card--emerald .lp-card-bg {
          background: linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(240,253,250,0.88) 100%);
        }

        .lp-card--indigo .lp-card-bg {
          background: linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(238,242,255,0.88) 100%);
        }

        /* Shimmer on hover */
        .lp-card-shimmer {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .lp-card--emerald .lp-card-shimmer {
          background: radial-gradient(ellipse 80% 120% at 0% 50%, rgba(16, 185, 129, 0.1), transparent);
        }

        .lp-card--indigo .lp-card-shimmer {
          background: radial-gradient(ellipse 80% 120% at 0% 50%, rgba(99, 102, 241, 0.1), transparent);
        }

        .lp-card:hover .lp-card-shimmer { opacity: 1; }

        /* Accent bar at top */
        .lp-card-accent {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          border-radius: 20px 20px 0 0;
          transform: scaleX(0);
          transform-origin: left;
          transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .lp-card-accent--emerald {
          background: linear-gradient(90deg, #059669, #34d399, #10b981);
        }

        .lp-card-accent--indigo {
          background: linear-gradient(90deg, #4f46e5, #818cf8, #6366f1);
        }

        .lp-card:hover .lp-card-accent { transform: scaleX(1); }

        /* Card inner */
        .lp-card-inner {
          position: relative;
          display: flex;
          align-items: center;
          gap: 22px;
          padding: 28px 28px;
        }

        /* Icon */
        .lp-card-icon {
          width: 62px; height: 62px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s ease;
        }

        .lp-card:hover .lp-card-icon {
          transform: scale(1.08) rotate(-2deg);
        }

        .lp-card-icon--emerald {
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.18), rgba(52, 211, 153, 0.12));
          color: #059669;
          box-shadow: 0 4px 14px rgba(16, 185, 129, 0.18), inset 0 1px 0 rgba(255,255,255,0.6);
        }

        .lp-card-icon--indigo {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.18), rgba(139, 92, 246, 0.12));
          color: #4f46e5;
          box-shadow: 0 4px 14px rgba(99, 102, 241, 0.18), inset 0 1px 0 rgba(255,255,255,0.6);
        }

        /* Text */
        .lp-card-body {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .lp-card-label {
          font-size: 1.2rem;
          font-weight: 600;
          color: #111827;
          letter-spacing: -0.015em;
        }

        .lp-card-desc {
          font-size: 0.83rem;
          font-weight: 400;
          color: #9ca3af;
          letter-spacing: 0.005em;
        }

        /* CTA button */
        .lp-card-cta {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 18px;
          border-radius: 10px;
          font-size: 0.82rem;
          font-weight: 600;
          letter-spacing: 0.03em;
          flex-shrink: 0;
          transition: transform 0.22s ease, gap 0.22s ease;
        }

        .lp-card:hover .lp-card-cta { gap: 10px; }

        .lp-card-cta--emerald {
          background: rgba(16, 185, 129, 0.1);
          color: #059669;
        }

        .lp-card--emerald:hover .lp-card-cta--emerald {
          background: rgba(16, 185, 129, 0.16);
        }

        .lp-card-cta--indigo {
          background: rgba(99, 102, 241, 0.1);
          color: #4f46e5;
        }

        .lp-card--indigo:hover .lp-card-cta--indigo {
          background: rgba(99, 102, 241, 0.16);
        }

        /* ── Footer ── */
        .lp-footer {
          margin-top: 44px;
          font-size: 0.68rem;
          font-weight: 400;
          color: rgba(6, 78, 59, 0.35);
          letter-spacing: 0.07em;
          text-align: center;
          opacity: 0;
          animation: rise 0.65s cubic-bezier(0.16, 1, 0.3, 1) 0.4s forwards;
        }

        /* ── Entrance ── */
        @keyframes rise {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ── Mobile ── */
        @media (max-width: 480px) {
          .lp-card-inner { padding: 22px 20px; gap: 16px; }
          .lp-card-icon  { width: 52px; height: 52px; border-radius: 13px; }
          .lp-card-cta   { display: none; }
          .lp-card-label { font-size: 1.05rem; }
          .lp-ring       { display: none; }
        }
      `}</style>
    </div>
  );
}
