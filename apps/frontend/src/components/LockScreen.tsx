import { useState } from 'react';
import logo from '../assets/syncvision-logo.png';

const STORAGE_KEY = 'sv_auth';

interface Props {
  onUnlock: () => void;
}

export function LockScreen({ onUnlock }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError]       = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const expected = import.meta.env.VITE_APP_PASSWORD || 'Unity';
    if (password === expected) {
      sessionStorage.setItem(STORAGE_KEY, '1');
      setError(false);
      onUnlock();
    } else {
      setError(true);
      setPassword('');
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0D0B1C',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Manrope, system-ui, sans-serif',
      padding: '24px',
    }}>
      <img
        src={logo}
        alt="SyncVision"
        style={{ height: 48, marginBottom: 40, objectFit: 'contain' }}
      />

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: '100%', maxWidth: 320 }}
      >
        <input
          type="password"
          value={password}
          onChange={e => { setPassword(e.target.value); setError(false); }}
          placeholder="Password"
          autoFocus
          style={{
            width: '100%',
            padding: '12px 16px',
            background: 'rgba(255,255,255,0.05)',
            border: `1px solid ${error ? '#F59E0B' : 'rgba(164,144,194,0.25)'}`,
            borderRadius: 8,
            color: '#E6E6FA',
            fontSize: 15,
            outline: 'none',
            letterSpacing: '0.1em',
          }}
        />

        {error && (
          <p style={{ color: '#F59E0B', fontSize: 13, margin: 0, alignSelf: 'flex-start' }}>
            Incorrect password
          </p>
        )}

        <button
          type="submit"
          style={{
            width: '100%',
            padding: '12px 16px',
            background: '#F59E0B',
            border: 'none',
            borderRadius: 8,
            color: '#0D0B1C',
            fontSize: 14,
            fontWeight: 700,
            fontFamily: 'inherit',
            letterSpacing: '0.08em',
            cursor: 'pointer',
          }}
        >
          Enter
        </button>
      </form>
    </div>
  );
}

export function isAuthenticated(): boolean {
  return sessionStorage.getItem(STORAGE_KEY) === '1';
}
