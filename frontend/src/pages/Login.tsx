import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAppDispatch, useAppSelector } from '../hooks/useAppDispatch';
import { loginStart, loginSuccess, loginFailure } from '../store/authSlice';
import { authApi } from '../services/api';

export const Login: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { user, loading, error } = useAppSelector(s => s.auth);

  const [userId, setUserId] = useState('');
  const [pin, setPin] = useState(['', '', '', '']);
  const pinRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  useEffect(() => {
    if (user) {
      if (user.role === 'TDR') navigate('/tdr',  { replace: true });
      if (user.role === 'ZBM') navigate('/zbm',  { replace: true });
      if (user.role === 'HSD') navigate('/hsd',  { replace: true });
    }
  }, [user, navigate]);

  const handlePinChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const next = [...pin];
    next[index] = value;
    setPin(next);
    if (value && index < 3) pinRefs[index + 1].current?.focus();
  };

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) pinRefs[index - 1].current?.focus();
    if (e.key === 'Enter') handleSubmit();
  };

  const handleSubmit = async () => {
    const pinStr = pin.join('');
    if (!userId.trim()) { toast.error('Please enter your User ID'); return; }
    if (pinStr.length !== 4) { toast.error('Please enter your 4-digit PIN'); return; }
    dispatch(loginStart());
    try {
      const res = await authApi.login(userId.trim(), pinStr);
      dispatch(loginSuccess(res.data));
      const role = res.data.user.role;
      if (role === 'TDR') navigate('/tdr');
      if (role === 'ZBM') navigate('/zbm');
      if (role === 'HSD') navigate('/hsd');
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Login failed';
      dispatch(loginFailure(message));
      toast.error(message);
      setPin(['', '', '', '']);
      pinRefs[0].current?.focus();
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(160deg, #0D1B12 0%, #003d1c 50%, #00843D 100%)' }}>

      {/* Top brand stripe */}
      <div className="flex items-center justify-between px-5 pt-6 pb-2">
        <div className="flex items-center gap-2">
          {/* Zamtel "Z" wordmark block */}
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

      {/* Hero section */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-8">

        {/* Big logo */}
        <div className="mb-8 text-center">
          <div className="relative inline-block mb-5">
            {/* Outer glow ring */}
            <div className="absolute inset-0 rounded-3xl bg-zamtel-green/30 blur-xl scale-110" />
            <div className="relative w-24 h-24 bg-white rounded-3xl shadow-2xl flex items-center justify-center">
              <span className="text-zamtel-green font-black text-5xl leading-none">Z</span>
            </div>
            {/* Pink dot accent */}
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-zamtel-pink rounded-full border-2 border-white shadow" />
          </div>
          <h1 className="text-white text-2xl font-black tracking-tight">TDR Monitor</h1>
          <p className="text-green-300 text-sm mt-1">Territory Development Representative System</p>
        </div>

        {/* Login card */}
        <div className="w-full max-w-sm">
          <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl overflow-hidden">
            {/* Card top accent bar */}
            <div className="h-2 w-full rounded-t-3xl" style={{ background: 'linear-gradient(90deg, #00843D 0%, #006830 35%, #C0005A 70%, #E4007C 100%)' }} />

            <div className="p-7">
              <h2 className="text-lg font-bold text-gray-900 mb-1 text-center">Sign In</h2>
              <p className="text-xs text-gray-400 text-center mb-6">Enter your ID and 4-digit PIN</p>

              {/* User ID */}
              <div className="mb-5">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  User ID
                </label>
                <input
                  className="w-full rounded-2xl border-2 border-gray-100 bg-gray-50 px-4 py-3 text-sm font-medium focus:outline-none focus:border-zamtel-green focus:bg-white transition placeholder-gray-300"
                  placeholder="e.g. tdr-cb-01"
                  value={userId}
                  onChange={e => setUserId(e.target.value)}
                  autoComplete="username"
                  autoFocus
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
                      pattern="\d*"
                      maxLength={1}
                      value={digit}
                      onChange={e => handlePinChange(i, e.target.value)}
                      onKeyDown={e => handlePinKeyDown(i, e)}
                      className={`w-14 h-14 text-center text-2xl font-bold rounded-2xl border-2 transition focus:outline-none
                        ${digit
                          ? 'border-zamtel-green bg-green-50 text-zamtel-green'
                          : 'border-gray-200 bg-gray-50 text-gray-800'
                        }
                        focus:border-zamtel-green focus:bg-green-50 focus:ring-4 focus:ring-zamtel-green/10`}
                    />
                  ))}
                </div>
              </div>

              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-center">
                  <p className="text-sm text-red-600 font-medium">{error}</p>
                </div>
              )}

              {/* Sign In button — green → pink gradient */}
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full py-3.5 rounded-2xl text-white font-bold text-base shadow-lg transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: loading ? '#9CA3AF' : 'linear-gradient(90deg, #00843D 0%, #006830 60%, #004d24 100%)' }}
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

          {/* Bottom tagline */}
          <div className="mt-6 text-center space-y-1">
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
