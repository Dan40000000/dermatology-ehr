/**
 * Walkthrough Modal Component
 * Shows introduction and completion modals for tutorials
 */

import React from 'react';
import { Walkthrough } from './types';
import './Walkthrough.css';

interface IntroModalProps {
  walkthrough: Walkthrough;
  onStart: () => void;
  onCancel: () => void;
}

export const WalkthroughIntroModal: React.FC<IntroModalProps> = ({
  walkthrough,
  onStart,
  onCancel,
}) => {
  const difficultyColors = {
    beginner: '#10b981',
    intermediate: '#f59e0b',
    advanced: '#ef4444',
  };

  return (
    <div className="walkthrough-modal-overlay">
      <div className="walkthrough-modal">
        <div className="walkthrough-modal-header">
          <h2>{walkthrough.icon || '🎓'} {walkthrough.title}</h2>
        </div>

        <div className="walkthrough-modal-content">
          <p className="walkthrough-modal-description">{walkthrough.description}</p>

          <div className="walkthrough-modal-meta">
            <div className="walkthrough-meta-item">
              <span className="walkthrough-meta-label">Duration:</span>
              <span className="walkthrough-meta-value">~{walkthrough.estimatedMinutes} minutes</span>
            </div>

            <div className="walkthrough-meta-item">
              <span className="walkthrough-meta-label">Difficulty:</span>
              <span
                className="walkthrough-meta-value walkthrough-difficulty-badge"
                style={{ backgroundColor: difficultyColors[walkthrough.difficulty] }}
              >
                {walkthrough.difficulty.charAt(0).toUpperCase() + walkthrough.difficulty.slice(1)}
              </span>
            </div>

            <div className="walkthrough-meta-item">
              <span className="walkthrough-meta-label">Steps:</span>
              <span className="walkthrough-meta-value">{walkthrough.steps.length}</span>
            </div>
          </div>

          {walkthrough.prerequisites && walkthrough.prerequisites.length > 0 && (
            <div className="walkthrough-prerequisites">
              <h4>Prerequisites:</h4>
              <p>Complete these tutorials first:</p>
              <ul>
                {walkthrough.prerequisites.map(prereq => (
                  <li key={prereq}>{prereq}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="walkthrough-tips">
            <h4>💡 Tips:</h4>
            <ul>
              <li>Follow the highlighted areas on screen</li>
              <li>You can pause and resume anytime</li>
              <li>Use the Back button if you need to review</li>
              <li>Press ESC or click outside to exit</li>
            </ul>
          </div>
        </div>

        <div className="walkthrough-modal-footer">
          <button
            className="walkthrough-btn walkthrough-btn-secondary"
            onClick={onCancel}
          >
            Not Now
          </button>
          <button
            className="walkthrough-btn walkthrough-btn-primary"
            onClick={onStart}
          >
            Start Tutorial
          </button>
        </div>
      </div>
    </div>
  );
};

interface CompletionModalProps {
  walkthrough: Walkthrough;
  timeSpent?: number;
  onClose: () => void;
  onRestart?: () => void;
}

export const WalkthroughCompletionModal: React.FC<CompletionModalProps> = ({
  walkthrough,
  timeSpent,
  onClose,
  onRestart,
}) => {
  return (
    <div className="walkthrough-modal-overlay">
      <div className="walkthrough-modal walkthrough-modal-celebration">
        <div className="walkthrough-celebration-animation">
          <div className="walkthrough-confetti">🎉</div>
          <div className="walkthrough-confetti">🎊</div>
          <div className="walkthrough-confetti">⭐</div>
          <div className="walkthrough-confetti">✨</div>
          <div className="walkthrough-confetti">🌟</div>
        </div>

        <div className="walkthrough-modal-header">
          <h2>🎉 Congratulations!</h2>
        </div>

        <div className="walkthrough-modal-content">
          <p className="walkthrough-completion-message">
            You've successfully completed <strong>{walkthrough.title}</strong>!
          </p>

          {timeSpent && (
            <p className="walkthrough-time-spent">
              Completed in {Math.ceil(timeSpent / 60)} minutes
            </p>
          )}

          <div className="walkthrough-achievement">
            <div className="walkthrough-badge">
              <div className="walkthrough-badge-icon">{walkthrough.icon || '🏆'}</div>
              <div className="walkthrough-badge-title">Tutorial Master</div>
            </div>
          </div>

          <div className="walkthrough-next-steps">
            <h4>What's Next?</h4>
            <p>Continue building your skills with these tutorials:</p>
            <ul>
              <li>Try the "Ordering a Biopsy" walkthrough</li>
              <li>Learn about "Prior Authorization"</li>
              <li>Master "End of Day Tasks"</li>
            </ul>
          </div>
        </div>

        <div className="walkthrough-modal-footer">
          {onRestart && (
            <button
              className="walkthrough-btn walkthrough-btn-ghost"
              onClick={onRestart}
            >
              Restart Tutorial
            </button>
          )}
          <button
            className="walkthrough-btn walkthrough-btn-primary"
            onClick={onClose}
          >
            Continue to App
          </button>
        </div>
      </div>
    </div>
  );
};

interface TipsModalProps {
  tips: string[];
  onClose: () => void;
}

export const WalkthroughTipsModal: React.FC<TipsModalProps> = ({ tips, onClose }) => {
  return (
    <div className="walkthrough-modal-overlay">
      <div className="walkthrough-modal walkthrough-modal-tips">
        <div className="walkthrough-modal-header">
          <h2>💡 Tips & Tricks</h2>
          <button
            className="walkthrough-close-btn"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="walkthrough-modal-content">
          <ul className="walkthrough-tips-list">
            {tips.map((tip, index) => (
              <li key={index} className="walkthrough-tip-item">
                <span className="walkthrough-tip-number">{index + 1}</span>
                <span className="walkthrough-tip-text">{tip}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="walkthrough-modal-footer">
          <button
            className="walkthrough-btn walkthrough-btn-primary"
            onClick={onClose}
          >
            Got It!
          </button>
        </div>
      </div>
    </div>
  );
};
