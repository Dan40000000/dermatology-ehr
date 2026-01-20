import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Panel } from '../Panel';

describe('Panel Component', () => {
  it('renders title and children', () => {
    render(
      <Panel title="Panel Title">
        <p>Panel content</p>
      </Panel>
    );

    expect(screen.getByText('Panel Title')).toBeInTheDocument();
    expect(screen.getByText('Panel content')).toBeInTheDocument();
  });

  it('renders actions', () => {
    const actions = <button>Action Button</button>;

    render(
      <Panel title="Panel" actions={actions}>
        <p>Content</p>
      </Panel>
    );

    expect(screen.getByRole('button', { name: /action button/i })).toBeInTheDocument();
  });

  it('renders without actions', () => {
    const { container } = render(
      <Panel title="Panel">
        <p>Content</p>
      </Panel>
    );

    expect(container.querySelector('.panel-actions')).not.toBeInTheDocument();
  });

  it('is not collapsible by default', () => {
    render(
      <Panel title="Panel">
        <p>Content</p>
      </Panel>
    );

    expect(screen.queryByRole('button', { name: /▼|▶/ })).not.toBeInTheDocument();
  });

  it('renders collapse toggle when collapsible', () => {
    render(
      <Panel title="Panel" collapsible>
        <p>Content</p>
      </Panel>
    );

    expect(screen.getByRole('button', { expanded: true })).toBeInTheDocument();
  });

  it('toggles collapsed state', async () => {
    const user = userEvent.setup();

    render(
      <Panel title="Panel" collapsible>
        <p>Content</p>
      </Panel>
    );

    const content = screen.getByText('Content');
    expect(content).toBeInTheDocument();

    const toggleButton = screen.getByRole('button', { expanded: true });
    await user.click(toggleButton);

    expect(screen.queryByText('Content')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { expanded: false })).toBeInTheDocument();
  });

  it('starts collapsed when defaultCollapsed is true', () => {
    render(
      <Panel title="Panel" collapsible defaultCollapsed>
        <p>Content</p>
      </Panel>
    );

    expect(screen.queryByText('Content')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { expanded: false })).toBeInTheDocument();
  });

  it('expands when toggle clicked on collapsed panel', async () => {
    const user = userEvent.setup();

    render(
      <Panel title="Panel" collapsible defaultCollapsed>
        <p>Content</p>
      </Panel>
    );

    expect(screen.queryByText('Content')).not.toBeInTheDocument();

    const toggleButton = screen.getByRole('button', { expanded: false });
    await user.click(toggleButton);

    expect(screen.getByText('Content')).toBeInTheDocument();
    expect(screen.getByRole('button', { expanded: true })).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <Panel title="Panel" className="custom-panel">
        <p>Content</p>
      </Panel>
    );

    expect(container.querySelector('.custom-panel')).toBeInTheDocument();
  });

  it('applies collapsed className when collapsed', () => {
    const { container } = render(
      <Panel title="Panel" collapsible defaultCollapsed>
        <p>Content</p>
      </Panel>
    );

    expect(container.querySelector('.collapsed')).toBeInTheDocument();
  });

  it('shows correct icon when expanded', () => {
    render(
      <Panel title="Panel" collapsible>
        <p>Content</p>
      </Panel>
    );

    expect(screen.getByText('▼')).toBeInTheDocument();
  });

  it('shows correct icon when collapsed', () => {
    render(
      <Panel title="Panel" collapsible defaultCollapsed>
        <p>Content</p>
      </Panel>
    );

    expect(screen.getByText('▶')).toBeInTheDocument();
  });
});
