/**
 * Demo Mode Bar Component
 * Banner at top of screen when in demo mode with quick access to tutorials
 */

import React, { useState } from 'react';
import { useWalkthrough } from './WalkthroughProvider';
import { walkthroughs } from './walkthroughs';
import './DemoModeBar.css';

export const DemoModeBar: React.FC = () => {
  const { isDemoMode, setDemoMode, startWalkthrough, resetProgress } = useWalkthrough();
  const [showTutorialMenu, setShowTutorialMenu] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  if (!isDemoMode) return null;

  const handleResetDemo = () => {
    resetProgress();
    setShowResetConfirm(false);
    // Could also reset demo data here if needed
  };

  const handleStartTutorial = (walkthroughId: string) => {
    startWalkthrough(walkthroughId);
    setShowTutorialMenu(false);
  };

  return (
    <>
      <div className="demo-mode-bar">
        <div className="demo-mode-bar-content">
          <div className="demo-mode-bar-left">
            <div className="demo-mode-badge">
              <span className="demo-mode-icon">🎓</span>
              <span className="demo-mode-text">Demo Mode</span>
            </div>
            <span className="demo-mode-message">
              You're in demo mode - explore and learn without affecting real data
            </span>
          </div>

          <div className="demo-mode-bar-right">
            <div className="demo-mode-menu-wrapper">
              <button
                className="demo-mode-btn demo-mode-btn-primary"
                onClick={() => setShowTutorialMenu(!showTutorialMenu)}
              >
                📚 Tutorials
              </button>

              {showTutorialMenu && (
                <>
                  <div
                    className="demo-mode-menu-overlay"
                    onClick={() => setShowTutorialMenu(false)}
                  />
                  <div className="demo-mode-tutorial-menu">
                    <div className="demo-mode-menu-header">
                      <h3>Available Tutorials</h3>
                      <button
                        className="demo-mode-menu-close"
                        onClick={() => setShowTutorialMenu(false)}
                      >
                        ✕
                      </button>
                    </div>
                    <div className="demo-mode-menu-content">
                      {walkthroughs.map(walkthrough => (
                        <button
                          key={walkthrough.id}
                          className="demo-mode-tutorial-item"
                          onClick={() => handleStartTutorial(walkthrough.id)}
                        >
                          <div className="demo-mode-tutorial-icon">
                            {walkthrough.icon || '📖'}
                          </div>
                          <div className="demo-mode-tutorial-info">
                            <div className="demo-mode-tutorial-title">
                              {walkthrough.title}
                            </div>
                            <div className="demo-mode-tutorial-meta">
                              {walkthrough.estimatedMinutes} min • {walkthrough.difficulty}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            <button
              className="demo-mode-btn demo-mode-btn-secondary"
              onClick={() => setShowResetConfirm(true)}
            >
              🔄 Reset
            </button>

            <button
              className="demo-mode-btn demo-mode-btn-exit"
              onClick={() => setDemoMode(false)}
            >
              Exit Demo Mode
            </button>
          </div>
        </div>
      </div>

      {showResetConfirm && (
        <div className="demo-mode-modal-overlay">
          <div className="demo-mode-modal">
            <div className="demo-mode-modal-header">
              <h3>Reset Demo Data?</h3>
            </div>
            <div className="demo-mode-modal-content">
              <p>
                This will reset all tutorial progress and demo data. Your actual practice
                data will not be affected.
              </p>
            </div>
            <div className="demo-mode-modal-footer">
              <button
                className="demo-mode-btn demo-mode-btn-secondary"
                onClick={() => setShowResetConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="demo-mode-btn demo-mode-btn-danger"
                onClick={handleResetDemo}
              >
                Reset Demo
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
