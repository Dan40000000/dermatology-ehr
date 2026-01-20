/**
 * Main Walkthrough Component
 * Orchestrates the entire walkthrough experience
 */

import React, { useEffect } from 'react';
import { useWalkthrough } from './WalkthroughProvider';
import { WalkthroughStep } from './WalkthroughStep';
import { WalkthroughCompletionModal } from './WalkthroughModal';
import { DemoModeBar } from './DemoModeBar';

export const Walkthrough: React.FC = () => {
  const { activeWalkthrough, currentStepIndex, progress, exitWalkthrough } = useWalkthrough();

  // Handle ESC key to exit walkthrough
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeWalkthrough) {
        const confirmExit = window.confirm('Exit this tutorial? Your progress will be saved.');
        if (confirmExit) {
          exitWalkthrough();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeWalkthrough, exitWalkthrough]);

  // Prevent body scroll when walkthrough is active
  useEffect(() => {
    if (activeWalkthrough) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [activeWalkthrough]);

  const isCompleted = activeWalkthrough && progress[activeWalkthrough.id]?.completed;
  const isLastStep = activeWalkthrough && currentStepIndex >= activeWalkthrough.steps.length - 1;

  return (
    <>
      {/* Demo Mode Bar */}
      <DemoModeBar />

      {/* Active Walkthrough Step */}
      {activeWalkthrough && !isCompleted && <WalkthroughStep />}

      {/* Completion Modal */}
      {activeWalkthrough && isCompleted && (
        <WalkthroughCompletionModal
          walkthrough={activeWalkthrough}
          onClose={exitWalkthrough}
          onRestart={() => {
            exitWalkthrough();
            // Could restart the walkthrough here if needed
          }}
        />
      )}
    </>
  );
};

export default Walkthrough;
