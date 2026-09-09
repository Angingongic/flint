import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { inTauri } from './native';
import { Modal } from './ui';
type Phase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'installing' | 'installed';
type Controls = { version: string; automatic: boolean; toggle: () => void; run: () => void; show: () => void; phase: Phase; message: string; hasUpdate: boolean };
const Context = createContext<Controls | null>(null);
export function UpdateProvider({ children, blocked }: { children: ReactNode; blocked: boolean }) {
  const [automatic, setAutomatic] = useState(() => localStorage.getItem('flint-auto-updates') !== 'off');
  const [version, setVersion] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [update, setUpdate] = useState<Update | null>(null);
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const locked = useRef(false), started = useRef(false), current = useRef<Update | null>(null);
  const blockedNow = useRef(blocked); blockedNow.current = blocked;
  async function run(manual = false) {
    if (locked.current) return;
    if (!inTauri()) { if (manual) setMessage('Update checks are available in the installed desktop app.'); return; }
    if (current.current) { if (manual) setVisible(true); return; }
    locked.current = true; setPhase('checking'); setMessage('');
    try {
      const found = await check({ timeout: 15000 });
      current.current = found; setUpdate(found); setPhase(found ? 'available' : 'idle');
      if (found) { if (manual || !blockedNow.current) setVisible(true); }
      else if (manual) setMessage(`You're up to date. Flint ${version || await getVersion()} is the latest version.`);
    } catch { setPhase('idle'); if (manual) setMessage("Update couldn't be checked. Keep using Flint and try again later."); }
    finally { locked.current = false; }
  }
  useEffect(() => {
    if (!inTauri()) return;
    void getVersion().then(setVersion).catch(() => setVersion('Unavailable'));
    const timer = setTimeout(() => { if (automatic && !started.current) { started.current = true; void run(); } }, 1500);
    return () => clearTimeout(timer);
  }, [automatic]);
  async function download() {
    if (!update || locked.current) return;
    locked.current = true; setPhase('downloading'); setMessage(''); setProgress(null);
    let total = 0, received = 0;
    try {
      await update.download(event => {
        if (event.event === 'Started') total = event.data.contentLength || 0;
        if (event.event === 'Progress') received += event.data.chunkLength;
        if (total) setProgress(Math.min(100, Math.round(received / total * 100)));
      });
      setProgress(100); setPhase('ready');
    } catch { setPhase('available'); setMessage('Download or signature verification failed. Nothing was installed. Try again.'); }
    finally { locked.current = false; }
  }
  async function install() {
    if (!update || locked.current || blockedNow.current || !['ready', 'installed'].includes(phase)) return;
    locked.current = true; setMessage('');
    let installed = phase === 'installed';
    try {
      if (!installed) {
        setPhase('installing');
        const preferences = Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('flint-')).map(key => [key, localStorage.getItem(key)]));
        await invoke('prepare_update_backup', { preferences: JSON.stringify(preferences) });
        await update.install(); installed = true; setPhase('installed');
      }
      await relaunch();
    } catch {
      setPhase(installed ? 'installed' : 'ready');
      setMessage('Update could not finish. Any recovery backup is kept. Please try again when ready.');
    } finally { locked.current = false; }
  }
  const busy = ['checking', 'downloading', 'installing'].includes(phase);
  return <Context.Provider value={{version, automatic, toggle: () => { setAutomatic(!automatic); localStorage.setItem('flint-auto-updates', automatic ? 'off' : 'on'); }, run: () => void run(true), show: () => setVisible(true), phase, message, hasUpdate: !!update}}>
    {children}
    {update && !visible && <aside className="update-notice" aria-live="polite"><span>Flint {update.version} {phase === 'ready' ? 'is ready — restart when you’re ready.' : 'is available.'}</span><button onClick={() => setVisible(true)}>View update</button></aside>}
    {visible && update && <Modal title={`Flint ${update.version} is available`} onClose={() => { if (phase !== 'installing') setVisible(false); }}>
      <div className="update-details"><h3>What's new</h3><p className="update-notes">{update.body || 'Maintenance and reliability improvements.'}</p>
        {phase === 'downloading' && <><p>Downloading and verifying update… {progress === null ? '' : `${progress}%`}</p><progress aria-label="Update download" max={100} value={progress ?? undefined} /></>}
        {['ready', 'installed'].includes(phase) && <p>Update ready — restart when you're ready. Flint needs to restart to finish.</p>}
        {phase === 'installing' && <p role="status">Saving a recovery backup and installing…</p>}
        {blocked && <p>Finish and save your set or study session before installing. You can download now and restart later.</p>}
        {message && <p role="alert">{message}</p>}
        <div className="button-row"><button disabled={phase === 'installing'} onClick={() => setVisible(false)}>Later</button>
          {phase === 'available' && <button className="primary" disabled={busy} onClick={() => void download()}>Update Flint</button>}
          {['ready', 'installed'].includes(phase) && <button className="primary" disabled={blocked || busy} onClick={() => void install()}>Restart now</button>}
        </div>
      </div>
    </Modal>}
  </Context.Provider>;
}
export function UpdateSettings() {
  const controls = useContext(Context);
  if (!controls) return null;
  return <section className="panel update-settings" aria-label="Updates"><h3>Updates</h3><p>Flint version {controls.version || (inTauri() ? 'Loading…' : 'Development')}</p>
    <label><input type="checkbox" checked={controls.automatic} onChange={controls.toggle} /> Automatic update checks</label>
    <p>Check automatically; never install or restart without your approval.</p>
    <button disabled={['checking', 'downloading', 'installing'].includes(controls.phase)} onClick={controls.run}>{controls.phase === 'checking' ? 'Checking…' : 'Check for updates'}</button>
    {controls.hasUpdate && <button onClick={controls.show}>View update</button>}
    {controls.message && <p role="status">{controls.message}</p>}
  </section>;
}
