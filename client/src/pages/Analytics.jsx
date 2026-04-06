import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Bar,
  BarChart,
  Area,
  AreaChart,
} from 'recharts';
import { useToast } from '../components/ui/ToastProvider';
import { useAuth } from '../features/auth/AuthContext';
import { api } from '../lib/api';

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function toCsv(rows) {
  if (!rows || rows.length === 0) {
    return '';
  }

  const headers = Object.keys(rows[0]);
  const escape = (value) => {
    const text = String(value ?? '');
    if (text.includes('"') || text.includes(',') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const lines = [headers.join(',')];
  rows.forEach((row) => {
    lines.push(headers.map((header) => escape(row[header])).join(','));
  });

  return lines.join('\n');
}

function downloadCsv(filename, rows) {
  const csv = toCsv(rows);
  if (!csv) {
    return false;
  }

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.setAttribute('download', filename);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
  return true;
}

function downloadJson(filename, payload) {
  const json = JSON.stringify(payload, null, 2);
  if (!json) {
    return false;
  }

  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.setAttribute('download', filename);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
  return true;
}

function StatCard({ label, value, detail }) {
  return (
    <article className="card stat-card summary-card">
      <p className="muted">{label}</p>
      <h3>{value}</h3>
      <p className="card-subtitle">{detail}</p>
    </article>
  );
}

export default function Analytics() {
  const { getAccessToken } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [months, setMonths] = useState(6);
  const [analytics, setAnalytics] = useState({
    collectionEfficiencyTrend: [],
    riskMigrationTrend: [],
    segmentPerformanceTrend: [],
    generatedAt: null,
  });

  async function loadAnalytics(nextMonths = months) {
    setLoading(true);
    setError('');

    try {
      const token = await getAccessToken();
      const payload = await api.getAnalytics(token, { months: nextMonths });
      setAnalytics(payload.data || {});
    } catch (nextError) {
      setError(nextError.message || 'Unable to load analytics trends.');
      toast.error(nextError.message || 'Unable to load analytics trends.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAnalytics().catch(console.error);
  }, [getAccessToken, months]);

  const summary = useMemo(() => {
    const collectionRows = analytics.collectionEfficiencyTrend || [];
    const riskRows = analytics.riskMigrationTrend || [];
    const segmentRows = analytics.segmentPerformanceTrend || [];

    const totalInvoiced = collectionRows.reduce((sum, row) => sum + Number(row.invoiced || 0), 0);
    const totalCollected = collectionRows.reduce((sum, row) => sum + Number(row.collected || 0), 0);
    const avgEfficiency = collectionRows.length
      ? collectionRows.reduce((sum, row) => sum + Number(row.efficiency || 0), 0) / collectionRows.length
      : 0;

    const latestRisk = riskRows[riskRows.length - 1] || { low: 0, medium: 0, high: 0 };

    const segmentRevenue = segmentRows.reduce(
      (accumulator, row) => {
        accumulator.vip += Number(row.vipRevenue || 0);
        accumulator.watchlist += Number(row.watchlistRevenue || 0);
        accumulator.standard += Number(row.standardRevenue || 0);
        return accumulator;
      },
      { vip: 0, watchlist: 0, standard: 0 }
    );

    return {
      totalInvoiced,
      totalCollected,
      avgEfficiency,
      latestRisk,
      segmentRevenue,
    };
  }, [analytics]);

  const segmentRevenueData = useMemo(
    () => [
      { name: 'VIP', value: Number(summary.segmentRevenue.vip.toFixed(2)) },
      { name: 'Watchlist', value: Number(summary.segmentRevenue.watchlist.toFixed(2)) },
      { name: 'Standard', value: Number(summary.segmentRevenue.standard.toFixed(2)) },
    ],
    [summary.segmentRevenue]
  );

  function timestampToken() {
    const source = analytics.generatedAt ? new Date(analytics.generatedAt) : new Date();
    return source.toISOString().slice(0, 10);
  }

  function handleExportDataset(datasetKey, datasetLabel) {
    const rows = analytics[datasetKey] || [];
    const fileDate = timestampToken();
    const filename = `analytics-${datasetLabel}-${months}m-${fileDate}.csv`;

    const ok = downloadCsv(filename, rows);
    if (!ok) {
      toast.info(`No ${datasetLabel} data available for export.`);
      return;
    }

    toast.success(`${datasetLabel} CSV downloaded.`);
  }

  function handleExportAll() {
    const fileDate = timestampToken();
    const exports = [
      ['collectionEfficiencyTrend', 'collection-efficiency'],
      ['riskMigrationTrend', 'risk-migration'],
      ['segmentPerformanceTrend', 'segment-performance'],
    ];

    const completed = exports.reduce((count, [key, label]) => {
      const ok = downloadCsv(`analytics-${label}-${months}m-${fileDate}.csv`, analytics[key] || []);
      return ok ? count + 1 : count;
    }, 0);

    if (completed === 0) {
      toast.info('No analytics datasets available for export.');
      return;
    }

    toast.success(`Downloaded ${completed} analytics CSV file${completed > 1 ? 's' : ''}.`);
  }

  function handleExportJsonBundle() {
    const fileDate = timestampToken();
    const filename = `analytics-bundle-${months}m-${fileDate}.json`;

    const bundle = {
      exportedAt: new Date().toISOString(),
      sourceGeneratedAt: analytics.generatedAt || null,
      months,
      datasets: {
        collectionEfficiencyTrend: analytics.collectionEfficiencyTrend || [],
        riskMigrationTrend: analytics.riskMigrationTrend || [],
        segmentPerformanceTrend: analytics.segmentPerformanceTrend || [],
      },
    };

    const ok = downloadJson(filename, bundle);
    if (!ok) {
      toast.info('Unable to export JSON bundle.');
      return;
    }

    toast.success('Analytics JSON bundle downloaded.');
  }

  return (
    <div className="stack">
      <div className="page-title-row">
        <div>
          <h1>Analytics</h1>
          <p className="muted">Trend intelligence for collection efficiency, risk migration, and segment performance.</p>
        </div>
        <div className="inline-actions">
          <select value={months} onChange={(event) => setMonths(Number(event.target.value))}>
            <option value={3}>Last 3 months</option>
            <option value={6}>Last 6 months</option>
            <option value={12}>Last 12 months</option>
            <option value={24}>Last 24 months</option>
          </select>
          <button type="button" className="btn btn-outline" onClick={() => loadAnalytics(months)} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error ? <p className="status">{error}</p> : null}

      <section className="grid grid-3">
        <StatCard
          label="Total invoiced"
          value={money(summary.totalInvoiced)}
          detail={`Across last ${months} months`}
        />
        <StatCard
          label="Total collected"
          value={money(summary.totalCollected)}
          detail={`${summary.totalInvoiced > 0 ? `${((summary.totalCollected / summary.totalInvoiced) * 100).toFixed(1)}%` : '0.0%'} realization`}
        />
        <StatCard
          label="Average efficiency"
          value={`${summary.avgEfficiency.toFixed(1)}%`}
          detail="Monthly average collection efficiency"
        />
      </section>

      <section className="card">
        <div className="card-header card-header-tight">
          <div>
            <h2>Export Panel</h2>
            <p className="card-subtitle">Download analytics datasets as CSV for finance and leadership reporting.</p>
          </div>
        </div>
        <div className="inline-actions">
          <button
            type="button"
            className="btn btn-outline btn-small"
            onClick={() => handleExportDataset('collectionEfficiencyTrend', 'collection-efficiency')}
          >
            Export Collection Efficiency CSV
          </button>
          <button
            type="button"
            className="btn btn-outline btn-small"
            onClick={() => handleExportDataset('riskMigrationTrend', 'risk-migration')}
          >
            Export Risk Migration CSV
          </button>
          <button
            type="button"
            className="btn btn-outline btn-small"
            onClick={() => handleExportDataset('segmentPerformanceTrend', 'segment-performance')}
          >
            Export Segment Performance CSV
          </button>
          <button type="button" className="btn btn-small" onClick={handleExportAll}>
            Export All Datasets
          </button>
          <button type="button" className="btn btn-small" onClick={handleExportJsonBundle}>
            Download JSON Bundle
          </button>
        </div>
      </section>

      <section className="card">
        <div className="card-header card-header-tight">
          <div>
            <h2>Collection Efficiency Trend</h2>
            <p className="card-subtitle">Invoiced vs collected amount and efficiency over time</p>
          </div>
        </div>
        <div className="chart-wrap analytics-chart-wrap">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={analytics.collectionEfficiencyTrend || []}>
              <CartesianGrid strokeDasharray="4 4" stroke="#d1d5db" />
              <XAxis dataKey="month" />
              <YAxis yAxisId="money" />
              <YAxis yAxisId="efficiency" orientation="right" domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Line yAxisId="money" type="monotone" dataKey="invoiced" stroke="#2563eb" strokeWidth={2} dot={false} />
              <Line yAxisId="money" type="monotone" dataKey="collected" stroke="#16a34a" strokeWidth={2} dot={false} />
              <Line yAxisId="efficiency" type="monotone" dataKey="efficiency" stroke="#ea580c" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid grid-3 analytics-grid">
        <article className="card">
          <div className="card-header card-header-tight">
            <div>
              <h2>Risk Migration Trend</h2>
              <p className="card-subtitle">Monthly invoice risk mix by low, medium, and high exposure</p>
            </div>
          </div>
          <div className="chart-wrap analytics-chart-wrap-sm">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={analytics.riskMigrationTrend || []}>
                <CartesianGrid strokeDasharray="4 4" stroke="#d1d5db" />
                <XAxis dataKey="month" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="low" stackId="risk" stroke="#16a34a" fill="#86efac" />
                <Area type="monotone" dataKey="medium" stackId="risk" stroke="#d97706" fill="#fdba74" />
                <Area type="monotone" dataKey="high" stackId="risk" stroke="#dc2626" fill="#fca5a5" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <ul className="detail-meta-list">
            <li>
              <span>Latest low-risk</span>
              <strong>{summary.latestRisk.low || 0}</strong>
            </li>
            <li>
              <span>Latest medium-risk</span>
              <strong>{summary.latestRisk.medium || 0}</strong>
            </li>
            <li>
              <span>Latest high-risk</span>
              <strong>{summary.latestRisk.high || 0}</strong>
            </li>
          </ul>
        </article>

        <article className="card">
          <div className="card-header card-header-tight">
            <div>
              <h2>Segment Revenue Trend</h2>
              <p className="card-subtitle">Revenue momentum split by VIP, Watchlist, and Standard segments</p>
            </div>
          </div>
          <div className="chart-wrap analytics-chart-wrap-sm">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={analytics.segmentPerformanceTrend || []}>
                <CartesianGrid strokeDasharray="4 4" stroke="#d1d5db" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="vipRevenue" fill="#2563eb" />
                <Bar dataKey="watchlistRevenue" fill="#dc2626" />
                <Bar dataKey="standardRevenue" fill="#475569" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="card">
          <div className="card-header card-header-tight">
            <div>
              <h2>Segment Mix Snapshot</h2>
              <p className="card-subtitle">Total segment performance accumulation in selected period</p>
            </div>
          </div>
          <div className="chart-wrap analytics-chart-wrap-sm">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={segmentRevenueData} layout="vertical" margin={{ top: 8, right: 12, left: 20, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={80} />
                <Tooltip />
                <Bar dataKey="value" fill="#0f766e" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="detail-meta-list">
            <li>
              <span>VIP revenue</span>
              <strong>{money(summary.segmentRevenue.vip)}</strong>
            </li>
            <li>
              <span>Watchlist revenue</span>
              <strong>{money(summary.segmentRevenue.watchlist)}</strong>
            </li>
            <li>
              <span>Standard revenue</span>
              <strong>{money(summary.segmentRevenue.standard)}</strong>
            </li>
          </ul>
        </article>
      </section>
    </div>
  );
}
