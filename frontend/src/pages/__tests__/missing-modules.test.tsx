import { render, screen } from '@testing-library/react';
import { RegistryPage } from '../RegistryPage';
import { ReferralsPage } from '../ReferralsPage';
import { ProtocolsPage } from '../ProtocolsPage';
import { PreferencesPage } from '../PreferencesPage';
import { HelpPage } from '../HelpPage';
import { RecallsPage } from '../RecallsPage';
import { FormsPage } from '../FormsPage';

describe('Missing module placeholder pages', () => {
  const cases = [
    { Component: RegistryPage, heading: 'Registry', emptyTitle: 'No registries yet' },
    { Component: ReferralsPage, heading: 'Referrals', emptyTitle: 'No referrals yet' },
    { Component: FormsPage, heading: 'Forms', emptyTitle: 'No forms configured' },
    { Component: ProtocolsPage, heading: 'Protocols', emptyTitle: 'No protocols yet' },
    { Component: PreferencesPage, heading: 'Preferences', emptyTitle: 'No preferences configured' },
    { Component: HelpPage, heading: 'Help', emptyTitle: 'Help resources coming soon' },
    { Component: RecallsPage, heading: 'Recalls', emptyTitle: 'No recall campaigns' },
  ];

  cases.forEach(({ Component, heading, emptyTitle }) => {
    it(`renders ${heading} placeholder`, () => {
      render(<Component />);
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
      expect(screen.getByText(emptyTitle)).toBeInTheDocument();
    });
  });
});
