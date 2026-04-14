import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAppDispatch, useAppSelector } from '../hooks/useAppDispatch';
import { loginStart, loginSuccess, loginFailure } from '../store/authSlice';
import { authApi } from '../services/api';
import { Button, Input } from '../components/UI';

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

  // If already logged in, redirect
  useEffect(() => {
    if (user) {
      if (user.role === 'TDR') navigate('/tdr',  { replace: true });
      if (user.role === 'ZBM') navigate('/zbm',  { replace: true });
      if (user.role === 'HSD') navigate('/hsd',  { replace: true });
    }
  }, [user, navigate]);

  const handlePinChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);
    if (value && index < 3) pinRefs[index + 1].current?.focus();
  };

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      pinRefs[index - 1].current?.focus();
    }
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
    <div className="min-h-screen bg-zamtel-dark flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 zamtel-gradient rounded-3xl shadow-2xl mb-4">
          <span className="text-white font-black text-3xl">Z</span>
        </div>
        <h1 className="text-white text-2xl font-bold">Zamtel TDR Monitor</h1>
        <p className="text-gray-400 text-sm mt-1">Territory Development Representative System</p>
      </div>

      {/* Card */}
      <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm">
        <h2 className="text-lg font-bold text-zamtel-dark mb-6 text-center">Sign In</h2>

        {/* User ID */}
        <div className="mb-5">
          <Input
            label="User ID"
            placeholder="e.g. tdr-001"
            value={userId}
            onChange={e => setUserId(e.target.value)}
            autoComplete="username"
            autoFocus
          />
        </div>

        {/* PIN */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">4-Digit PIN</label>
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
                className="w-14 h-14 text-center text-xl font-bold border-2 rounded-2xl focus:outline-none focus:border-zamtel-green focus:ring-2 focus:ring-zamtel-green/20 transition bg-gray-50"
              />
            ))}
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 text-center mb-4">{error}</p>
        )}

        <Button onClick={handleSubmit} loading={loading} className="w-full" size="lg">
          Sign In
        </Button>

        <p className="text-xs text-gray-400 text-center mt-4">
          Zambia Telecommunications Company Limited
        </p>
      </div>
    </div>
  );
};
