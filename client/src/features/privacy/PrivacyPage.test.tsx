import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PrivacyPage } from './PrivacyPage';

function renderPage(): void {
  render(
    <MemoryRouter>
      <PrivacyPage />
    </MemoryRouter>,
  );
}

describe('PrivacyPage', () => {
  it('has a heading, and a way back to Plinth', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Privacy' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Plinth' })).toHaveAttribute('href', '/');
  });

  it('covers where things are kept, signing in, picks and logs', () => {
    renderPage();

    [
      'On your device',
      'On the server',
      'If you sign in',
      'If you make a top 3',
      'When you ask for a pick',
      'Logs',
    ].forEach((name) => {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    });
  });

  it('says what is saved when you sign in, and for how long', () => {
    renderPage();

    expect(screen.getByText(/and a copy of your crate/)).toBeInTheDocument();
    expect(screen.getByText(/remembered for 60 days/)).toBeInTheDocument();
    expect(screen.getByText(/dropped from your account after 90 days/)).toBeInTheDocument();
  });

  describe('top 3 lists', () => {
    it('says what is kept about a list, and who it belongs to', () => {
      renderPage();

      expect(screen.getByText(/keeps the albums in it, their order/)).toBeInTheDocument();
      expect(screen.getByText(/your device, or your account once you sign in/)).toBeInTheDocument();
    });

    it('says anyone who has the link can see it, and that it is not listed', () => {
      renderPage();

      expect(screen.getByText(/Anyone who has the link can see it/)).toBeInTheDocument();
      expect(screen.getByText(/search engines are asked to leave it out/)).toBeInTheDocument();
    });

    it('says what link previews fetch, and that an unfinished list is only seen by its owner', () => {
      renderPage();

      expect(screen.getByText(/a picture of the three covers/)).toBeInTheDocument();
      expect(screen.getByText(/fewer than three albums/)).toBeInTheDocument();
    });

    it('says a list can be saved as a picture for Stories, and that nothing is kept about it', () => {
      renderPage();

      expect(
        screen.getByText(/save your list as a tall picture to post as a Story/),
      ).toBeInTheDocument();
      expect(screen.getByText(/keeps nothing about who asked for it/)).toBeInTheDocument();
    });

    it('says how to delete one, and what else removes it', () => {
      renderPage();

      expect(screen.getByText(/You can delete it from Your lists/)).toBeInTheDocument();
      expect(screen.getByText(/Deleting your account deletes it too/)).toBeInTheDocument();
      expect(
        screen.getByText(/not used for a year is forgotten along with its list/),
      ).toBeInTheDocument();
    });

    it('says the albums in a list are kept like any picked album, tied to no one', () => {
      renderPage();

      expect(screen.getByText(/or added to a list/)).toBeInTheDocument();
    });

    it('says the logs count lists and never say which', () => {
      renderPage();

      expect(screen.getByText(/how many lists were made, changed and shared/)).toBeInTheDocument();
      expect(screen.getByText(/which list was made, changed or viewed/)).toBeInTheDocument();
    });
  });

  it('says the crate is only in the browser unless you sign in', () => {
    renderPage();

    expect(screen.getByText(/nowhere else unless you sign in/)).toBeInTheDocument();
  });

  it('says what deleting an account removes, and that the crate on the device stays', () => {
    renderPage();

    expect(screen.getByText(/You can delete your account/)).toBeInTheDocument();
    expect(
      screen.getByText(/removes your email address, the copy of your crate/),
    ).toBeInTheDocument();
    expect(screen.getByText(/The crate on your device stays/)).toBeInTheDocument();
  });

  it('says signing out takes the crate off the device', () => {
    renderPage();

    expect(screen.getByText(/takes your crate off that device/)).toBeInTheDocument();
  });

  it('says there are no cookies, and that logs never hold the email or the device code', () => {
    renderPage();

    expect(screen.getByText(/Plinth sets no cookies/)).toBeInTheDocument();
    expect(
      screen.getByText(/never contain your email address, your device code, your crate/),
    ).toBeInTheDocument();
  });
});
