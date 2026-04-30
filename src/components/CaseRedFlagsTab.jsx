import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { RedFlagBadge } from './RedFlagBadge';
import { LoadingInline } from './LoadingSpinner';

const getBaseUrl = () => {
  const url = import.meta.env.VITE_API_BASE_URL;
  if (url) return url.replace(/\/$/, '');
  return '';
};

function getRiskBarStyle(riskScore) {
  if (riskScore < 50) return { colorClass: 'bg-green-500', labelClass: 'text-green-700' };
  if (riskScore < 100) return { colorClass: 'bg-amber-500', labelClass: 'text-amber-700' };
  if (riskScore < 150) return { colorClass: 'bg-orange-500', labelClass: 'text-orange-700' };
  return { colorClass: 'bg-red-600', labelClass: 'text-red-700' };
}

const FLAG_TYPE_LABELS = {
  missing_docs: 'Missing Document',
  inconsistent_dates: 'Inconsistent Dates',
  treatment_gap: 'Treatment Gap',
  coverage_gap: 'Coverage Gap',
  low_policy_limit: 'Low Policy Limit',
};

function formatFlagTypeLabel(flagType) {
  const key = String(flagType || '').trim().toLowerCase();
  if (!key) return 'Flag';
  if (FLAG_TYPE_LABELS[key]) return FLAG_TYPE_LABELS[key];
  return key
    .replace(/_/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export default function CaseRedFlagsTab({
  caseId,
  apiPrefix = '/api',
  token: tokenOverride,
}) {
  const { token } = useAuth();
  const authToken = tokenOverride || token;
  const [flags, setFlags] = useState([]);
  const [riskScore, setRiskScore] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchRedFlags = async () => {
    try {
      setLoading(true);
      setError('');
      const base = getBaseUrl();
      const res = await fetch(`${base}${apiPrefix}/cases/${caseId}/red-flags`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load red flags');

      setFlags(Array.isArray(data.flags) ? data.flags : []);
      setRiskScore(Number(data.riskScore || 0));
    } catch (err) {
      console.error('Error loading red flags:', err);
      setError(err.message || 'Failed to load red flags');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRedFlags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const flagsBySeverity = useMemo(() => {
    const openFlags = flags.filter((f) => String(f.resolved_status || 'open') !== 'resolved');
    const grouped = { high: [], medium: [], low: [], other: [] };
    for (const flag of openFlags) {
      const severity = String(flag.severity || '').toLowerCase();
      if (severity === 'high') grouped.high.push(flag);
      else if (severity === 'medium') grouped.medium.push(flag);
      else if (severity === 'low') grouped.low.push(flag);
      else grouped.other.push(flag);
    }
    return grouped;
  }, [flags]);

  const resolvedFlags = useMemo(
    () => flags.filter((f) => String(f.resolved_status || '').toLowerCase() === 'resolved'),
    [flags]
  );

  const handleResolve = async (flagId) => {
    try {
      const base = getBaseUrl();
      const res = await fetch(`${base}${apiPrefix}/red-flags/${flagId}/resolve`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ resolved_status: 'resolved' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to resolve flag');
      await fetchRedFlags();
    } catch (err) {
      console.error('Error resolving red flag:', err);
      alert(err.message || 'Failed to resolve flag');
    }
  };

  const normalizedRiskScore = Math.max(0, Math.min(200, Number(riskScore || 0)));
  const riskPct = Math.round((normalizedRiskScore / 200) * 100);
  const riskStyle = getRiskBarStyle(normalizedRiskScore);

  return (
    <div className="p-4 sm:p-5 space-y-4">
      <div className="bg-slate-50/85 rounded-xl p-3.5">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-gray-900">Risk Score</div>
          <div className={`text-sm font-bold ${riskStyle.labelClass}`}>{normalizedRiskScore}/200</div>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div className={`h-3 ${riskStyle.colorClass}`} style={{ width: `${riskPct}%` }} />
        </div>
        <div className="mt-2 text-xs text-gray-600">
          Green &lt; 50, Yellow 50–100, Orange 100–150, Red &gt; 150
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 rounded px-4 py-2 ring-1 ring-red-200/70">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-4">
          <LoadingInline message="Loading red flags…" />
        </div>
      ) : flags.length === 0 ? (
        <div className="text-sm text-gray-600">No red flags detected.</div>
      ) : (
        <div className="space-y-6">
          {(['high', 'medium', 'low', 'other']).map((severity) => {
            const list = flagsBySeverity[severity];
            if (!list || list.length === 0) return null;

            const severityLabel = severity === 'other' ? 'Other' : severity;

            return (
              <div key={severity}>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold text-gray-900 capitalize">{severityLabel}</div>
                  {severity !== 'other' && <RedFlagBadge severity={severity} count={list.length} />}
                </div>

                <div className="space-y-3">
                  {list.map((flag) => (
                    <div
                      key={flag.id}
                      className="rounded-xl p-3.5 bg-white flex flex-col gap-3 shadow-sm ring-1 ring-slate-100/90"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <RedFlagBadge severity={flag.severity} />
                            <div className="text-sm font-semibold text-gray-900">{formatFlagTypeLabel(flag.flag_type)}</div>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {flag.detected_at ? new Date(flag.detected_at).toLocaleString() : '—'} •{' '}
                            {String(flag.resolved_status || 'open').toUpperCase()}
                          </div>
                        </div>

                        {flag.resolved_status !== 'resolved' && (
                          <button
                            type="button"
                            onClick={() => handleResolve(flag.id)}
                            className="px-3 py-2 text-sm font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-800"
                          >
                            Mark Resolved
                          </button>
                        )}
                      </div>

                      {flag.explanation && (
                        <div className="text-sm text-gray-700 whitespace-pre-wrap">{flag.explanation}</div>
                      )}
                      {flag.recommended_action && (
                        <div className="text-sm text-gray-700">
                          <span className="font-semibold">Recommended action: </span>
                          {flag.recommended_action}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {resolvedFlags.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-gray-900">Resolved</div>
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-slate-100 text-slate-700">
                  {resolvedFlags.length}
                </span>
              </div>
              <div className="space-y-3">
                {resolvedFlags.map((flag) => (
                  <div
                    key={flag.id}
                    className="rounded-xl p-3.5 bg-slate-50/70 flex flex-col gap-3 ring-1 ring-slate-200/70"
                  >
                    <div className="flex items-center gap-2">
                      <RedFlagBadge severity={flag.severity} />
                      <div className="text-sm font-semibold text-gray-900">{formatFlagTypeLabel(flag.flag_type)}</div>
                    </div>
                    <div className="text-xs text-gray-500">
                      {flag.detected_at ? new Date(flag.detected_at).toLocaleString() : '—'} • RESOLVED
                    </div>
                    {flag.explanation && (
                      <div className="text-sm text-gray-700 whitespace-pre-wrap">{flag.explanation}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

