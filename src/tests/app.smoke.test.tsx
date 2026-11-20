/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import { AppStoreProvider } from '@/state/AppStore';
import { ToastProvider } from '@/ui/Toast';
import { STORAGE_KEY } from '@/lib/storage';

/**
 * Ende-til-ende røyktest i jsdom: onboarding → registrering → historikk.
 * Fanger kjøretidsfeil som typesjekken ikke ser, og bekrefter at dataene
 * faktisk havner i localStorage.
 */

function renderApp() {
  return render(
    <AppStoreProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </AppStoreProvider>,
  );
}

/** Går gjennom onboardingen med standardverdier og 45 000 kr i nettolønn. */
async function completeOnboarding(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Kom i gang' }));
  await user.type(await screen.findByLabelText('Nettolønn i kroner'), '45000');
  await user.click(screen.getByRole('button', { name: 'Neste' }));
  await user.click(screen.getByRole('button', { name: 'Neste' }));
  await user.click(screen.getByRole('button', { name: 'Fullfør' }));
}

beforeEach(() => {
  localStorage.clear();
  window.location.hash = '';
});

afterEach(cleanup);

describe('appen fra ende til ende', () => {
  it('kjører onboarding, registrerer en utgift og lagrer den', async () => {
    const user = userEvent.setup();
    renderApp();

    expect(await screen.findByText(/Full oversikt fra lønning til lønning/)).toBeTruthy();
    await completeOnboarding(user);

    /* Dashboardet vises med aktiv periode */
    expect(await screen.findByRole('heading', { name: 'Min økonomi' })).toBeTruthy();
    expect(screen.getByText('Igjen å bruke')).toBeTruthy();

    /* Registrer en utgift */
    await user.click(screen.getByRole('button', { name: 'Registrer ny utgift' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Beløp i kroner'), '349');
    await user.click(within(dialog).getByRole('radio', { name: 'Mat' }));
    await user.click(within(dialog).getByRole('button', { name: 'Lagre' }));

    /* Arket lukkes og forbruket er bokført */
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    /* Transaksjonen ligger lagret med riktig beløp i øre */
    await waitFor(() => {
      const raw = localStorage.getItem(STORAGE_KEY);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw as string);
      expect(parsed.periods).toHaveLength(1);
      expect(parsed.transactions).toHaveLength(1);
      expect(parsed.transactions[0].amountOre).toBe(34900);
      expect(parsed.transactions[0].kind).toBe('expense');
    });
  }, 25_000);

  it('viser budsjettsiden med ufordelt beløp', async () => {
    const user = userEvent.setup();
    renderApp();
    await completeOnboarding(user);

    await user.click(await screen.findByRole('button', { name: 'Budsjett' }));
    expect(await screen.findByRole('heading', { name: 'Budsjett' })).toBeTruthy();
    expect(screen.getByText('Ufordelt beløp')).toBeTruthy();
    expect(screen.getByText('Nettolønn')).toBeTruthy();
  }, 25_000);

  it('lar brukeren legge til, gi nytt navn og slette underkategorier', async () => {
    const user = userEvent.setup();
    renderApp();
    await completeOnboarding(user);

    await user.click(await screen.findByRole('button', { name: 'Budsjett' }));
    await user.click(await screen.findByRole('button', { name: 'Rediger Mat' }));
    const sheet = await screen.findByRole('dialog', { name: 'Rediger kategori' });
    // Arket flytter fokus inn i seg selv like etter åpning. Vent på det, ellers kan
    // fokusflyttet stjele tastetrykk midt i skrivingen.
    await waitFor(() => expect(document.activeElement).toBe(sheet));

    /* Legg til */
    await user.type(within(sheet).getByLabelText('Søk eller legg til underkategori'), 'Bunnpris Sentrum');
    await user.click(within(sheet).getByRole('button', { name: 'Legg til' }));
    expect(await within(sheet).findByText('Bunnpris Sentrum')).toBeTruthy();

    /* Gi nytt navn */
    await user.click(within(sheet).getByRole('button', { name: 'Gi nytt navn til Bunnpris Sentrum' }));
    const rename = within(sheet).getByLabelText('Nytt navn for Bunnpris Sentrum');
    await user.clear(rename);
    await user.type(rename, 'Bunnpris{Enter}');
    expect(await within(sheet).findByText('Bunnpris')).toBeTruthy();

    /* Slett med bekreftelse */
    await user.click(within(sheet).getByRole('button', { name: 'Slett Bunnpris' }));
    const confirm = await screen.findByRole('dialog', { name: 'Slette «Bunnpris»?' });
    await user.click(within(confirm).getByRole('button', { name: 'Slett' }));

    /* Kategoriarket står fortsatt åpent, og underkategorien er borte fra lagringen */
    expect(screen.getByRole('dialog', { name: 'Rediger kategori' })).toBeTruthy();
    await waitFor(() => {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
      const names = parsed.subcategories.map((s: { name: string }) => s.name);
      expect(names).not.toContain('Bunnpris');
      expect(names).not.toContain('Bunnpris Sentrum');
    });
  }, 25_000);

  it('gir ærlig tomtilstand i analysen når perioden er tom', async () => {
    const user = userEvent.setup();
    renderApp();
    await completeOnboarding(user);

    await user.click(await screen.findByRole('button', { name: 'Analyse' }));
    // Analysesiden lastes dynamisk, så den trenger litt mer tid enn standard.
    expect(
      await screen.findByRole('heading', { name: 'Analyse' }, { timeout: 15_000 }),
    ).toBeTruthy();
    expect(await screen.findByText('Ingen registreringer i denne perioden')).toBeTruthy();
  }, 25_000);
});
