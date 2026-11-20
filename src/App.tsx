import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { Transaction, TransactionKind } from '@/types';
import { useAppStore } from '@/state/AppStore';
import { AppShell } from '@/app/AppShell';
import { useHashRoute } from '@/app/router';
import { Dashboard } from '@/features/dashboard/Dashboard';
import { History } from '@/features/history/History';
import { Budget } from '@/features/budget/Budget';
import { NewPeriodSheet } from '@/features/budget/NewPeriodSheet';
import { Onboarding } from '@/features/onboarding/Onboarding';
import { SettingsSheet } from '@/features/settings/Settings';
import { TransactionSheet } from '@/features/transactions/TransactionSheet';
import { Button, LoadingState } from '@/ui/primitives';

/**
 * Analysesiden laster diagrambiblioteket. Den hentes først når fanen åpnes,
 * slik at oversikten og registrering starter raskt på mobil.
 */
const Analysis = lazy(() =>
  import('@/features/analysis/Analysis').then((m) => ({ default: m.Analysis })),
);

export function App() {
  const { data, status, error } = useAppStore();
  const { route, navigate, openNewOnLoad } = useHashRoute();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [defaultKind, setDefaultKind] = useState<TransactionKind>('expense');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newPeriodOpen, setNewPeriodOpen] = useState(false);

  const openAdd = useCallback((kind: TransactionKind = 'expense') => {
    setEditing(null);
    setDefaultKind(kind);
    setSheetOpen(true);
  }, []);

  const openEdit = useCallback((transaction: Transaction) => {
    setEditing(transaction);
    setDefaultKind(transaction.kind);
    setSheetOpen(true);
  }, []);

  /* Direktelenke til #/innstillinger åpner innstillingsarket over oversikten. */
  useEffect(() => {
    if (route === 'innstillinger') {
      setSettingsOpen(true);
      navigate('oversikt');
    }
  }, [route, navigate]);

  /* Snarveien «Ny utgift» fra hjemskjermen åpner registrering direkte. */
  useEffect(() => {
    if (openNewOnLoad && status === 'ready' && data.settings.onboarded) openAdd();
  }, [openNewOnLoad, status, data.settings.onboarded, openAdd]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <LoadingState label="Henter dataene dine …" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-danger/10">
          <AlertTriangle className="h-7 w-7 text-danger" aria-hidden />
        </span>
        <h1 className="text-xl text-ink">Kunne ikke lese lagrede data</h1>
        <p className="text-sm leading-relaxed text-muted">
          {error ?? 'Noe gikk galt.'} En kopi av de lagrede dataene er tatt vare på i nettleseren,
          slik at ingenting er tapt. Prøv å laste siden på nytt.
        </p>
        <Button icon={RefreshCw} onClick={() => window.location.reload()}>
          Last inn på nytt
        </Button>
      </div>
    );
  }

  if (!data.settings.onboarded) {
    return <Onboarding />;
  }

  return (
    <>
      <AppShell route={route} onNavigate={navigate} onAdd={() => openAdd()}>
        {route === 'oversikt' && (
          <Dashboard
            onNavigate={navigate}
            onAdd={() => openAdd()}
            onStartPeriod={() => setNewPeriodOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}
        {route === 'historikk' && <History onEdit={openEdit} />}
        {route === 'analyse' && (
          <Suspense fallback={<LoadingState label="Laster analyse …" />}>
            <Analysis />
          </Suspense>
        )}
        {route === 'budsjett' && <Budget onAddIncome={() => openAdd('income')} />}
      </AppShell>

      <TransactionSheet
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          setEditing(null);
        }}
        editing={editing}
        defaultKind={defaultKind}
      />

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <NewPeriodSheet open={newPeriodOpen} onClose={() => setNewPeriodOpen(false)} />
    </>
  );
}
