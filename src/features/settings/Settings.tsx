import { useRef, useState } from 'react';
import {
  AlertTriangle,
  FileJson,
  FileSpreadsheet,
  HardDrive,
  Info,
  Monitor,
  Moon,
  Star,
  Sun,
  Trash2,
  Upload,
} from 'lucide-react';
import type { ThemePreference } from '@/types';
import { formatOre } from '@/lib/money';
import { createInitialData, estimateStorageBytes, APP_VERSION } from '@/lib/storage';
import {
  buildExport,
  downloadTextFile,
  exportFileName,
  readFileAsText,
  transactionsToCsv,
  validateImport,
  type ValidationResult,
} from '@/lib/transfer';
import { buildDemoData } from '@/state/demo';
import { useAppStore } from '@/state/AppStore';
import { ConfirmDialog, Sheet } from '@/ui/Sheet';
import { AmountField } from '@/ui/inputs';
import { Badge, Button, Field, IconButton, SectionHeading, Segmented, Switch, cx } from '@/ui/primitives';
import { useToast } from '@/ui/Toast';
import { useCloudSync } from '@/state/CloudSync';
import { SyncPanel } from './SyncPanel';

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Lys', icon: Sun },
  { value: 'dark', label: 'Mørk', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, dispatch, adapter, saveError, flush } = useAppStore();
  const toast = useToast();
  const sync = useCloudSync();
  const signedIn = sync.configured && sync.status !== 'signedOut';
  const fileInput = useRef<HTMLInputElement>(null);

  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDemo, setConfirmDemo] = useState(false);
  const [pendingImport, setPendingImport] = useState<ValidationResult | null>(null);

  const storageKb = Math.round(estimateStorageBytes(data) / 1024);

  const handleExportJson = async () => {
    try {
      await flush();
      downloadTextFile(
        exportFileName('json'),
        JSON.stringify(buildExport(data), null, 2),
        'application/json',
      );
      toast.success('Dataene er eksportert.');
    } catch {
      toast.error('Klarte ikke lage eksportfilen.');
    }
  };

  const handleExportCsv = () => {
    if (!data.transactions.length) {
      toast.error('Ingen transaksjoner å eksportere.');
      return;
    }
    downloadTextFile(exportFileName('csv'), transactionsToCsv(data), 'text/csv');
    toast.success('Transaksjonene er eksportert til CSV.');
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const result = validateImport(JSON.parse(text));
      if (!result.ok) {
        toast.error(result.errors[0] ?? 'Filen kunne ikke leses.');
        return;
      }
      setPendingImport(result);
    } catch {
      toast.error('Filen er ikke gyldig JSON.');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <>
      <Sheet open={open} onClose={onClose} title="Innstillinger" size="lg">
        <div className="space-y-6">
          {saveError && (
            <div className="flex gap-2.5 rounded-xl border border-danger/30 bg-danger/8 p-3 text-xs text-danger">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>{saveError}</p>
            </div>
          )}

          {/* Lønn */}
          <section>
            <SectionHeading title="Lønn" />
            <div className="space-y-4">
              <Field label="Vanlig nettolønn" hint="Brukes som forslag når du starter en ny periode.">
                <AmountField
                  valueOre={data.settings.defaultNetSalaryOre}
                  label="Vanlig nettolønn"
                  onChange={(ore) => dispatch({ type: 'updateSettings', patch: { defaultNetSalaryOre: ore } })}
                />
              </Field>

              <Field label="Lønningsdag i måneden" hint="Klippes automatisk til siste dag i korte måneder.">
                <div className="grid grid-cols-7 gap-1.5">
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => dispatch({ type: 'updateSettings', patch: { payday: day } })}
                      className={cx(
                        'flex h-9 items-center justify-center rounded-lg text-sm transition',
                        data.settings.payday === day
                          ? 'bg-accent font-medium text-white'
                          : 'bg-surface2 text-muted hover:text-ink',
                      )}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </Field>

              <div className="card-flat space-y-3 p-3.5">
                <Switch
                  checked={data.settings.useFixedPayday}
                  onChange={(value) => dispatch({ type: 'updateSettings', patch: { useFixedPayday: value } })}
                  label="Fast månedlig lønningsdag"
                  description="Av: du setter faktisk lønnsdato hver gang du starter ny periode."
                />
              </div>

              <Field label="Påminnelse før lønn" hint="Antall dager før forventet lønn du vil bli minnet på ny periode.">
                <Segmented
                  options={[
                    { value: '0', label: 'Av' },
                    { value: '1', label: '1 dag' },
                    { value: '3', label: '3 dager' },
                    { value: '7', label: '7 dager' },
                  ]}
                  value={String(data.settings.paydayReminderDays)}
                  onChange={(value) =>
                    dispatch({ type: 'updateSettings', patch: { paydayReminderDays: Number(value) } })
                  }
                  size="sm"
                  label="Påminnelse før lønn"
                />
              </Field>
            </div>
          </section>

          {/* Favoritter */}
          <section>
            <SectionHeading
              title="Favoritter"
              description="Hurtigvalg øverst i registreringen. Lag nye med «Lagre som favoritt» når du registrerer."
            />
            {data.favorites.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-xs text-muted">
                Ingen favoritter ennå.
              </p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {data.favorites.map((fav) => {
                  const category = data.categories.find((c) => c.id === fav.categoryId);
                  return (
                    <li key={fav.id} className="flex items-center gap-3 py-1.5 pl-3 pr-1">
                      <Star className="h-4 w-4 shrink-0 text-warning" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-ink">{fav.label}</p>
                        <p className="truncate text-xs text-muted">
                          {[category?.name, fav.amountOre ? formatOre(fav.amountOre) : 'Beløp velges ved bruk']
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <IconButton
                        icon={Trash2}
                        tone="danger"
                        label={`Fjern favoritten ${fav.label}`}
                        onClick={() => {
                          dispatch({ type: 'deleteFavorite', id: fav.id });
                          toast.show(`«${fav.label}» er fjernet fra favoritter.`, {
                            tone: 'success',
                            action: {
                              label: 'Angre',
                              onClick: () =>
                                dispatch({
                                  type: 'addFavorite',
                                  favorite: {
                                    label: fav.label,
                                    amountOre: fav.amountOre,
                                    kind: fav.kind,
                                    categoryId: fav.categoryId,
                                    subcategoryName: fav.subcategoryName,
                                  },
                                }),
                            },
                          });
                        }}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Utseende */}
          <section>
            <SectionHeading title="Utseende" />
            <Segmented
              options={THEME_OPTIONS}
              value={data.settings.theme}
              onChange={(value) => dispatch({ type: 'updateSettings', patch: { theme: value } })}
              label="Tema"
            />
          </section>

          {/* Synkronisering */}
          {sync.configured && (
            <section>
              <SectionHeading title="Synkronisering" description="Samme føringer på mobil og PC." />
              <SyncPanel />
            </section>
          )}

          {/* Data */}
          <section>
            <SectionHeading title="Data og sikkerhetskopi" />

            <div className="mb-3 flex gap-2.5 rounded-xl border border-line bg-surface2 p-3 text-xs leading-relaxed text-muted">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
              {signedIn ? (
                <p>
                  Dataene lagres i <strong className="font-medium text-ink">denne nettleseren</strong> og
                  synkroniseres med skyen, slik at de er de samme på alle enhetene der du er logget inn.
                  Eksport er fortsatt en god ekstra sikkerhetskopi.
                </p>
              ) : (
                <p>
                  Alt lagres lokalt i <strong className="font-medium text-ink">denne nettleseren</strong>.
                  Data synkroniseres ikke mellom telefon og PC
                  {sync.configured ? ' før du logger inn under Synkronisering' : ''}. Sletter du
                  nettleserdata, eller bytter enhet, forsvinner informasjonen. Ta jevnlig
                  sikkerhetskopi med eksport.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" icon={FileJson} onClick={handleExportJson}>
                Eksporter JSON
              </Button>
              <Button variant="secondary" icon={FileSpreadsheet} onClick={handleExportCsv}>
                Eksporter CSV
              </Button>
              <Button
                variant="secondary"
                icon={Upload}
                onClick={() => fileInput.current?.click()}
                className="col-span-2"
              >
                Importer fra JSON
              </Button>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />

            <dl className="mt-3 space-y-1.5 text-xs text-muted">
              <div className="flex justify-between">
                <dt>Lagring</dt>
                <dd className="text-ink">{adapter.label}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Størrelse</dt>
                <dd className="tabular text-ink">{storageKb} kB</dd>
              </div>
              <div className="flex justify-between">
                <dt>Registreringer</dt>
                <dd className="tabular text-ink">{data.transactions.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Perioder</dt>
                <dd className="tabular text-ink">{data.periods.length}</dd>
              </div>
            </dl>
          </section>

          {/* Demo og nullstilling */}
          <section>
            <SectionHeading title="Avansert" />
            <div className="space-y-2">
              <Button
                variant="secondary"
                fullWidth
                icon={HardDrive}
                disabled={signedIn}
                onClick={() => setConfirmDemo(true)}
              >
                {data.settings.demoMode ? 'Last demodata på nytt' : 'Fyll med eksempeldata (demo)'}
              </Button>
              {signedIn && (
                <p className="px-0.5 text-xs text-faint">
                  Demodata er slått av mens du er logget inn, så eksempeltall ikke havner i skyen.
                </p>
              )}
              <Button variant="secondary" fullWidth icon={Trash2} className="text-danger" onClick={() => setConfirmReset(true)}>
                Slett alle data
              </Button>
            </div>
            {data.settings.demoMode && (
              <Badge tone="warning" className="mt-2">
                Demomodus – tallene er oppdiktede
              </Badge>
            )}
          </section>

          <p className="pb-2 text-center text-[0.7rem] text-faint">
            Budsjette {APP_VERSION} · Dataformat v{data.schemaVersion}
          </p>
        </div>
      </Sheet>

      {/* Bekreft import */}
      <ConfirmDialog
        open={Boolean(pendingImport)}
        title="Importere data?"
        tone="primary"
        confirmLabel="Erstatt alt"
        message={
          pendingImport?.stats ? (
            <>
              Filen inneholder {pendingImport.stats.transactions} registreringer,{' '}
              {pendingImport.stats.periods} perioder og {pendingImport.stats.categories} kategorier.
              <strong className="mt-2 block text-ink">
                Alt du har i appen nå blir erstattet.
              </strong>
            </>
          ) : undefined
        }
        onConfirm={() => {
          if (pendingImport?.data) {
            dispatch({ type: 'replaceData', data: pendingImport.data });
            toast.success('Dataene er importert.');
          }
          setPendingImport(null);
          onClose();
        }}
        onCancel={() => setPendingImport(null)}
      >
        {pendingImport?.warnings.length ? (
          <ul className="mt-3 space-y-1 rounded-xl border border-warning/30 bg-warning/8 p-3 text-xs text-ink">
            {pendingImport.warnings.map((warning) => (
              <li key={warning}>• {warning}</li>
            ))}
          </ul>
        ) : null}
      </ConfirmDialog>

      {/* Bekreft demo */}
      <ConfirmDialog
        open={confirmDemo}
        title="Fylle appen med eksempeldata?"
        tone="primary"
        confirmLabel="Last demodata"
        message="Alle dine egne data blir erstattet av oppdiktede eksempeltall. Eksporter først hvis du vil beholde dem."
        onConfirm={() => {
          dispatch({ type: 'replaceData', data: buildDemoData() });
          setConfirmDemo(false);
          onClose();
          toast.success('Demodata er lastet inn.');
        }}
        onCancel={() => setConfirmDemo(false)}
      />

      {/* Bekreft nullstilling */}
      <ConfirmDialog
        open={confirmReset}
        title="Slette alle data?"
        confirmLabel="Slett alt"
        message={
          signedIn
            ? 'Du logges ut, og alle data slettes fra denne enheten. Dataene i skyen beholdes – logg inn igjen for å hente dem tilbake.'
            : 'Alle perioder, registreringer, budsjetter og innstillinger slettes permanent fra denne nettleseren. Dette kan ikke angres.'
        }
        onConfirm={async () => {
          // Logg ut først, ellers ville den tomme appen blitt lastet opp og slettet dataene i skyen.
          if (signedIn) await sync.signOut();
          void adapter.clear();
          dispatch({ type: 'reset', data: createInitialData() });
          setConfirmReset(false);
          onClose();
          toast.success('Alle data er slettet.');
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </>
  );
}
