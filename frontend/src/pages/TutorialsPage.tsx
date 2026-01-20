/**
 * Tutorials Page
 * Browse, start, and track tutorial completion
 */

import React, { useState } from 'react';
import { useWalkthrough } from '../components/Walkthrough/WalkthroughProvider';
import { walkthroughs, getAvailableWalkthroughs } from '../components/Walkthrough/walkthroughs';
import { Walkthrough } from '../components/Walkthrough/types';
import { WalkthroughIntroModal } from '../components/Walkthrough/WalkthroughModal';
import './TutorialsPage.css';

export const TutorialsPage: React.FC = () => {
  const { progress, startWalkthrough, resetProgress } = useWalkthrough();
  const [selectedWalkthrough, setSelectedWalkthrough] = useState<Walkthrough | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterDifficulty, setFilterDifficulty] = useState<string>('all');
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const completedIds = Object.keys(progress).filter(id => progress[id]?.completed);
  const availableWalkthroughs = getAvailableWalkthroughs(completedIds);

  const filteredWalkthroughs = walkthroughs.filter(w => {
    if (filterCategory !== 'all' && w.category !== filterCategory) return false;
    if (filterDifficulty !== 'all' && w.difficulty !== filterDifficulty) return false;
    return true;
  });

  const handleStartTutorial = (walkthrough: Walkthrough) => {
    setSelectedWalkthrough(walkthrough);
  };

  const handleConfirmStart = () => {
    if (selectedWalkthrough) {
      startWalkthrough(selectedWalkthrough.id);
      setSelectedWalkthrough(null);
    }
  };

  const handleCancelStart = () => {
    setSelectedWalkthrough(null);
  };

  const getCompletionPercentage = () => {
    if (walkthroughs.length === 0) return 0;
    return Math.round((completedIds.length / walkthroughs.length) * 100);
  };

  const getWalkthroughStatus = (walkthroughId: string) => {
    const prog = progress[walkthroughId];
    if (!prog) return 'not-started';
    if (prog.completed) return 'completed';
    return 'in-progress';
  };

  const isWalkthroughLocked = (walkthrough: Walkthrough) => {
    if (!walkthrough.prerequisites || walkthrough.prerequisites.length === 0) {
      return false;
    }
    return !walkthrough.prerequisites.every(prereqId => progress[prereqId]?.completed);
  };

  const difficultyColors = {
    beginner: '#10b981',
    intermediate: '#f59e0b',
    advanced: '#ef4444',
  };

  const categoryIcons = {
    clinical: '🩺',
    administrative: '📋',
    billing: '💰',
    advanced: '🚀',
  };

  return (
    <div className="tutorials-page">
      <div className="tutorials-header">
        <div className="tutorials-header-content">
          <h1>📚 Interactive Tutorials</h1>
          <p className="tutorials-subtitle">
            Learn the system with guided walkthroughs. Complete tutorials to unlock advanced features.
          </p>
        </div>

        {/* Progress Overview */}
        <div className="tutorials-progress-card">
          <div className="tutorials-progress-header">
            <span className="tutorials-progress-label">Overall Progress</span>
            <span className="tutorials-progress-percentage">{getCompletionPercentage()}%</span>
          </div>
          <div className="tutorials-progress-bar">
            <div
              className="tutorials-progress-fill"
              style={{ width: `${getCompletionPercentage()}%` }}
            />
          </div>
          <div className="tutorials-progress-stats">
            <span>{completedIds.length} of {walkthroughs.length} completed</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="tutorials-filters">
        <div className="tutorials-filter-group">
          <label>Category:</label>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="all">All Categories</option>
            <option value="clinical">Clinical</option>
            <option value="administrative">Administrative</option>
            <option value="billing">Billing</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>

        <div className="tutorials-filter-group">
          <label>Difficulty:</label>
          <select value={filterDifficulty} onChange={(e) => setFilterDifficulty(e.target.value)}>
            <option value="all">All Levels</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>

        <button
          className="tutorials-reset-btn"
          onClick={() => setShowResetConfirm(true)}
        >
          🔄 Reset All Progress
        </button>
      </div>

      {/* Tutorial Cards */}
      <div className="tutorials-grid">
        {filteredWalkthroughs.map(walkthrough => {
          const status = getWalkthroughStatus(walkthrough.id);
          const locked = isWalkthroughLocked(walkthrough);
          const prog = progress[walkthrough.id];

          return (
            <div
              key={walkthrough.id}
              className={`tutorial-card tutorial-card-${status} ${locked ? 'tutorial-card-locked' : ''}`}
            >
              {/* Status Badge */}
              {status === 'completed' && (
                <div className="tutorial-badge tutorial-badge-completed">
                  ✓ Completed
                </div>
              )}
              {status === 'in-progress' && (
                <div className="tutorial-badge tutorial-badge-progress">
                  In Progress
                </div>
              )}
              {locked && (
                <div className="tutorial-badge tutorial-badge-locked">
                  🔒 Locked
                </div>
              )}

              {/* Icon */}
              <div className="tutorial-icon">
                {locked ? '🔒' : walkthrough.icon || '📖'}
              </div>

              {/* Content */}
              <div className="tutorial-content">
                <h3 className="tutorial-title">{walkthrough.title}</h3>
                <p className="tutorial-description">{walkthrough.description}</p>

                {/* Meta */}
                <div className="tutorial-meta">
                  <span className="tutorial-meta-item">
                    {categoryIcons[walkthrough.category || 'clinical']}
                    {walkthrough.category}
                  </span>
                  <span className="tutorial-meta-item">
                    ⏱ {walkthrough.estimatedMinutes} min
                  </span>
                  <span
                    className="tutorial-meta-item tutorial-difficulty"
                    style={{ color: difficultyColors[walkthrough.difficulty] }}
                  >
                    ● {walkthrough.difficulty}
                  </span>
                </div>

                {/* Prerequisites */}
                {walkthrough.prerequisites && walkthrough.prerequisites.length > 0 && (
                  <div className="tutorial-prerequisites">
                    <strong>Prerequisites:</strong>
                    <ul>
                      {walkthrough.prerequisites.map(prereqId => {
                        const prereq = walkthroughs.find(w => w.id === prereqId);
                        const prereqCompleted = progress[prereqId]?.completed;
                        return (
                          <li key={prereqId} className={prereqCompleted ? 'completed' : ''}>
                            {prereqCompleted ? '✓' : '○'} {prereq?.title || prereqId}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {/* Progress for in-progress tutorials */}
                {status === 'in-progress' && prog && (
                  <div className="tutorial-progress">
                    <div className="tutorial-progress-text">
                      Step {prog.currentStepIndex + 1} of {walkthrough.steps.length}
                    </div>
                    <div className="tutorial-progress-bar-mini">
                      <div
                        className="tutorial-progress-fill-mini"
                        style={{ width: `${((prog.currentStepIndex + 1) / walkthrough.steps.length) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="tutorial-actions">
                {locked ? (
                  <button className="tutorial-btn tutorial-btn-locked" disabled>
                    Complete Prerequisites First
                  </button>
                ) : status === 'completed' ? (
                  <button
                    className="tutorial-btn tutorial-btn-secondary"
                    onClick={() => handleStartTutorial(walkthrough)}
                  >
                    Review Tutorial
                  </button>
                ) : status === 'in-progress' ? (
                  <button
                    className="tutorial-btn tutorial-btn-primary"
                    onClick={() => handleStartTutorial(walkthrough)}
                  >
                    Continue →
                  </button>
                ) : (
                  <button
                    className="tutorial-btn tutorial-btn-primary"
                    onClick={() => handleStartTutorial(walkthrough)}
                  >
                    Start Tutorial
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredWalkthroughs.length === 0 && (
        <div className="tutorials-empty">
          <div className="tutorials-empty-icon">🔍</div>
          <h3>No tutorials found</h3>
          <p>Try adjusting your filters to see more tutorials.</p>
        </div>
      )}

      {/* Intro Modal */}
      {selectedWalkthrough && (
        <WalkthroughIntroModal
          walkthrough={selectedWalkthrough}
          onStart={handleConfirmStart}
          onCancel={handleCancelStart}
        />
      )}

      {/* Reset Confirmation */}
      {showResetConfirm && (
        <div className="tutorials-modal-overlay">
          <div className="tutorials-modal">
            <h3>Reset All Progress?</h3>
            <p>This will reset your progress for all tutorials. You can restart them anytime.</p>
            <div className="tutorials-modal-actions">
              <button
                className="tutorial-btn tutorial-btn-secondary"
                onClick={() => setShowResetConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="tutorial-btn tutorial-btn-danger"
                onClick={() => {
                  resetProgress();
                  setShowResetConfirm(false);
                }}
              >
                Reset Progress
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
