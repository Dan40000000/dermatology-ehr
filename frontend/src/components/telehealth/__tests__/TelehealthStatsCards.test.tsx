import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TelehealthStatsCards from '../TelehealthStatsCards';

describe('TelehealthStatsCards', () => {
  const mockStats = {
    myInProgress: 5,
    myCompleted: 10,
    myUnreadMessages: 3,
    unassignedCases: 2,
  };

  const mockOnCardClick = vi.fn();

  it('renders all stat cards with correct values', () => {
    render(
      <TelehealthStatsCards stats={mockStats} onCardClick={mockOnCardClick} activeFilter={null} />
    );

    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();

    expect(screen.getByText('My Cases In Progress')).toBeInTheDocument();
    expect(screen.getByText('My Completed Cases')).toBeInTheDocument();
    expect(screen.getByText('My Unread Messages')).toBeInTheDocument();
    expect(screen.getByText('Unassigned Cases')).toBeInTheDocument();
  });

  it('calls onCardClick when a card is clicked', () => {
    render(
      <TelehealthStatsCards stats={mockStats} onCardClick={mockOnCardClick} activeFilter={null} />
    );

    const inProgressCard = screen.getByText('My Cases In Progress').closest('button');
    fireEvent.click(inProgressCard!);

    expect(mockOnCardClick).toHaveBeenCalledWith('in_progress');
  });

  it('applies active class to the active filter card', () => {
    render(
      <TelehealthStatsCards
        stats={mockStats}
        onCardClick={mockOnCardClick}
        activeFilter="completed"
      />
    );

    const completedCard = screen.getByText('My Completed Cases').closest('button');
    expect(completedCard).toHaveClass('active');
  });

  it('renders zero values correctly', () => {
    const emptyStats = {
      myInProgress: 0,
      myCompleted: 0,
      myUnreadMessages: 0,
      unassignedCases: 0,
    };

    render(
      <TelehealthStatsCards
        stats={emptyStats}
        onCardClick={mockOnCardClick}
        activeFilter={null}
      />
    );

    const zeros = screen.getAllByText('0');
    expect(zeros).toHaveLength(4);
  });
});
