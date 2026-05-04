import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authApi } from '../services/api';
import { Button, Input } from '../components/UI';
import { ShieldAlert } from 'lucide-react';
import { useAppDispatch } from '../hooks/useAppDispatch';
import { loginSuccess } from '../store/authSlice';

export const ChangePinPage: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [currentPin, setCurrentPin] = useState('');
  const [newPin,     setNewPin]     = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading,    setLoading]    = useState(false);

  // If no pending token, redirect back to login
  useEffect(() => {
    const pending = sessionStorage.getItem('tdr_pending_token');
    if (!pending) navigate('/login', { replace: true });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin !== confirmPin) { toast.error('New PINs do not match.'); return; }
    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) { toast.error('PIN must be exactly 4 digits.'); return; }
    if (currentPin === newPin) { toast.error('New PIN must be different from your current PIN.'); return; }

    setLoading(true);
    try {
      // Use pending token for this one call
      const pendingToken = sessionStorage.getItem('tdr_pending_token') || '';

      // Temporarily set token in localStorage so axios interceptor can send it
      localStorage.setItem('zamtel_token', pendingToken);
      await authApi.changePin({ currentPin, newPin });
      localStorage.removeItem('zamtel_token');
      sessionStorage.removeItem('tdr_pending_token');

      toast.success('✅ PIN changed! Logging you in…', { duration: 2000 });

      // Now do a fresh login with the new PIN to get a clean token
      setTimeout(async () => {
        try {
          // We need the user id — decode from pending token
          const payload = JSON.parse(atob(pendingToken.split('.')[1]));
          const res = await authApi.login(payload.userId, newPin);
          dispatch(loginSuccess(res.data));
          const roleMap: Record<string, string> = { TDR: '/tdr', ZBM: '/zbm', HSD: '/hsd', ASE: '/ase' };
          navigate(roleMap[res.data.user.role] || '/login', { replace: true });
        } catch {
          // Fallback: send to login
          navigate('/login', { replace: true });
        }
      }, 1500);
    } catch (err: any) {
      localStorage.removeItem('zamtel_token');
      toast.error(err?.response?.data?.error || 'Failed to change PIN. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Security banner */}
        <div className="bg-red-600 text-white rounded-2xl p-4 mb-6 flex items-start gap-3 shadow-lg">
          <ShieldAlert className="w-6 h-6 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-bold text-base">Security Alert</p>
            <p className="text-sm text-red-100 mt-0.5">
              You are required to change your PIN immediately. You cannot access the system until you do.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-md p-6">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Change Your PIN</h1>
          <p className="text-sm text-gray-500 mb-2">Choose a new 4-digit PIN that only you know.</p>
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 mb-4">
            <p className="text-xs text-blue-800 font-medium">💡 What is my current PIN?</p>
            <p className="text-xs text-blue-700 mt-0.5">
              Your current PIN is the one you just used to log in — <strong>1234</strong> for TDR/ZBM/ASE, or <strong>9999</strong> for HSD/management.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Current PIN"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={currentPin}
              onChange={e => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="Enter your current PIN"
              required
              autoComplete="current-password"
            />
            <Input
              label="New PIN"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={newPin}
              onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="Choose a new 4-digit PIN"
              required
              autoComplete="new-password"
            />
            <Input
              label="Confirm New PIN"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={confirmPin}
              onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="Repeat your new PIN"
              required
              autoComplete="new-password"
            />

            {newPin.length === 4 && confirmPin.length === 4 && newPin !== confirmPin && (
              <p className="text-xs text-red-600 font-medium">⚠ PINs do not match</p>
            )}

            <Button
              type="submit"
              loading={loading}
              className="w-full"
              size="lg"
              disabled={currentPin.length < 4 || newPin.length < 4 || confirmPin.length < 4}
            >
              Change PIN & Continue
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Zamtel TDR Monitor — Security Enforcement
        </p>
      </div>
    </div>
  );
};
