import { useState } from 'react';
import { apiClient } from '../api/client';
import { Card } from '../components/ui/Card';

export default function AdminPanelPage() {
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);

  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  const handleDownloadBackup = async () => {
    setBackupError(null);
    setBackupLoading(true);
    try {
      const res = await apiClient.get<Blob>('/admin/export-backup.zip', {
        responseType: 'blob',
      });
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data as BlobPart]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `ppf-backup-${stamp}.zip`;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const res = err && typeof err === 'object' && 'response' in err ? (err as { response?: { status?: number; data?: unknown } }).response : null;
      const status = res?.status;
      let msg = 'Could not download backup.';
      if (status === 403) {
        msg = 'You must be logged in as admin to download backups.';
      } else if (status === 401) {
        msg = 'Session expired. Sign in again.';
      } else if (res?.data instanceof Blob) {
        try {
          const text = await res.data.text();
          const parsed = JSON.parse(text) as { detail?: string };
          if (typeof parsed.detail === 'string') msg = parsed.detail;
        } catch {
          /* ignore */
        }
      }
      setBackupError(msg);
    } finally {
      setBackupLoading(false);
    }
  };

  const handleResetDb = async () => {
    if (!window.confirm('Reset database? This will delete ALL tickets and approvals (B2B and B2C). Users will be kept. This cannot be undone.')) return;
    setResetting(true);
    setResetMessage(null);
    setResetError(null);
    try {
      await apiClient.post('/admin/reset-db');
      setResetMessage('Database reset complete. All tickets and approvals have been deleted.');
    } catch (err: unknown) {
      const res = err && typeof err === 'object' && 'response' in err ? (err as { response?: { status?: number; data?: { detail?: string } } }).response : null;
      const status = res?.status;
      const detail = typeof res?.data?.detail === 'string' ? res.data.detail : null;
      let msg = 'Failed to reset database.';
      if (status === 404) {
        msg = 'Reset endpoint not found. Restart the backend server so it loads the latest code (POST /admin/reset-db).';
      } else if (detail) {
        msg = detail;
      }
      setResetError(msg);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-4 min-w-0 max-w-full">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Admin Panel</h2>
        <p className="text-sm text-gray-500">
          Configure system settings and manage database.
        </p>
      </div>
      <Card
        title="Download data backup"
        subtitle="ZIP of CSV files (all main tables). Saves to your browser’s download folder."
        className="border-l-4 border-l-indigo-400"
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            Use this for a monthly snapshot you can open in Excel or keep on Drive.{' '}
            <code className="text-xs bg-gray-100 px-1 rounded">users.csv</code> omits password hashes; for a full
            database copy use <code className="text-xs bg-gray-100 px-1 rounded">pg_dump</code> — see{' '}
            <code className="text-xs bg-gray-100 px-1 rounded">docs/SUPABASE_PG_DUMP.md</code> in the repo.
          </p>
          {backupError && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{backupError}</div>
          )}
          <button
            type="button"
            onClick={() => void handleDownloadBackup()}
            disabled={backupLoading}
            className="w-full md:w-auto rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2.5 md:py-2 text-sm font-medium text-white"
          >
            {backupLoading ? 'Preparing ZIP…' : 'Download backup (ZIP)'}
          </button>
        </div>
      </Card>

      <Card
        title="Database reset"
        subtitle="Empty all tickets and approvals (B2B and B2C). Users are kept."
        className="border-l-4 border-l-amber-400"
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            Use this to clear all rejection tickets and approval records. User accounts (admin, manager, B2B, B2C) are not deleted.
          </p>
          {resetMessage && <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">{resetMessage}</div>}
          {resetError && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{resetError}</div>}
          <button
            type="button"
            onClick={() => void handleResetDb()}
            disabled={resetting}
            className="w-full md:w-auto rounded-md bg-amber-600 hover:bg-amber-500 disabled:opacity-50 px-4 py-2.5 md:py-2 text-sm font-medium text-white"
          >
            {resetting ? 'Resetting…' : 'Reset database'}
          </button>
        </div>
      </Card>
      <Card
        title="System configuration"
        subtitle="High-level knobs that affect how rejection approvals behave"
        className="text-sm"
      >
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-sm text-gray-900">High-value alert threshold</div>
              <div className="text-xs text-gray-500">
                Amount above which managers are notified immediately.
              </div>
            </div>
            <div className="rounded-md border border-gray-200 px-3 py-2 sm:py-1 text-xs text-gray-700 bg-gray-50 w-full sm:w-auto text-center sm:text-left shrink-0">
              Coming soon
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-sm text-gray-900">Notifications</div>
              <div className="text-xs text-gray-500">
                Email / WhatsApp channels for manager alerts.
              </div>
            </div>
            <div className="rounded-md border border-gray-200 px-3 py-2 sm:py-1 text-xs text-gray-700 bg-gray-50 w-full sm:w-auto text-center sm:text-left shrink-0">
              Coming soon
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

