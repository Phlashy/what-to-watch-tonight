import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { api, getAuth, setAuth } from '../api';

const FamilyContext = createContext(null);

export function FamilyProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [authMessage, setAuthMessage] = useState('');

  // `justEntered` is true when the person has just typed a password, false when
  // we're trying whatever this device had saved.
  const load = useCallback((justEntered = false) => {
    setError(false);
    setAuthRequired(false);
    const hadSavedPassword = Boolean(getAuth());
    api('/api/config')
      .then((r) => r.json())
      .then(setConfig)
      .catch((err) => {
        console.error('Failed to load family config:', err);
        const code = err.body?.code;
        if (err.status === 401) {
          // A password-protected server returns 401 until the right password is sent.
          let message = '';
          if (code === 'wrong_password' || hadSavedPassword) {
            // Forget the rejected password so it isn't re-sent (and counted as
            // another wrong guess) every time the app opens.
            setAuth('');
            message = justEntered
              ? 'Wrong password — try again.'
              : 'The password saved on this device no longer works. Please enter it again.';
          }
          setAuthMessage(message);
          setAuthRequired(true);
        } else if (err.status === 429 && code === 'locked_out') {
          // Too many wrong guesses from this address: the server says how long to wait.
          setAuthMessage(err.message);
          setAuthRequired(true);
        } else {
          setError(true);
        }
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const value = useMemo(() => {
    if (!config) return null;

    const memberNames = config.members.map((m) => m.name);
    const allPeople = [...memberNames, ...(config.guests || [])];

    // Build context→lists map
    const contextListMap = {};
    for (const ctx of config.contexts) {
      contextListMap[ctx.id] = ctx.lists;
    }

    // Build list→context map (for shortlists)
    const listToContext = {};
    for (const ctx of config.contexts) {
      for (const listName of ctx.lists) {
        listToContext[listName] = ctx.id;
      }
    }

    // Avatar lookup
    const avatarMap = {};
    const colorMap = {};
    for (const m of config.members) {
      if (m.avatar) avatarMap[m.name] = m.avatar;
      if (m.color) colorMap[m.name] = m.color;
    }

    return {
      familyName: config.familyName,
      members: config.members,
      memberNames,
      allPeople,
      guests: config.guests || [],
      rotation: config.rotation,
      contexts: config.contexts,
      lists: config.lists,
      streamingServiceIds: new Set(config.streamingServiceIds || []),
      // Servers without an Anthropic key report chatEnabled: false; treat
      // anything else (true/undefined from older servers) as enabled.
      chatEnabled: config.chatEnabled !== false,
      contextListMap,
      listToContext,
      getAvatar: (name) => avatarMap[name] || null,
      getColor: (name) => colorMap[name] || null,
    };
  }, [config]);

  // If the server is password-protected, prompt for it before anything else.
  if (authRequired) {
    return (
      <AuthGate
        message={authMessage}
        onSubmit={(pw) => {
          setAuth(pw);
          load(true);
        }}
      />
    );
  }

  // Config is required for the whole app. If it failed to load, show a real
  // "can't reach the server" screen with retry instead of a permanent blank page.
  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center px-6 text-center">
        <div className="text-4xl mb-3">📡</div>
        <h1 className="text-xl font-bold">Can’t reach the server</h1>
        <p className="text-sm text-slate-400 mt-1 max-w-xs">
          The app couldn’t load its configuration. Check that the server is running and you’re on
          the right network.
        </p>
        <button
          onClick={() => load()}
          className="mt-5 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  // Show nothing until config loads (near-instant for local server)
  if (!value) return null;

  return <FamilyContext.Provider value={value}>{children}</FamilyContext.Provider>;
}

export function useFamily() {
  return useContext(FamilyContext);
}

/** Password prompt shown only when the server requires a shared password. */
function AuthGate({ onSubmit, message }) {
  const [value, setValue] = useState('');
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center px-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onSubmit(value.trim());
        }}
        className="w-full max-w-xs text-center"
      >
        <div className="text-4xl mb-3">🔒</div>
        <h1 className="text-xl font-bold">Password required</h1>
        <p className="text-sm text-slate-400 mt-1 mb-5">Enter the password to access this app.</p>
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Password"
          autoFocus
          aria-label="Password"
          aria-describedby={message ? 'auth-message' : undefined}
          className={`w-full bg-slate-800 border rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-amber-400 ${
            message ? 'border-red-400' : 'border-slate-700'
          }`}
        />
        {message && (
          <p id="auth-message" role="alert" className="text-sm text-red-300 mt-3">
            {message}
          </p>
        )}
        <button
          type="submit"
          disabled={!value.trim()}
          className="w-full mt-3 bg-amber-500 disabled:opacity-40 text-black font-semibold rounded-xl px-5 py-3 text-sm transition-opacity"
        >
          Unlock
        </button>
      </form>
    </div>
  );
}
