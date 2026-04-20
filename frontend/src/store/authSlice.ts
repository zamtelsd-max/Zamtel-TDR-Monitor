import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { AuthState, AuthUser } from '../types';

// Safe parse — never crash on corrupted localStorage (blank screen fix)
function safeParse<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    localStorage.removeItem(key); // wipe corrupted value
    return null;
  }
}

const initialState: AuthState = {
  user:    safeParse<AuthUser>('zamtel_user'),
  token:   localStorage.getItem('zamtel_token') || null,
  loading: false,
  error:   null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    loginStart(state) {
      state.loading = true;
      state.error   = null;
    },
    loginSuccess(state, action: PayloadAction<{ user: AuthUser; token: string }>) {
      state.loading = false;
      state.user    = action.payload.user;
      state.token   = action.payload.token;
      localStorage.setItem('zamtel_token', action.payload.token);
      localStorage.setItem('zamtel_user',  JSON.stringify(action.payload.user));
    },
    loginFailure(state, action: PayloadAction<string>) {
      state.loading = false;
      state.error   = action.payload;
    },
    logout(state) {
      state.user  = null;
      state.token = null;
      localStorage.removeItem('zamtel_token');
      localStorage.removeItem('zamtel_user');
    },
    clearError(state) {
      state.error = null;
    },
  },
});

export const { loginStart, loginSuccess, loginFailure, logout, clearError } = authSlice.actions;
export default authSlice.reducer;
