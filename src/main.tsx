import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute, SessionProvider } from './auth';
import { Landing } from './pages/Landing';
import { AuthPage } from './pages/AuthPage';
import { Dashboard, Overview } from './dashboard/Dashboard';
import { NotFound, PublicProfile } from './pages/PublicProfile';
import './styles.css';
import './dashboard/dashboard.css';
const Analytics = lazy(() => import('./dashboard/Analytics'));
const Settings = lazy(() => import('./dashboard/Settings'));
const Customize = lazy(() =>
  import('./dashboard/Customize').then((module) => ({ default: module.Customize })),
);
const LinksEditor = lazy(() =>
  import('./dashboard/LinksEditor').then((module) => ({ default: module.LinksEditor })),
);
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <Suspense
          fallback={
            <p className="status" role="status">
              Loading your space…
            </p>
          }
        >
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<AuthPage key="login" mode="login" />} />
            <Route path="/signup" element={<AuthPage key="signup" mode="signup" />} />
            <Route path="/reset-password" element={<AuthPage key="reset" mode="reset" />} />
            <Route
              path="/account"
              element={
                <ProtectedRoute>
                  <Navigate to="/dashboard" replace />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            >
              <Route index element={<Overview />} />
              <Route path="customize" element={<Customize />} />
              <Route path="links" element={<LinksEditor />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<NotFound />} />
            </Route>
            <Route path="/:username" element={<PublicProfile />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
);
