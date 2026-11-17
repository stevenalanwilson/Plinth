import React from 'react';
import { HistoryEntry } from '../../types/history';
import { TasteSummary } from './TasteSummary';
import {
  computeSummaryStats,
  computeDecadeBreakdown,
  computeGenreBreakdown,
  computeCountryBreakdown,
  computeTopArtists,
  computeMonthlyActivity,
  computeGapObservations,
  LabelCount,
} from './statsUtils';

interface InsightsPageProps {
  history: readonly HistoryEntry[];
}

// ── Shared primitives ─────────────────────────────────────────────────────────

interface BarChartProps {
  items: readonly LabelCount[];
  maxCount: number;
}

function BarChart({ items, maxCount }: BarChartProps): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {items.map(({ label, count }) => (
        <div key={label}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              marginBottom: 3,
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: 'var(--text)',
                fontFamily: 'var(--mono)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '85%',
              }}
            >
              {label}
            </span>
            <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
              {count}
            </span>
          </div>
          <div style={{ height: 3, background: 'var(--border)', borderRadius: 2 }}>
            <div
              style={{
                height: '100%',
                width: `${(count / maxCount) * 100}%`,
                background: 'var(--accent)',
                borderRadius: 2,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps): React.ReactElement {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          color: 'var(--muted)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: 12,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

// ── Summary stat cards ────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
}

function StatCard({ label, value }: StatCardProps): React.ReactElement {
  return (
    <div
      style={{
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--serif)',
          fontSize: 26,
          fontWeight: 400,
          lineHeight: 1,
          color: 'var(--accent)',
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 10,
          color: 'var(--muted)',
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
    </div>
  );
}

// ── Monthly activity chart (vertical bars) ────────────────────────────────────

interface ActivityChartProps {
  months: ReturnType<typeof computeMonthlyActivity>;
}

function ActivityChart({ months }: ActivityChartProps): React.ReactElement {
  const maxCount = Math.max(...months.map((m) => m.count), 1);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 4,
        height: 64,
        overflowX: 'auto',
      }}
    >
      {months.map(({ key, label, count }) => (
        <div
          key={key}
          title={`${label}: ${count} album${count !== 1 ? 's' : ''}`}
          style={{
            flex: '0 0 auto',
            minWidth: 20,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            height: '100%',
            justifyContent: 'flex-end',
          }}
        >
          <div
            style={{
              width: '100%',
              background: 'var(--accent)',
              borderRadius: '2px 2px 0 0',
              height: `${Math.max((count / maxCount) * 48, 2)}px`,
            }}
          />
          <span
            style={{
              fontSize: 8,
              color: 'var(--muted)',
              fontFamily: 'var(--mono)',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function InsightsPage({ history }: InsightsPageProps): React.ReactElement {
  if (history.length === 0) {
    return (
      <div
        style={{
          padding: '60px 0',
          textAlign: 'center',
          color: 'var(--muted)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 36,
            color: 'var(--accent)',
            marginBottom: 12,
          }}
        >
          ♪
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.6 }}>
          Start discovering albums to see your insights.
        </p>
      </div>
    );
  }

  const summary = computeSummaryStats(history);
  const decades = computeDecadeBreakdown(history).map((d) => ({ label: d.decade, count: d.count }));
  const genres = computeGenreBreakdown(history);
  const countries = computeCountryBreakdown(history);
  const topArtists = computeTopArtists(history).map((a) => ({ label: a.artist, count: a.count }));
  const months = computeMonthlyActivity(history);
  const gaps = computeGapObservations(history);

  const maxDecade = Math.max(...decades.map((d) => d.count), 1);
  const maxGenre = Math.max(...genres.map((g) => g.count), 1);
  const maxCountry = Math.max(...countries.map((c) => c.count), 1);
  const maxArtist = Math.max(...topArtists.map((a) => a.count), 1);

  const yearSpanLabel =
    summary.yearSpan !== null
      ? summary.yearSpan[0] === summary.yearSpan[1]
        ? String(summary.yearSpan[0])
        : `${summary.yearSpan[0]}–${summary.yearSpan[1]}`
      : '—';

  // Determine how many breakdown columns we have
  const breakdownCols = [true, genres.length > 0, countries.length > 0].filter(Boolean).length;

  return (
    <div style={{ paddingBottom: 60 }}>
      <TasteSummary history={history} />

      {/* Summary stat cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 10,
          marginBottom: 32,
        }}
        className="stats-summary-grid"
      >
        <StatCard label="Albums discovered" value={String(summary.totalAlbums)} />
        <StatCard label="Unique artists" value={String(summary.uniqueArtists)} />
        <StatCard
          label={summary.countriesExplored > 0 ? 'Countries explored' : 'Year span'}
          value={summary.countriesExplored > 0 ? String(summary.countriesExplored) : yearSpanLabel}
        />
        <StatCard
          label={summary.countriesExplored > 0 ? 'Year span' : 'Decades covered'}
          value={
            summary.countriesExplored > 0
              ? yearSpanLabel
              : String(new Set(decades.map((d) => d.label)).size)
          }
        />
      </div>

      {/* Monthly activity */}
      {months.length > 1 && (
        <div style={{ marginBottom: 32 }}>
          <Section title="Activity over time">
            <ActivityChart months={months} />
          </Section>
        </div>
      )}

      {/* Decade / genre / country breakdown */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${breakdownCols}, 1fr)`,
          gap: 24,
          marginBottom: 32,
        }}
      >
        <Section title="By decade">
          <BarChart items={decades} maxCount={maxDecade} />
        </Section>

        {genres.length > 0 && (
          <Section title="Top genres">
            <BarChart items={genres} maxCount={maxGenre} />
          </Section>
        )}

        {countries.length > 0 && (
          <Section title="By country">
            <BarChart items={countries} maxCount={maxCountry} />
          </Section>
        )}
      </div>

      {/* Top artists — always shown; most interesting when some artists appear multiple times */}
      {topArtists.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <Section title="Top artists">
            <BarChart items={topArtists} maxCount={maxArtist} />
          </Section>
        </div>
      )}

      {/* Gap observations */}
      {gaps.length > 0 && (
        <div
          style={{
            padding: '14px 16px',
            background: 'var(--surface2)',
            borderRadius: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: 'var(--muted)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            Observations
          </div>
          {gaps.map((observation) => (
            <p
              key={observation}
              style={{
                fontSize: 12,
                color: 'var(--muted)',
                fontStyle: 'italic',
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              {observation}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
