import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import api from '../services/api';

// ── State shape ───────────────────────────────────────────────
const initialState = {
  user:      null,
  token:     localStorage.getItem('hv_token') || null,
  isLoading: true,
  isAuthenticated: false,
};

// ── Actions ───────────────────────────────────────────────────
const AUTH_ACTIONS = {
  SET_LOADING:    'SET_LOADING',
  LOGIN_SUCCESS:  'LOGIN_SUCCESS',
  LOGOUT:         'LOGOUT',
  UPDATE_USER:    'UPDATE_USER',
};

function authReducer(state, action) {
  switch (action.type) {
    case AUTH_ACTIONS.SET_LOADING:
      return { ...state, isLoading: action.payload };
    case AUTH_ACTIONS.LOGIN_SUCCESS:
      return {
        ...state,
        user:            action.payload.user,
        token:           action.payload.token,
        isAuthenticated: true,
        isLoading:       false,
      };
    case AUTH_ACTIONS.LOGOUT:
      return { ...initialState, token: null, isLoading: false };
    case AUTH_ACTIONS.UPDATE_USER:
      return { ...state, user: { ...state.user, ...action.payload } };
    default:
      return state;
  }
}

// ── Context ───────────────────────────────────────────────────
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Restore session from localStorage on mount
  useEffect(() => {
    const token = localStorage.getItem('hv_token');
    if (!token) {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
      return;
    }
    // Validate token by fetching current user
    api.get('/auth/me')
      .then(({ data }) => {
        dispatch({
          type: AUTH_ACTIONS.LOGIN_SUCCESS,
          payload: { user: data.data, token },
        });
      })
      .catch(() => {
        localStorage.removeItem('hv_token');
        dispatch({ type: AUTH_ACTIONS.LOGOUT });
      });
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    const { user, token } = data.data;
    localStorage.setItem('hv_token', token);
    dispatch({ type: AUTH_ACTIONS.LOGIN_SUCCESS, payload: { user, token } });
    return user;
  }, []);

  const register = useCallback(async (payload) => {
    const { data } = await api.post('/auth/register', payload);
    const { user, token } = data.data;
    localStorage.setItem('hv_token', token);
    dispatch({ type: AUTH_ACTIONS.LOGIN_SUCCESS, payload: { user, token } });
    return user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('hv_token');
    dispatch({ type: AUTH_ACTIONS.LOGOUT });
  }, []);

  const updateUser = useCallback((updates) => {
    dispatch({ type: AUTH_ACTIONS.UPDATE_USER, payload: updates });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
