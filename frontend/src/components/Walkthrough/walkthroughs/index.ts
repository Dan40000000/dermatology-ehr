/**
 * Walkthrough Definitions Index
 * Exports all available tutorials
 */

import { Walkthrough } from '../types';
import { firstPatientWalkthrough } from './firstPatient';
import { orderBiopsyWalkthrough } from './orderBiopsy';
import { priorAuthWalkthrough } from './priorAuth';
import { cosmeticVisitWalkthrough } from './cosmeticVisit';
import { skinCheckWalkthrough } from './skinCheck';
import { endOfDayWalkthrough } from './endOfDay';

// All available walkthroughs
export const walkthroughs: Walkthrough[] = [
  firstPatientWalkthrough,
  orderBiopsyWalkthrough,
  priorAuthWalkthrough,
  cosmeticVisitWalkthrough,
  skinCheckWalkthrough,
  endOfDayWalkthrough,
];

// Helper functions to find walkthroughs
export const getWalkthroughById = (id: string): Walkthrough | undefined => {
  return walkthroughs.find(w => w.id === id);
};

export const getWalkthroughsByCategory = (category: string): Walkthrough[] => {
  return walkthroughs.filter(w => w.category === category);
};

export const getWalkthroughsByDifficulty = (difficulty: string): Walkthrough[] => {
  return walkthroughs.filter(w => w.difficulty === difficulty);
};

export const getBeginnerWalkthroughs = (): Walkthrough[] => {
  return walkthroughs.filter(w => w.difficulty === 'beginner');
};

export const getAvailableWalkthroughs = (completedIds: string[]): Walkthrough[] => {
  return walkthroughs.filter(w => {
    // If no prerequisites, it's available
    if (!w.prerequisites || w.prerequisites.length === 0) {
      return true;
    }

    // Check if all prerequisites are completed
    return w.prerequisites.every(prereqId => completedIds.includes(prereqId));
  });
};
