import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { AuthState, AuthUser } from '../types';

const storedUser  = localStorage.getItem('zamtel_user');
const storedToken = localStorage.getItem('zamtel_token');

const initialState: AuthState = {
  user:    storedUser  ? JSON.parse(storedUser) as AuthUser : null,
  token:   storedToken || null,
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
