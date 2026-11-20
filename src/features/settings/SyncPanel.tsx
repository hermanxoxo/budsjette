import { useId, useState } from 'react';
import { AlertTriangle, Cloud, CloudOff, LogIn, LogOut, RefreshCw } from 'lucide-react';
import { useCloudSync, type SyncStatus } from '@/state/CloudSync';
import { Button, Field, TextInput, cx } from '@/ui/primitives';
import { useToast } from '@/ui/Toast';

const STATUS_TEXT: Record<SyncStatus, string> = {
  disabled: 'Ikke satt opp',
  signedOut: 'Ikke logget inn',
  syncing: 'Synkroniserer …',
  synced: 'Synkronisert',
  offline: 'Frakoblet – synker når nettet er tilbake',
  error: 'Synkronisering feilet',
};

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
  return sameDay ? `i dag ${time}` : `${d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })} ${time}`;
}

/** Innlogging og status for synkronisering mellom enheter. */
export function SyncPanel({ compact = false }: { compact?: boolean }) {
  const sync = useCloudSync();
  const toast = useToast();
  const ids = useId();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!sync.configured) {
    return (
      <p className="rounded-xl border border-line bg-surface2 p-3 text-xs leading-relaxed text-muted">
        Synkronisering er ikke satt opp i denne versjonen av appen. Dataene lagres bare i denne
        nettleseren.
      </p>
    );
  }

  if (sync.status === 'signedOut') {
    return (
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!email.trim() || !password) {
            setFormError('Fyll inn e-post og passord.');
            return;
          }
          setBusy(true);
          setFormError(null);
          try {
            await sync.signIn(email, password);
            setPassword('');
            toast.success('Logget inn. Dataene synkroniseres nå.');
          } catch (err) {
            setFormError(err instanceof Error ? err.message : 'Innlogging feilet.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {!compact && (
          <p className="text-xs leading-relaxed text-muted">
            Logg inn for å få de samme føringene på mobil og PC. Det som ligger på denne enheten,
            slås sammen med det som ligger i skyen – ingenting overskrives.
          </p>
        )}
        <Field label="E-post" htmlFor={`${ids}-email`}>
          <TextInput
            id={`${ids}-email`}
            type="email"
            autoComplete="username"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Passord" htmlFor={`${ids}-pw`} error={formError ?? undefined}>
          <TextInput
            id={`${ids}-pw`}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" icon={LogIn} loading={busy} fullWidth>
          Logg inn og synkroniser
        </Button>
      </form>
    );
  }

  const tone =
    sync.status === 'error' ? 'text-danger' : sync.status === 'offline' ? 'text-warning' : 'text-positive';
  const StatusIcon = sync.status === 'error' ? AlertTriangle : sync.status === 'offline' ? CloudOff : Cloud;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 rounded-xl border border-line bg-surface2 p-3">
        <StatusIcon className={cx('mt-0.5 h-5 w-5 shrink-0', tone)} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink" aria-live="polite">
            {STATUS_TEXT[sync.status]}
            {sync.status === 'synced' && sync.lastSyncedAt && (
              <span className="text-muted"> · {formatTime(sync.lastSyncedAt)}</span>
            )}
          </p>
          <p className="truncate text-xs text-muted">{sync.email}</p>
          {sync.error && <p className="mt-1 text-xs text-danger">{sync.error}</p>}
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={RefreshCw}
          loading={sync.status === 'syncing'}
          onClick={sync.syncNow}
        >
          Synkroniser nå
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={LogOut}
          onClick={async () => {
            await sync.signOut();
            toast.success('Logget ut. Dataene ligger fortsatt på denne enheten.');
          }}
        >
          Logg ut
        </Button>
      </div>
    </div>
  );
}
