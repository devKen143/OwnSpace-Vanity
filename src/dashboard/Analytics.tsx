import { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { supabase } from '../lib/supabase';

type Range = '24h' | '7d' | '30d' | 'all';
interface RankedItem {
  id: string;
  label: string;
  clicks: number;
}
interface AnalyticsData {
  range: Range;
  bucket: 'hour' | 'day' | 'month';
  views: number;
  clicks: number;
  ctr: number;
  series: { at: string; views: number }[];
  devices: { device: string; views: number }[];
  top_links: RankedItem[];
  top_socials: RankedItem[];
}

function Ranking({ title, items }: { title: string; items: RankedItem[] }) {
  return (
    <section className="dashboard-card">
      <h2>{title}</h2>
      {items.length ? (
        <ol className="ranking-list">
          {items.map((item, index) => (
            <li key={item.id}>
              <span className="rank-number">{index + 1}</span>
              <span>{item.label}</span>
              <strong>
                {item.clicks.toLocaleString()} <small>clicks</small>
              </strong>
            </li>
          ))}
        </ol>
      ) : (
        <p className="analytics-empty">No clicks in this range yet.</p>
      )}
    </section>
  );
}

export default function Analytics() {
  const [range, setRange] = useState<Range>('7d');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setData(null);
    async function load() {
      try {
        const { data, error } = await supabase!.rpc('get_analytics', { p_range: range });
        if (error) throw error;
        if (active) setData(data as AnalyticsData);
      } catch {
        if (active)
          setError(
            'Analytics could not load. Check your connection and that migration 003_analytics_settings.sql is applied.',
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [range, attempt]);

  function dateLabel(value: string) {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: 'UTC',
      ...(data?.bucket === 'hour'
        ? { hour: 'numeric' as const }
        : data?.bucket === 'month'
          ? { month: 'short' as const, year: '2-digit' as const }
          : { month: 'short' as const, day: 'numeric' as const }),
    }).format(new Date(value));
  }

  return (
    <>
      <div className="page-heading heading-with-action">
        <div>
          <span className="eyebrow">SEE YOUR SPACE GROW</span>
          <h1>Analytics</h1>
          <p>A closer look at how people explore your world.</p>
        </div>
        <div className="range-tabs" role="group" aria-label="Analytics range">
          {(['24h', '7d', '30d', 'all'] as const).map((value) => (
            <button key={value} aria-pressed={range === value} onClick={() => setRange(value)}>
              {value === 'all' ? 'All time' : value}
            </button>
          ))}
        </div>
      </div>
      {loading && (
        <p role="status" className="dashboard-card">
          Loading analytics…
        </p>
      )}
      {error && (
        <div className="dashboard-card" role="alert">
          <p className="error">{error}</p>
          <button className="secondary-button" onClick={() => setAttempt((value) => value + 1)}>
            Try again
          </button>
        </div>
      )}
      {!loading && data && (
        <>
          <div className="stats-grid analytics-kpis">
            <section className="dashboard-card">
              <span>Views</span>
              <strong>{data.views.toLocaleString()}</strong>
              <small>Page visits in this range</small>
            </section>
            <section className="dashboard-card">
              <span>Clicks</span>
              <strong>{data.clicks.toLocaleString()}</strong>
              <small>Links and social interactions</small>
            </section>
            <section className="dashboard-card">
              <span>CTR</span>
              <strong>{data.ctr.toLocaleString(undefined, { maximumFractionDigits: 2 })}%</strong>
              <small>Clicks ÷ views × 100</small>
            </section>
          </div>
          <p className="editor-hint analytics-note">
            Visits are not unique visitors. Multiple clicks per visit can make CTR exceed 100%.
            Times are UTC; ranges are rolling.
          </p>
          <section className="dashboard-card chart-card">
            <h2>Views over time</h2>
            {!data.views ? (
              <p className="analytics-empty">
                No views in this range yet. Share your profile link to get started.
              </p>
            ) : (
              <>
                <div
                  className="analytics-chart"
                  role="img"
                  aria-label={`${data.views} views over the selected range. Data table follows.`}
                >
                  <ResponsiveContainer
                    width="100%"
                    height="100%"
                    minWidth={0}
                    initialDimension={{ width: 700, height: 280 }}
                  >
                    <LineChart
                      data={data.series}
                      margin={{ top: 20, right: 18, left: 0, bottom: 8 }}
                      accessibilityLayer
                    >
                      <CartesianGrid stroke="#303b34" strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="at"
                        tickFormatter={dateLabel}
                        stroke="#a0aca3"
                        fontSize={11}
                        minTickGap={40}
                      />
                      <YAxis allowDecimals={false} stroke="#a0aca3" fontSize={11} width={35} />
                      <Tooltip
                        labelFormatter={(label) => `${dateLabel(String(label))} UTC`}
                        contentStyle={{
                          background: '#1a201d',
                          borderColor: '#445441',
                          color: '#edf2eb',
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="views"
                        name="Views"
                        stroke="#c4dda4"
                        strokeWidth={3}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <details className="chart-data">
                  <summary>View chart data</summary>
                  <div className="chart-table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Time (UTC)</th>
                          <th>Views</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.series.map((point) => (
                          <tr key={point.at}>
                            <td>
                              {new Date(point.at).toISOString().replace('T', ' ').slice(0, 16)}
                            </td>
                            <td>{point.views}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </>
            )}
          </section>
          <section className="dashboard-card devices-card">
            <h2>Devices</h2>
            {data.devices.length ? (
              <div className="device-list">
                {data.devices.map((device) => {
                  const percent = data.views ? (device.views / data.views) * 100 : 0;
                  return (
                    <div key={device.device}>
                      <div className="device-label">
                        <span>{device.device}</span>
                        <span>
                          {device.views.toLocaleString()} · {Math.round(percent)}%
                        </span>
                      </div>
                      <div
                        className="device-track"
                        role="meter"
                        aria-label={`${device.device} share`}
                        aria-valuenow={Math.round(percent)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <span style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="analytics-empty">Device information appears after your first visit.</p>
            )}
          </section>
          <div className="ranking-grid">
            <Ranking title="Top links" items={data.top_links} />
            <Ranking title="Top socials" items={data.top_socials} />
          </div>
        </>
      )}
    </>
  );
}
