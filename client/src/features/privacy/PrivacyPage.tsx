import React from 'react';
import { Link } from 'react-router-dom';

/**
 * What Plinth keeps, written to match what it does. Change it in the same PR as the behaviour:
 * anything it says that stops being true is worse than saying nothing.
 */
export function PrivacyPage(): React.ReactElement {
  return (
    <main className="album-page privacy-page">
      <header className="album-page-header">
        <Link to="/" className="album-page-wordmark">
          Plinth
        </Link>
      </header>

      <h1 className="privacy-title">Privacy</h1>
      <p className="privacy-lead">
        Plinth doesn&apos;t need an account, and keeps as little as it can. Here is everything it
        keeps.
      </p>

      <h2>On your device</h2>
      <p>
        Your crate (the picks you&apos;ve been given, your answers to them, and when) lives in your
        browser, and nowhere else unless you sign in. Your browser also keeps a random code that
        tells the server one device from another, and a few counts, like how many picks you&apos;ve
        asked for this visit, which end when you close the tab. Plinth sets no cookies.
      </p>

      <h2>On the server</h2>
      <ul>
        <li>
          <strong>Albums that have been picked:</strong> the artist, title and year, so a shared
          link keeps working. They aren&apos;t tied to anyone.
        </li>
        <li>
          <strong>Your device:</strong> the random code is kept only in a scrambled form, with when
          it was first and last used. A device not used for a year is forgotten.
        </li>
        <li>
          <strong>How many picks you&apos;ve had today:</strong> counted against your device, or
          against your account if you&apos;re signed in, so there can be a daily limit. A browser
          that can&apos;t keep the code is counted by a scrambled form of its address instead. These
          counts are removed within two days.
        </li>
      </ul>

      <h2>If you sign in</h2>
      <p>
        Signing in is optional. Plinth then keeps your email address, which devices are signed in,
        and a copy of your crate, so it&apos;s there on every device you sign in on. That is the
        albums you&apos;ve been given, your answers to them and when, and each cover&apos;s address.
        The copy follows your crate: an album you remove is removed from it, though the fact that
        you removed it is remembered for 60 days (by artist and title only) so your other devices
        drop it too. Picks you haven&apos;t answered are dropped from your account after 90 days,
        and only the newest 50 are kept, as in your browser. The sign-in link you&apos;re sent is
        kept in a scrambled form, works once, and is removed soon after it expires. Emails are sent
        through Resend, which delivers them for Plinth and is used for nothing else.
      </p>
      <p>
        <strong>You can delete your account</strong> from the Sign in menu once you&apos;re signed
        in. That removes your email address, the copy of your crate, and any sign-in links that were
        sent, and signs every device out. The crate on your device stays.
      </p>
      <p>
        <strong>Signing out</strong> takes your crate off that device, as it&apos;s kept in your
        account. Sign in again to bring it back.
      </p>

      <h2>When you ask for a pick</h2>
      <p>
        What you ask for, including any text you type and the names of albums you&apos;ve answered,
        is sent to Anthropic&apos;s Claude to choose the album. It is sent without your email
        address or your device code.
      </p>

      <h2>Logs</h2>
      <p>
        Like most servers, Plinth&apos;s and its host&apos;s logs record the address and browser
        type of each request, to keep the service running and safe. Plinth&apos;s own logs also
        count things, such as how many picks were asked for. They never contain your email address,
        your device code, or your crate.
      </p>
    </main>
  );
}
