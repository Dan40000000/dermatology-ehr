import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import TelehealthStatsCards from '../TelehealthStatsCards';

describe('TelehealthStatsCards', () => {
  const mockStats = {
    todayVisits: 5,
    waitingNow: 2,
    liveNow: 1,
    upcomingWeek: 12,
    completedToday: 4,
    cancelledThisWeek: 3,
    averageCompletedDurationMinutes: 18,
    uniquePatientsInRange: 15,
    providersWithTelehealth: 5,
  };

  const mockOnCardClick = vi.fn();

  it('renders all stat cards with correct values', () => {
    render(
      <TelehealthStatsCards stats={mockStats} onCardClick={mockOnCardClick} activeFilter={null} />
    );

    const todayCard = screen.getByText("Today's Visits").closest('button');
    const waitingCard = screen.getByText('Waiting Room').closest('button');
    const liveCard = screen.getByText('Live Now').closest('button');
    const upcomingCard = screen.getByText('Upcoming 7 Days').closest('button');
    const completedCard = screen.getByText('Completed Today').closest('button');
    const cancelledCard = screen.getByText('Cancelled / No-show').closest('button');

    expect(within(todayCard!).getByText('5')).toBeInTheDocument();
    expect(within(waitingCard!).getByText('2')).toBeInTheDocument();
    expect(within(liveCard!).getByText('1')).toBeInTheDocument();
    expect(within(upcomingCard!).getByText('12')).toBeInTheDocument();
    expect(within(completedCard!).getByText('4')).toBeInTheDocument();
    expect(within(cancelledCard!).getByText('3')).toBeInTheDocument();

    expect(screen.getByText('18 min')).toBeInTheDocument();
    expect(screen.getByText('Unique patients in range')).toBeInTheDocument();
    expect(screen.getByText('Providers scheduled')).toBeInTheDocument();
  });

  it('calls onCardClick when a card is clicked', () => {
    render(
      <TelehealthStatsCards stats={mockStats} onCardClick={mockOnCardClick} activeFilter={null} />
    );

    const inProgressCard = screen.getByText("Today's Visits").closest('button');
    fireEvent.click(inProgressCard!);

    expect(mockOnCardClick).toHaveBeenCalledWith('today');
  });

  it('applies active class to the active filter card', () => {
    render(
      <TelehealthStatsCards
        stats={mockStats}
        onCardClick={mockOnCardClick}
        activeFilter="completed_today"
      />
    );

    const completedCard = screen.getByText('Completed Today').closest('button');
    expect(completedCard).toHaveClass('active');
  });

  it('renders zero values correctly', () => {
    const emptyStats = {
      todayVisits: 0,
      waitingNow: 0,
      liveNow: 0,
      upcomingWeek: 0,
      completedToday: 0,
      cancelledThisWeek: 0,
      averageCompletedDurationMinutes: 0,
      uniquePatientsInRange: 0,
      providersWithTelehealth: 0,
    };

    render(
      <TelehealthStatsCards
        stats={emptyStats}
        onCardClick={mockOnCardClick}
        activeFilter={null}
      />
    );

    expect(screen.getByText('n/a')).toBeInTheDocument();
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(8);
  });
});
