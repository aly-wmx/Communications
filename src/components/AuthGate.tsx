import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from '../lib/supabase';

type Membership = 'checking' | 'member' | 'not-member';

/** Email sign-in link; then only people on the team list get in. */
export function AuthGate({ children }: { children: (email: string, signOut: () => void) => ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [membership, setMembership] = useState<Membership>('checking');

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    setMembership('checking');
    void supabase.rpc('is_team_member').then(({ data, error }) => {
      setMembership(!error && data === true ? 'member' : 'not-member');
    });
  }, [session]);

  const signOut = () => void supabase.auth.signOut();

  if (!supabaseConfigured) {
    return (
      <Centered title="Not configured">
        <p>Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY for this deployment.</p>
      </Centered>
    );
  }
  if (session === undefined || (session && membership === 'checking')) {
    return <Centered title="Loading…" />;
  }
  if (!session) return <SignIn />;
  if (membership === 'not-member') {
    return (
      <Centered title="You’re not on the team list">
        <p>
          You signed in as <strong>{session.user.email}</strong>, but that address isn’t on the tracker’s team list. Ask an
          existing team member to add it under Settings → Team.
        </p>
        <button type="button" className="btn" onClick={signOut}>
          Sign out
        </button>
      </Centered>
    );
  }
  return <>{children(session.user.email ?? '', signOut)}</>;
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setState('sending');
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (err) {
      setError(err.message);
      setState('idle');
    } else {
      setState('sent');
    }
  };

  return (
    <Centered title="Client Communications">
      {state === 'sent' ? (
        <p>
          Check <strong>{email}</strong> for a sign-in link. You can close this tab once you’ve opened it.
        </p>
      ) : (
        <form onSubmit={submit} className="signin">
          <p className="muted">Sign in with your work email. We’ll email you a link — no password needed.</p>
          <label className="field">
            <span>Email</span>
            <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={state === 'sending'}>
            {state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
          </button>
        </form>
      )}
    </Centered>
  );
}

function Centered({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="centered">
      <div className="panel centered-card">
        <p className="brand-org">Watermark Design Build</p>
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  );
}
