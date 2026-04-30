import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { LoadingInline } from './LoadingSpinner';

const getBaseUrl = () => {
  const url = import.meta.env.VITE_API_BASE_URL;
  if (url) return url.replace(/\/$/, '');
  return '';
};

function Badge({ children, className = '' }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${className}`}>
      {children}
    </span>
  );
}

export default function CaseExtractionsTab({ caseId }) {
  const { token } = useAuth();
  const { success, error } = useToast();
  const base = getBaseUrl();

  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [needsOnly, setNeedsOnly] = useState(false);
  const [extractions, setExtractions] = useState([]);
  const [findings, setFindings] = useState([]);
  const [billingLines, setBillingLines] = useState([]);

  const load = useCallback(async () => {
    if (!token || !caseId) return;
    setLoading(true);
    setLoadErr('');
    const q = needsOnly ? '&needs_review=1' : '';
    try {
      const [eRes, fRes, bRes] = await Promise.all([
        fetch(`${base}/api/cases/${caseId}/document-extractions?${q}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${base}/api/cases/${caseId}/injury-findings?${q}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${base}/api/cases/${caseId}/billing-lines?${q}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const eJson = await eRes.json().catch(() => ({}));
      const fJson = await fRes.json().catch(() => ({}));
      const bJson = await bRes.json().catch(() => ({}));
      if (!eRes.ok) throw new Error(eJson.error || 'Failed to load extractions');
      setExtractions(Array.isArray(eJson.extractions) ? eJson.extractions : []);
      setFindings(Array.isArray(fJson.findings) ? fJson.findings : []);
      setBillingLines(Array.isArray(bJson.billing_lines) ? bJson.billing_lines : []);
    } catch (err) {
      setLoadErr(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [base, caseId, token, needsOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const patchExtraction = async (row, status) => {
    try {
      const res = await fetch(`${base}/api/document-extractions/${row.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ case_id: caseId, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Update failed');
      success('Updated', `Extraction marked ${status}.`);
      await load();
    } catch (err) {
      error(err.message || 'Update failed');
    }
  };

  const patchFinding = async (row, status) => {
    try {
      const res = await fetch(`${base}/api/injury-findings/${row.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ case_id: caseId, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Update failed');
      success('Updated', `Finding marked ${status}.`);
      await load();
    } catch (err) {
      error(err.message || 'Update failed');
    }
  };

  const promoteFinding = async (row) => {
    try {
      const res = await fetch(`${base}/api/cases/${caseId}/injury-findings/${row.id}/promote-to-injury`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Promote failed');
      success('Injury created', `Linked to injury record #${data.injuryId}.`);
      await load();
    } catch (err) {
      error(err.message || 'Promote failed');
    }
  };

  const patchBilling = async (row, status) => {
    try {
      const res = await fetch(`${base}/api/billing-lines/${row.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ case_id: caseId, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Update failed');
      success('Updated', `Billing line marked ${status}.`);
      await load();
    } catch (err) {
      error(err.message || 'Update failed');
    }
  };

  const importBilling = async (row) => {
    try {
      const res = await fetch(`${base}/api/cases/${caseId}/billing-lines/${row.id}/import-to-visit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.message || 'Import failed');
      success('Visit created', `Medical visit #${data.visitId} created from billing line.`);
      await load();
    } catch (err) {
      error(err.message || 'Import failed');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">AI extractions & review</h2>
          <p className="text-sm text-gray-600 mt-1">
            Document payloads, injury findings, and billing lines created from uploads or quick capture. Approve before
            they feed the demand letter.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={needsOnly} onChange={(e) => setNeedsOnly(e.target.checked)} />
          Needs review only (confidence &lt; 60, draft)
        </label>
      </div>

      {loading ? (
        <LoadingInline message="Loading extractions…" />
      ) : null}
      {loadErr ? <div className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{loadErr}</div> : null}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Document extractions</h3>
        {extractions.length === 0 ? (
          <p className="text-sm text-gray-500">No rows yet. Upload a staff document with AI metadata to populate.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {extractions.map((row) => (
              <li key={row.id} className="p-3 flex flex-wrap items-start justify-between gap-2 text-sm">
                <div>
                  <span className="font-medium text-gray-900">{row.extraction_type}</span>
                  <span className="text-gray-500"> · doc #{row.document_id}</span>
                  {row.needs_review ? (
                    <Badge className="ml-2 bg-amber-100 text-amber-900 border border-amber-200">Low confidence</Badge>
                  ) : null}
                  <p className="text-xs text-gray-500 mt-1">Confidence {row.confidence}% · {row.status}</p>
                </div>
                {row.status === 'draft' ? (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => patchExtraction(row, 'approved')}
                      className="px-2 py-1 text-xs font-semibold rounded bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => patchExtraction(row, 'rejected')}
                      className="px-2 py-1 text-xs font-semibold rounded bg-gray-200 text-gray-800 hover:bg-gray-300"
                    >
                      Reject
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Injury findings</h3>
        {findings.length === 0 ? (
          <p className="text-sm text-gray-500">No draft findings. Upload MRI / records or use Injuries → Save as draft findings.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {findings.map((row) => (
              <li key={row.id} className="p-3 space-y-2 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <span className="font-medium text-gray-900">{row.finding_type}</span>
                    {row.spine_level ? <span className="text-gray-700"> · {row.spine_level}</span> : null}
                    {row.size_mm != null ? <span className="text-gray-600"> · {row.size_mm} mm</span> : null}
                    {Number(row.nerve_impingement) ? (
                      <Badge className="ml-2 bg-violet-100 text-violet-900 border border-violet-200">Nerve</Badge>
                    ) : null}
                    {row.needs_review ? (
                      <Badge className="ml-2 bg-amber-100 text-amber-900 border border-amber-200">Low confidence</Badge>
                    ) : null}
                    <p className="text-gray-600 mt-1">{row.narrative || '—'}</p>
                    <p className="text-xs text-gray-500">Confidence {row.confidence}% · {row.status}</p>
                  </div>
                  {row.status === 'draft' ? (
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => patchFinding(row, 'approved')}
                        className="px-2 py-1 text-xs font-semibold rounded bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => promoteFinding(row)}
                        className="px-2 py-1 text-xs font-semibold rounded bg-sky-600 text-white hover:bg-sky-700"
                      >
                        Promote to injury
                      </button>
                      <button
                        type="button"
                        onClick={() => patchFinding(row, 'rejected')}
                        className="px-2 py-1 text-xs font-semibold rounded bg-gray-200 text-gray-800 hover:bg-gray-300"
                      >
                        Reject
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Billing lines (extracted)</h3>
        {billingLines.length === 0 ? (
          <p className="text-sm text-gray-500">No billing lines from visit extraction yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {billingLines.map((row) => (
              <li key={row.id} className="p-3 flex flex-wrap items-start justify-between gap-2 text-sm">
                <div>
                  <span className="font-medium text-gray-900">{formatCurrency(row.line_total)}</span>
                  <span className="text-gray-600"> · {row.provider_name_raw || 'Provider unknown'}</span>
                  {row.service_date ? <span className="text-gray-500"> · {row.service_date}</span> : null}
                  {row.needs_review ? (
                    <Badge className="ml-2 bg-amber-100 text-amber-900 border border-amber-200">Low confidence</Badge>
                  ) : null}
                  <p className="text-xs text-gray-500 mt-1">{row.status}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {row.status === 'draft' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => patchBilling(row, 'approved')}
                        className="px-2 py-1 text-xs font-semibold rounded bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => patchBilling(row, 'rejected')}
                        className="px-2 py-1 text-xs font-semibold rounded bg-gray-200 text-gray-800 hover:bg-gray-300"
                      >
                        Reject
                      </button>
                    </>
                  ) : null}
                  {row.status === 'approved' ? (
                    <button
                      type="button"
                      onClick={() => importBilling(row)}
                      className="px-2 py-1 text-xs font-semibold rounded bg-indigo-600 text-white hover:bg-indigo-700"
                    >
                      Import to visit
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function formatCurrency(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `$${n.toLocaleString()}`;
}
