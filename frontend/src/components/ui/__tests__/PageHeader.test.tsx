import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageHeader } from '../PageHeader';

describe('PageHeader Component', () => {
  it('renders title', () => {
    render(<PageHeader title="Dashboard" />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('renders title as h1', () => {
    render(<PageHeader title="Dashboard" />);
    const title = screen.getByText('Dashboard');
    expect(title.tagName).toBe('H1');
  });

  it('renders subtitle', () => {
    render(<PageHeader title="Dashboard" subtitle="Welcome back" />);
    expect(screen.getByText('Welcome back')).toBeInTheDocument();
  });

  it('renders without subtitle', () => {
    const { container } = render(<PageHeader title="Dashboard" />);
    expect(container.querySelector('.page-subtitle')).not.toBeInTheDocument();
  });

  it('renders actions', () => {
    const actions = (
      <>
        <button>Add</button>
        <button>Export</button>
      </>
    );

    render(<PageHeader title="Patients" actions={actions} />);

    expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
  });

  it('renders without actions', () => {
    const { container } = render(<PageHeader title="Dashboard" />);
    expect(container.querySelector('.page-header-actions')).not.toBeInTheDocument();
  });

  it('renders breadcrumbs', () => {
    const breadcrumbs = [
      { label: 'Home', href: '/' },
      { label: 'Patients', href: '/patients' },
      { label: 'John Doe' },
    ];

    render(<PageHeader title="Patient Details" breadcrumbs={breadcrumbs} />);

    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Patients')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('renders breadcrumbs with links', () => {
    const breadcrumbs = [
      { label: 'Home', href: '/' },
      { label: 'Patients', href: '/patients' },
    ];

    render(<PageHeader title="Patients" breadcrumbs={breadcrumbs} />);

    const homeLink = screen.getByText('Home');
    expect(homeLink.tagName).toBe('A');
    expect(homeLink).toHaveAttribute('href', '/');

    const patientsLink = screen.getByText('Patients');
    expect(patientsLink.tagName).toBe('A');
    expect(patientsLink).toHaveAttribute('href', '/patients');
  });

  it('renders current breadcrumb without link', () => {
    const breadcrumbs = [
      { label: 'Home', href: '/' },
      { label: 'Current Page' },
    ];

    render(<PageHeader title="Current Page" breadcrumbs={breadcrumbs} />);

    const currentCrumb = screen.getByText('Current Page');
    expect(currentCrumb.tagName).toBe('SPAN');
    expect(currentCrumb).toHaveAttribute('aria-current', 'page');
  });

  it('does not render breadcrumbs when empty', () => {
    const { container } = render(<PageHeader title="Dashboard" breadcrumbs={[]} />);
    expect(container.querySelector('.breadcrumbs')).not.toBeInTheDocument();
  });

  it('does not render breadcrumbs when not provided', () => {
    const { container } = render(<PageHeader title="Dashboard" />);
    expect(container.querySelector('.breadcrumbs')).not.toBeInTheDocument();
  });

  it('has proper accessibility for breadcrumbs', () => {
    const breadcrumbs = [
      { label: 'Home', href: '/' },
      { label: 'Patients' },
    ];

    render(<PageHeader title="Patients" breadcrumbs={breadcrumbs} />);

    const nav = screen.getByRole('navigation', { name: /breadcrumb/i });
    expect(nav).toBeInTheDocument();
  });

  it('renders all sections together', () => {
    const breadcrumbs = [
      { label: 'Home', href: '/' },
      { label: 'Patients' },
    ];

    const actions = <button>Add Patient</button>;

    render(
      <PageHeader
        title="Patients"
        subtitle="Manage your patients"
        breadcrumbs={breadcrumbs}
        actions={actions}
      />
    );

    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Patients')).toBeInTheDocument();
    expect(screen.getByText('Manage your patients')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add patient/i })).toBeInTheDocument();
  });

  it('renders breadcrumbs in correct order', () => {
    const breadcrumbs = [
      { label: 'First', href: '/first' },
      { label: 'Second', href: '/second' },
      { label: 'Third' },
    ];

    const { container } = render(<PageHeader title="Page" breadcrumbs={breadcrumbs} />);

    const breadcrumbItems = container.querySelectorAll('.breadcrumbs li');
    expect(breadcrumbItems).toHaveLength(3);
    expect(breadcrumbItems[0]).toHaveTextContent('First');
    expect(breadcrumbItems[1]).toHaveTextContent('Second');
    expect(breadcrumbItems[2]).toHaveTextContent('Third');
  });
});
