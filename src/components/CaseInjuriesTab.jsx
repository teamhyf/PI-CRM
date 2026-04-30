import { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { parseQuickInjuryInput } from '../utils/injuryQuickCapture';

const getBaseUrl = () => {
  const url = import.meta.env.VITE_API_BASE_URL;
  if (url) return url.replace(/\/$/, '');
  return '';
};

export default function CaseInjuriesTab({ caseId, injuries, onChanged }) {
  const { token } = useAuth();
  const [form, setForm] = useState({
    bodyPart: 'neck',
    symptomType: 'pain',
    severityLevel: 'mild',
    firstReportedDate: '',
    ongoing: true,
    priorSimilarInjury: false,
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [quickInput, setQuickInput] = useState('');
  const [listening, setListening] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const recognitionRef = useRef(null);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const base = getBaseUrl();
      const res = await fetch(`${base}/api/cases/${caseId}/injuries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create injury');
      }
      setForm({
        bodyPart: 'neck',
        symptomType: 'pain',
        severityLevel: 'mild',
        firstReportedDate: '',
        ongoing: true,
        priorSimilarInjury: false,
        notes: '',
      });
      onChanged?.();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to create injury');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this injury?')) return;
    try {
      const base = getBaseUrl();
      const res = await fetch(`${base}/api/cases/${caseId}/injuries/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete injury');
      }
      onChanged?.();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to delete injury');
    }
  };

  const applyQuickInput = () => {
    const parsed = parseQuickInjuryInput(quickInput, form);
    if (!parsed) return;
    setForm(parsed);
  };

  const saveQuickInputAsDraftFindings = async () => {
    const text = String(quickInput || '').trim();
    if (!text) {
      setError('Enter text in quick capture first.');
      return;
    }
    setDraftSaving(true);
    setError('');
    try {
      const base = getBaseUrl();
      const res = await fetch(`${base}/api/cases/${caseId}/injuries/quick-capture`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save draft findings');
      setQuickInput('');
      onChanged?.();
    } catch (err) {
      setError(err.message || 'Failed to save draft findings');
    } finally {
      setDraftSaving(false);
    }
  };

  const handleVoiceCapture = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Voice input is not supported in this browser.');
      return;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (_) {
        // no-op
      }
      recognitionRef.current = null;
      setListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    setListening(true);

    recognition.onresult = (event) => {
      const transcript = String(event?.results?.[0]?.[0]?.transcript || '').trim();
      if (!transcript) return;
      setQuickInput(transcript);
      const parsed = parseQuickInjuryInput(transcript, form);
      if (parsed) setForm(parsed);
    };
    recognition.onerror = () => {
      setError('Voice capture failed. Please type your injury note instead.');
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };

    recognition.start();
  };

  return (
    <div className="p-6 space-y-6">
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded px-4 py-2">
          {error}
        </div>
      )}

      <form onSubmit={handleCreate} className="bg-gray-50 rounded-lg p-4 space-y-4">
        <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-3">
          <label className="block text-sm font-medium text-gray-700">Quick injury capture (text or voice)</label>
          <div className="mt-2 flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={quickInput}
              onChange={(e) => setQuickInput(e.target.value)}
              placeholder='e.g. "Document C4-C5 herniation and flag as injury"'
              className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={applyQuickInput}
              className="px-3 py-2 text-sm font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={saveQuickInputAsDraftFindings}
              disabled={draftSaving}
              className="px-3 py-2 text-sm font-semibold rounded-md bg-violet-700 text-white hover:bg-violet-800 disabled:opacity-50"
            >
              {draftSaving ? 'Saving…' : 'Save as draft findings'}
            </button>
            <button
              type="button"
              onClick={handleVoiceCapture}
              className={`px-3 py-2 text-sm font-semibold rounded-md ${
                listening ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-slate-200 text-slate-800 hover:bg-slate-300'
              }`}
            >
              {listening ? 'Stop Mic' : 'Use Mic'}
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Apply maps into the injury form below. Save as draft findings runs the same AI pipeline as document upload;
            review and approve under Extractions &amp; AI.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Body Part</label>
            <select
              name="bodyPart"
              value={form.bodyPart}
              onChange={handleChange}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="neck">Neck</option>
              <option value="low_back">Low Back</option>
              <option value="mid_back">Mid Back</option>
              <option value="shoulder">Shoulder</option>
              <option value="knee">Knee</option>
              <option value="head">Head</option>
              <option value="wrist">Wrist</option>
              <option value="ankle">Ankle</option>
              <option value="hip">Hip</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Symptom</label>
            <select
              name="symptomType"
              value={form.symptomType}
              onChange={handleChange}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="pain">Pain</option>
              <option value="numbness">Numbness</option>
              <option value="tingling">Tingling</option>
              <option value="headaches">Headaches</option>
              <option value="weakness">Weakness</option>
              <option value="limited_motion">Limited Motion</option>
              <option value="loss_of_consciousness">Loss of Consciousness</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Severity</label>
            <select
              name="severityLevel"
              value={form.severityLevel}
              onChange={handleChange}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="mild">Mild</option>
              <option value="moderate">Moderate</option>
              <option value="severe">Severe</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">First Reported</label>
            <input
              type="date"
              name="firstReportedDate"
              value={form.firstReportedDate}
              onChange={handleChange}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex items-center gap-6">
          <label className="inline-flex items-center text-sm text-gray-700">
            <input
              type="checkbox"
              name="ongoing"
              checked={form.ongoing}
              onChange={handleChange}
              className="mr-2"
            />
            Ongoing
          </label>
          <label className="inline-flex items-center text-sm text-gray-700">
            <input
              type="checkbox"
              name="priorSimilarInjury"
              checked={form.priorSimilarInjury}
              onChange={handleChange}
              className="mr-2"
            />
            Prior similar injury
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Notes</label>
          <textarea
            name="notes"
            value={form.notes}
            onChange={handleChange}
            rows={2}
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Add Injury'}
        </button>
      </form>

      <div className="mt-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-2">Injuries</h3>
        {injuries.length === 0 ? (
          <p className="text-sm text-gray-500">No injuries recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Body Part</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Symptom</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Severity</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">First Reported</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Status</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {injuries.map((inj) => (
                  <tr key={inj.id} className="border-t">
                    <td className="px-4 py-2">{inj.body_part}</td>
                    <td className="px-4 py-2">{inj.symptom_type}</td>
                    <td className="px-4 py-2 capitalize">{inj.severity_level}</td>
                    <td className="px-4 py-2">
                      {inj.first_reported_date
                        ? new Date(inj.first_reported_date).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="px-4 py-2">
                      {inj.ongoing ? 'Ongoing' : 'Resolved'}
                      {inj.prior_similar_injury ? ' (Prior similar)' : ''}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => handleDelete(inj.id)}
                        className="text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

