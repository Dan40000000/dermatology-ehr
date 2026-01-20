/**
 * Walkthrough Step Component
 * Renders individual tutorial steps with spotlight, tooltip, and navigation
 */

import React, { useEffect, useState, useRef } from 'react';
import { useWalkthrough } from './WalkthroughProvider';
import './Walkthrough.css';

export const WalkthroughStep: React.FC = () => {
  const { activeWalkthrough, currentStepIndex, nextStep, previousStep, skipStep, exitWalkthrough } = useWalkthrough();
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>();

  const currentStep = activeWalkthrough?.steps[currentStepIndex];

  useEffect(() => {
    if (!currentStep) return;

    const updateHighlight = () => {
      const element = document.querySelector(currentStep.targetSelector);
      if (element) {
        const rect = element.getBoundingClientRect();
        setHighlightRect(rect);

        // Calculate tooltip position based on step position preference
        calculateTooltipPosition(rect, currentStep.position);
      }
    };

    // Initial update
    updateHighlight();

    // Update on scroll and resize
    const handleUpdate = () => {
      animationFrameRef.current = requestAnimationFrame(updateHighlight);
    };

    window.addEventListener('scroll', handleUpdate, true);
    window.addEventListener('resize', handleUpdate);

    // Update periodically in case DOM changes
    const interval = setInterval(updateHighlight, 100);

    return () => {
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
      clearInterval(interval);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [currentStep]);

  const calculateTooltipPosition = (targetRect: DOMRect, position: string) => {
    if (!tooltipRef.current) return;

    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const padding = 20;
    const arrowSize = 12;

    let top = 0;
    let left = 0;

    switch (position) {
      case 'top':
        top = targetRect.top - tooltipRect.height - arrowSize - padding;
        left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
        break;
      case 'bottom':
        top = targetRect.bottom + arrowSize + padding;
        left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
        break;
      case 'left':
        top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
        left = targetRect.left - tooltipRect.width - arrowSize - padding;
        break;
      case 'right':
        top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
        left = targetRect.right + arrowSize + padding;
        break;
      case 'center':
        top = window.innerHeight / 2 - tooltipRect.height / 2;
        left = window.innerWidth / 2 - tooltipRect.width / 2;
        break;
    }

    // Keep tooltip within viewport
    const maxTop = window.innerHeight - tooltipRect.height - padding;
    const maxLeft = window.innerWidth - tooltipRect.width - padding;

    top = Math.max(padding, Math.min(top, maxTop));
    left = Math.max(padding, Math.min(left, maxLeft));

    setTooltipPosition({ top, left });
  };

  if (!activeWalkthrough || !currentStep) return null;

  const progress = ((currentStepIndex + 1) / activeWalkthrough.steps.length) * 100;

  return (
    <>
      {/* Dark overlay */}
      <div className="walkthrough-overlay" onClick={exitWalkthrough} />

      {/* Spotlight highlight */}
      {highlightRect && (
        <>
          <div
            className="walkthrough-spotlight"
            style={{
              top: highlightRect.top - 8,
              left: highlightRect.left - 8,
              width: highlightRect.width + 16,
              height: highlightRect.height + 16,
            }}
          />

          {/* Animated pointer */}
          {currentStep.action === 'click' && (
            <div
              className="walkthrough-pointer"
              style={{
                top: highlightRect.top + highlightRect.height / 2,
                left: highlightRect.left + highlightRect.width / 2,
              }}
            >
              <svg width="32" height="32" viewBox="0 0 32 32">
                <path
                  d="M8 4 L8 24 L14 18 L18 28 L22 26 L18 16 L26 16 Z"
                  fill="white"
                  stroke="#6366f1"
                  strokeWidth="2"
                />
              </svg>
            </div>
          )}
        </>
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className={`walkthrough-tooltip walkthrough-tooltip-${currentStep.position}`}
        style={{
          top: tooltipPosition.top,
          left: tooltipPosition.left,
        }}
      >
        {/* Header */}
        <div className="walkthrough-tooltip-header">
          <div className="walkthrough-tooltip-title-section">
            <h3 className="walkthrough-tooltip-title">{currentStep.title}</h3>
            <span className="walkthrough-tooltip-step-counter">
              Step {currentStepIndex + 1} of {activeWalkthrough.steps.length}
            </span>
          </div>
          <button
            className="walkthrough-close-btn"
            onClick={exitWalkthrough}
            title="Exit walkthrough"
          >
            ✕
          </button>
        </div>

        {/* Progress bar */}
        <div className="walkthrough-progress-bar">
          <div
            className="walkthrough-progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Content */}
        <div className="walkthrough-tooltip-content">
          <p>{currentStep.description}</p>

          {currentStep.action === 'type' && currentStep.actionValue && (
            <div className="walkthrough-hint">
              <strong>Try typing:</strong> {currentStep.actionValue}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="walkthrough-tooltip-footer">
          <div className="walkthrough-nav-buttons">
            {currentStepIndex > 0 && (
              <button
                className="walkthrough-btn walkthrough-btn-secondary"
                onClick={previousStep}
              >
                ← Back
              </button>
            )}

            {currentStep.canSkip !== false && (
              <button
                className="walkthrough-btn walkthrough-btn-ghost"
                onClick={skipStep}
              >
                Skip
              </button>
            )}
          </div>

          <button
            className="walkthrough-btn walkthrough-btn-primary"
            onClick={nextStep}
          >
            {currentStepIndex === activeWalkthrough.steps.length - 1 ? 'Finish' : 'Next →'}
          </button>
        </div>
      </div>
    </>
  );
};
