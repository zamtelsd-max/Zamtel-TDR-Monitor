import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAppDispatch, useAppSelector } from '../hooks/useAppDispatch';
import { loginStart, loginSuccess, loginFailure } from '../store/authSlice';
import { authApi } from '../services/api';

export const Login: React.FC = () => {
  const dispatch  = useAppDispatch();
  const navigate  = useNavigate();
  const { user, loading, error } = useAppSelector(s => s.auth);

  const [userId, setUserId] = useState('');
  const [pin,    setPin]    = useState(['', '', '', '']);
  const pinRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  // Redirect if already logged in
  useEffect(() => {
    if (!user) return;
    const dest = roleRoute(user.role);
    if (dest) navigate(dest, { replace: true });
  }, [user, navigate]);

  function roleRoute(role: string): string | null {
    if (role === 'TDR')   return '/tdr';
    if (role === 'ZBM')   return '/zbm';
    if (role === 'HSD')   return '/hsd';
    if (role === 'ASE')   return '/ase';
    if (role === 'ADMIN') return '/admin';
    return '/tdr';
  }

  const handlePinChange = (index: number, value: string) => {
    // Accept only single digit
    const digit = value.replace(/\D/g, '').slice(-1);
    const next  = [...pin];
    next[index] = digit;
    setPin(next);
    if (digit && index < 3) {
      setTimeout(() => pinRefs[index + 1].current?.focus(), 10);
    }
    // Auto-submit when last digit entered
    if (digit && index === 3) {
      const full = [...next].join('');
      if (full.length === 4 && userId.trim()) {
        setTimeout(() => doLogin(userId.trim(), full), 80);
      }
    }
  };

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (pin[index]) {
        // Clear current
        const next = [...pin];
        next[index] = '';
        setPin(next);
      } else if (index > 0) {
        // Move back
        pinRefs[index - 1].current?.focus();
      }
    }
    if (e.key === 'Enter') handleSubmit();
  };

  const doLogin = async (id: string, pinStr: string) => {
    dispatch(loginStart());
    try {
      const res  = await authApi.login(id, pinStr);
      // Force PIN change BEFORE saving token to Redux/localStorage
      if (res.data.mustChangePin) {
        // Store token temporarily for the change-pin call, but do NOT log in yet
        sessionStorage.setItem('tdr_pending_token', res.data.token);
        navigate('/change-pin', { replace: true });
        return;
      }
      dispatch(loginSuccess(res.data));
      const dest = roleRoute(res.data.user.role);
      if (dest) navigate(dest, { replace: true });
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Login failed. Check your ID and PIN.';
      dispatch(loginFailure(message));
      toast.error(message);
      setPin(['', '', '', '']);
      setTimeout(() => pinRefs[0].current?.focus(), 50);
    }
  };

  const handleSubmit = () => {
    const pinStr = pin.join('');
    if (!userId.trim())      { toast.error('Please enter your User ID'); return; }
    if (pinStr.length !== 4) { toast.error('Please enter your 4-digit PIN'); return; }
    doLogin(userId.trim(), pinStr);
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: 'linear-gradient(160deg, #0D1B12 0%, #003d1c 50%, #00843D 100%)',
        /* iOS safe area */
        paddingTop:    'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* Top brand stripe */}
      <div className="flex items-center justify-between px-5 pt-6 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-lg">
            <span className="text-zamtel-green font-black text-lg leading-none">Z</span>
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">ZAMTEL</p>
            <p className="text-green-300 text-[10px] leading-tight">Create Your World</p>
          </div>
        </div>
        <div className="bg-zamtel-pink/20 border border-zamtel-pink/40 rounded-full px-3 py-1">
          <span className="text-zamtel-pink text-[10px] font-bold tracking-wider">TDR MONITOR</span>
        </div>
      </div>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-6">

        {/* Hero image — Zamtel "Come Home / Create your world" */}
        <div className="w-full max-w-sm mb-5">
          <div className="relative rounded-3xl overflow-hidden shadow-2xl" style={{ aspectRatio: '16/10' }}>
            <img src="brand/comehome.jpg" alt="Zamtel — Create your world" className="w-full h-full object-cover" style={{ objectPosition: 'center 30%' }} />
            {/* gradient scrim for text legibility */}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,50,25,.55) 100%)' }} />
            <div className="absolute bottom-3 left-4 right-4 text-white">
              <h1 className="text-xl font-black tracking-tight drop-shadow">TDR Monitor</h1>
              <p className="text-[11px] text-green-100/90 drop-shadow">Territory Development · Create Your World</p>
            </div>
          </div>
        </div>

        {/* Login card */}
        <div className="w-full max-w-sm">
          <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl overflow-hidden">
            <div className="h-2 w-full rounded-t-3xl" style={{ background: 'linear-gradient(90deg, #00843D 0%, #006830 35%, #006830 70%, #00843D 100%)' }} />

            <div className="p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-0.5 text-center">Sign In</h2>
              <p className="text-xs text-gray-400 text-center mb-5">Enter your ID and 4-digit PIN</p>

              {/* User ID */}
              <div className="mb-5">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  User ID
                </label>
                <input
                  className="w-full rounded-2xl border-2 border-gray-100 bg-gray-50 px-4 py-3.5 text-sm font-medium focus:outline-none focus:border-zamtel-green focus:bg-white transition placeholder-gray-300"
                  placeholder="e.g. tdr-cb-01"
                  value={userId}
                  onChange={e => setUserId(e.target.value.trim())}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="next"
                  onKeyDown={e => e.key === 'Enter' && pinRefs[0].current?.focus()}
                />
              </div>

              {/* PIN boxes */}
              <div className="mb-6">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  4-Digit PIN
                </label>
                <div className="flex gap-3 justify-center">
                  {pin.map((digit, i) => (
                    <input
                      key={i}
                      ref={pinRefs[i]}
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="one-time-code"
                      maxLength={1}
                      value={digit}
                      onChange={e => handlePinChange(i, e.target.value)}
                      onKeyDown={e => handlePinKeyDown(i, e)}
                      onFocus={e => e.target.select()}
                      enterKeyHint={i < 3 ? 'next' : 'done'}
                      style={{ WebkitUserSelect: 'none', touchAction: 'manipulation' }}
                      className={`w-14 h-14 text-center text-2xl font-bold rounded-2xl border-2 transition-all focus:outline-none select-none
                        ${digit
                          ? 'border-zamtel-green bg-green-50 text-zamtel-green shadow-sm'
                          : 'border-gray-200 bg-gray-50 text-gray-800'
                        }
                        focus:border-zamtel-green focus:bg-green-50 focus:ring-4 focus:ring-zamtel-green/10`}
                    />
                  ))}
                </div>
                <p className="text-center text-[10px] text-gray-400 mt-2">Auto-submits when PIN is complete</p>
              </div>

              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-center">
                  <p className="text-sm text-red-600 font-medium">{error}</p>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full py-4 rounded-2xl text-white font-bold text-base shadow-lg transition-all active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: loading ? '#9CA3AF' : 'linear-gradient(90deg, #00843D 0%, #006830 60%, #004d24 100%)', touchAction: 'manipulation' }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Signing in…
                  </span>
                ) : 'Sign In'}
              </button>
            </div>
          </div>

          <div className="mt-5 text-center space-y-1">
            <p className="text-green-300 text-xs font-medium">Zambia Telecommunications Company Limited</p>
            <div className="flex items-center justify-center gap-2">
              <div className="w-12 h-px bg-green-700" />
              <span className="text-green-600 text-[10px] font-semibold tracking-widest uppercase">Secure Portal</span>
              <div className="w-12 h-px bg-green-700" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
