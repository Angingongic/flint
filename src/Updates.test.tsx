// @vitest-environment jsdom
import React from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { invoke } from '@tauri-apps/api/core';
import { UpdateProvider, UpdateSettings } from './Updates';
vi.mock('./native', () => ({inTauri: () => true}));
vi.mock('@tauri-apps/plugin-updater', () => ({check: vi.fn()}));
vi.mock('@tauri-apps/plugin-process', () => ({relaunch: vi.fn(async () => {})}));
vi.mock('@tauri-apps/api/app', () => ({getVersion: vi.fn(async () => '0.1.1')}));
vi.mock('@tauri-apps/api/core', () => ({invoke: vi.fn(async () => {})}));
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); vi.mocked(check).mockResolvedValue(null); });
afterEach(cleanup);
function mount(blocked = false) { return render(<UpdateProvider blocked={blocked}><UpdateSettings /></UpdateProvider>); }
function available() {
  const update = {version:'0.1.2',body:'Improved update reliability.',download:vi.fn(async (fn: any) => {fn({event:'Started',data:{contentLength:100}});fn({event:'Progress',data:{chunkLength:78}});}),install:vi.fn(async () => {})};
  vi.mocked(check).mockResolvedValue(update as any); return update;
}
describe('safe updater flow', () => {
  it('reports current version on manual check and persists automatic preference', async () => {
    mount(); fireEvent.click(screen.getByText('Check for updates'));
    expect(await screen.findByText(/You're up to date/)).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(localStorage.getItem('flint-auto-updates')).toBe('off');
  });
  it('launch check is asynchronous, quiet when current, and never installs', async () => {
    mount(); expect(check).not.toHaveBeenCalled();
    await waitFor(() => expect(check).toHaveBeenCalledOnce(), {timeout:2500});
    expect(screen.queryByRole('dialog')).toBeNull(); expect(relaunch).not.toHaveBeenCalled();
  });
  it('network failure leaves the application usable and manual retry available', async () => {
    vi.mocked(check).mockRejectedValueOnce(Error('offline')); mount();
    fireEvent.click(screen.getByText('Check for updates'));
    await screen.findByText(/couldn't be checked/);
    fireEvent.click(screen.getByText('Check for updates'));
    await screen.findByText(/You're up to date/);
  });
  it('downloads without installing, blocks restart in study, backs up before explicit restart', async () => {
    const update = available(); const view = mount(true);
    fireEvent.click(screen.getByText('Check for updates')); await screen.findByRole('dialog');
    fireEvent.click(screen.getByText('Update Flint')); await screen.findByText(/Update ready/);
    expect(update.install).not.toHaveBeenCalled();
    expect((screen.getByText('Restart now') as HTMLButtonElement).disabled).toBe(true);
    view.rerender(<UpdateProvider blocked={false}><UpdateSettings /></UpdateProvider>);
    const restart = screen.getByText('Restart now');
    fireEvent.click(restart); fireEvent.click(restart);
    await waitFor(() => expect(relaunch).toHaveBeenCalledOnce());
    expect(invoke).toHaveBeenCalledWith('prepare_update_backup', expect.anything());
    expect(update.install).toHaveBeenCalledOnce();
    expect(vi.mocked(invoke).mock.invocationCallOrder[0]).toBeLessThan(update.install.mock.invocationCallOrder[0]);
  });
  it('signature/download failure does not install or restart', async () => {
    const update = available(); update.download.mockRejectedValueOnce(Error('bad signature'));
    mount(); fireEvent.click(screen.getByText('Check for updates')); await screen.findByRole('dialog');
    fireEvent.click(screen.getByText('Update Flint')); await screen.findAllByText(/signature verification failed/);
    expect(update.install).not.toHaveBeenCalled(); expect(relaunch).not.toHaveBeenCalled();
  });
  it('backup failure prevents installation', async () => {
    const update = available(); vi.mocked(invoke).mockRejectedValueOnce(Error('disk full'));
    mount(); fireEvent.click(screen.getByText('Check for updates')); await screen.findByRole('dialog');
    fireEvent.click(screen.getByText('Update Flint')); await screen.findByText(/Update ready/);
    fireEvent.click(screen.getByText('Restart now')); await screen.findAllByText(/could not finish/);
    expect(update.install).not.toHaveBeenCalled(); expect(relaunch).not.toHaveBeenCalled();
  });
});
