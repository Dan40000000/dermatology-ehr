import { PILOT_FOOTER_TEXT } from '../../config/pilot';

export function Footer() {
  return (
    <footer className="footer" role="contentinfo">
      <div className="footer-content">
        <div className="footer-logo" aria-label="DermEHR Electronic Health Record System">
          DermEHR
        </div>
        <div className="footer-version" aria-label="Application version information">
          {PILOT_FOOTER_TEXT}
        </div>
        <div className="footer-legal">
          <small>
            CPT©2025 American Medical Association. All rights reserved.
            Fee schedules, relative value units, conversion factors and/or related components are
            not assigned by the AMA, are not part of CPT, and the AMA is not recommending their use.
          </small>
        </div>
      </div>
    </footer>
  );
}
