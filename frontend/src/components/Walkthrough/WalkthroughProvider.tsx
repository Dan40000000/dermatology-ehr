/**
 * Walkthrough Provider
 * React context provider for managing walkthrough state across the application
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Walkthrough, WalkthroughContextType, WalkthroughProgress } from './types';
import { walkthroughs } from './walkthroughs';

const WalkthroughContext = createContext<WalkthroughContextType | undefined>(undefined);

const STORAGE_KEY = 'derm-app-walkthrough-progress';
const DEMO_MODE_KEY = 'derm-app-demo-mode';

interface WalkthroughProviderProps {
  children: ReactNode;
}

export const WalkthroughProvider: React.FC<WalkthroughProviderProps> = ({ children }) => {
  const [activeWalkthrough, setActiveWalkthrough] = useState<Walkthrough | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [progress, setProgress] = useState<Record<string, WalkthroughProgress>>({});
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Load progress from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setProgress(JSON.parse(stored));
      }

      const demoMode = localStorage.getItem(DEMO_MODE_KEY);
      if (demoMode === 'true') {
        setIsDemoMode(true);
      }
    } catch (error) {
      console.error('Failed to load walkthrough progress:', error);
    }
  }, []);

  // Save progress to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch (error) {
      console.error('Failed to save walkthrough progress:', error);
    }
  }, [progress]);

  // Save demo mode preference
  useEffect(() => {
    localStorage.setItem(DEMO_MODE_KEY, isDemoMode.toString());
  }, [isDemoMode]);

  const startWalkthrough = (walkthroughId: string) => {
    const walkthrough = walkthroughs.find(w => w.id === walkthroughId);
    if (!walkthrough) {
      console.error(`Walkthrough ${walkthroughId} not found`);
      return;
    }

    // Check prerequisites
    if (walkthrough.prerequisites && walkthrough.prerequisites.length > 0) {
      const unmetPrereqs = walkthrough.prerequisites.filter(
        prereqId => !progress[prereqId]?.completed
      );

      if (unmetPrereqs.length > 0) {
        console.warn('Prerequisites not met:', unmetPrereqs);
        // Could show a modal here
        return;
      }
    }

    // Resume from last step if exists
    const existingProgress = progress[walkthroughId];
    const startIndex = existingProgress && !existingProgress.completed
      ? existingProgress.currentStepIndex
      : 0;

    setActiveWalkthrough(walkthrough);
    setCurrentStepIndex(startIndex);

    // Update or create progress entry
    setProgress(prev => ({
      ...prev,
      [walkthroughId]: {
        walkthroughId,
        currentStepIndex: startIndex,
        completedSteps: existingProgress?.completedSteps || [],
        completed: false,
        startedAt: existingProgress?.startedAt || new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
      },
    }));
  };

  const nextStep = async () => {
    if (!activeWalkthrough) return;

    const currentStep = activeWalkthrough.steps[currentStepIndex];

    // Run afterStep hook if exists
    if (currentStep?.afterStep) {
      try {
        await currentStep.afterStep();
      } catch (error) {
        console.error('Error in afterStep hook:', error);
      }
    }

    // Mark current step as completed
    const stepId = currentStep.id;
    setProgress(prev => ({
      ...prev,
      [activeWalkthrough.id]: {
        ...prev[activeWalkthrough.id],
        completedSteps: [...new Set([...prev[activeWalkthrough.id].completedSteps, stepId])],
        currentStepIndex: currentStepIndex + 1,
        lastAccessedAt: new Date().toISOString(),
      },
    }));

    // Check if this was the last step
    if (currentStepIndex >= activeWalkthrough.steps.length - 1) {
      completeWalkthrough();
      return;
    }

    const nextIndex = currentStepIndex + 1;
    const nextStep = activeWalkthrough.steps[nextIndex];

    // Run beforeStep hook if exists
    if (nextStep?.beforeStep) {
      try {
        await nextStep.beforeStep();
      } catch (error) {
        console.error('Error in beforeStep hook:', error);
      }
    }

    setCurrentStepIndex(nextIndex);
  };

  const previousStep = () => {
    if (!activeWalkthrough || currentStepIndex === 0) return;

    const prevIndex = currentStepIndex - 1;
    setCurrentStepIndex(prevIndex);

    setProgress(prev => ({
      ...prev,
      [activeWalkthrough.id]: {
        ...prev[activeWalkthrough.id],
        currentStepIndex: prevIndex,
        lastAccessedAt: new Date().toISOString(),
      },
    }));
  };

  const skipStep = () => {
    if (!activeWalkthrough) return;

    const currentStep = activeWalkthrough.steps[currentStepIndex];
    if (currentStep?.canSkip === false) {
      console.warn('This step cannot be skipped');
      return;
    }

    nextStep();
  };

  const completeWalkthrough = () => {
    if (!activeWalkthrough) return;

    setProgress(prev => ({
      ...prev,
      [activeWalkthrough.id]: {
        ...prev[activeWalkthrough.id],
        completed: true,
        completedAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
      },
    }));

    // Keep walkthrough active to show completion modal
    // The modal will call exitWalkthrough when dismissed
  };

  const exitWalkthrough = () => {
    setActiveWalkthrough(null);
    setCurrentStepIndex(0);
  };

  const resetProgress = (walkthroughId?: string) => {
    if (walkthroughId) {
      setProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[walkthroughId];
        return newProgress;
      });
    } else {
      setProgress({});
    }
  };

  const setDemoMode = (enabled: boolean) => {
    setIsDemoMode(enabled);
    if (!enabled) {
      // Exit any active walkthrough when demo mode is disabled
      exitWalkthrough();
    }
  };

  const isStepCompleted = (walkthroughId: string, stepId: string): boolean => {
    return progress[walkthroughId]?.completedSteps.includes(stepId) || false;
  };

  const getWalkthroughProgress = (walkthroughId: string): WalkthroughProgress | undefined => {
    return progress[walkthroughId];
  };

  const value: WalkthroughContextType = {
    activeWalkthrough,
    currentStepIndex,
    progress,
    isDemoMode,
    startWalkthrough,
    nextStep,
    previousStep,
    skipStep,
    completeWalkthrough,
    exitWalkthrough,
    resetProgress,
    setDemoMode,
    isStepCompleted,
    getWalkthroughProgress,
  };

  return (
    <WalkthroughContext.Provider value={value}>
      {children}
    </WalkthroughContext.Provider>
  );
};

export const useWalkthrough = (): WalkthroughContextType => {
  const context = useContext(WalkthroughContext);
  if (!context) {
    throw new Error('useWalkthrough must be used within a WalkthroughProvider');
  }
  return context;
};
