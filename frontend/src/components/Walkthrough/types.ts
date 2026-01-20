/**
 * Walkthrough System Types
 * Defines all interfaces for the interactive tutorial system
 */

export interface WalkthroughStep {
  id: string;
  title: string;
  description: string;
  targetSelector: string; // CSS selector to highlight
  position: 'top' | 'bottom' | 'left' | 'right' | 'center';
  action?: 'click' | 'type' | 'wait';
  actionValue?: string;
  canSkip?: boolean;
  beforeStep?: () => Promise<void>; // Setup for this step
  afterStep?: () => Promise<void>; // Cleanup after step
  validationFn?: () => boolean; // Optional validation before proceeding
}

export interface Walkthrough {
  id: string;
  title: string;
  description: string;
  estimatedMinutes: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  steps: WalkthroughStep[];
  prerequisites?: string[]; // IDs of walkthroughs to complete first
  category?: 'clinical' | 'administrative' | 'billing' | 'advanced';
  icon?: string;
}

export interface WalkthroughProgress {
  walkthroughId: string;
  currentStepIndex: number;
  completedSteps: string[];
  completed: boolean;
  startedAt: string;
  completedAt?: string;
  lastAccessedAt: string;
}

export interface WalkthroughContextType {
  activeWalkthrough: Walkthrough | null;
  currentStepIndex: number;
  progress: Record<string, WalkthroughProgress>;
  isDemoMode: boolean;
  startWalkthrough: (walkthroughId: string) => void;
  nextStep: () => void;
  previousStep: () => void;
  skipStep: () => void;
  completeWalkthrough: () => void;
  exitWalkthrough: () => void;
  resetProgress: (walkthroughId?: string) => void;
  setDemoMode: (enabled: boolean) => void;
  isStepCompleted: (walkthroughId: string, stepId: string) => boolean;
  getWalkthroughProgress: (walkthroughId: string) => WalkthroughProgress | undefined;
}
