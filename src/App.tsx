import React, { useState, useEffect } from 'react';
import { Header } from './components/Header.tsx';
import { L2Terminal } from './components/L2Terminal.tsx';
import { RiskFirewallView } from './components/RiskFirewallView.tsx';
import { IntelligenceView } from './components/IntelligenceView.tsx';
import { AiArenaView } from './components/AiArenaView.tsx';
import { TopologyView } from './components/TopologyView.tsx';
import { SettingsConfigView } from './components/SettingsConfigView.tsx';
import { UpdatesManagerView } from './components/UpdatesManagerView.tsx';
import { WalletPortfolioView } from './components/WalletPortfolioView.tsx';
import { NotificationCenter } from './components/NotificationCenter.tsx';
import {
  AuthLoginScreen,
  AuthSettingsModal,
  type OperatorProfile,
} from './components/AuthLoginModal.tsx';
import type { SystemHealth, ExecutionMode } from './types.ts';
import { DEFAULT_SYSTEM_HEALTH } from './types.ts';

const AUTH_STORAGE_KEY = 'zima_auth_token';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('terminal');
  const [health, setHealth] = useState<SystemHealth>(DEFAULT_SYSTEM_HEALTH);
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState<boolean>(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState<number>(0);

  // Authentication state
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [requireAuth, setRequireAuth] = useState<boolean>(true);
  const [hasCustomPassword, setHasCustomPassword] = useState<boolean>(false);
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(AUTH_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [operator, setOperator] = useState<OperatorProfile | null>(null);
  const [isAuthSettingsOpen, setIsAuthSettingsOpen] = useState<boolean>(false);

  const checkAuthStatus = async (tokenOverride?: string | null) => {
    const tok = tokenOverride !== undefined ? tokenOverride : sessionToken;
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (tok) {
        headers['x-zima-session'] = tok;
      }
      const res = await fetch('/api/auth/status', { headers }).catch(() => null);
      if (res && res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
        const data = await res.json();
        setIsAuthenticated(Boolean(data.authenticated));
        setRequireAuth(Boolean(data.requireAuth));
        setHasCustomPassword(Boolean(data.hasCustomPassword));
        if (data.operator) {
          setOperator(data.operator);
        }
      } else if (res && res.status === 401) {
        setIsAuthenticated(false);
      }
    } catch {
      // Graceful offline fallback
    } finally {
      setAuthChecking(false);
    }
  };

  const fetchHealth = async () => {
    try {
      let res: Response | null = null;
      try {
        res = await fetch('/api/system/health', {
          headers: { Accept: 'application/json' },
        });
      } catch {
        res = null;
      }

      if (!res || !res.ok) {
        try {
          const altRes = await fetch('/api/health', {
            headers: { Accept: 'application/json' },
          });
          if (altRes && altRes.ok) {
            res = altRes;
          }
        } catch {
          // ignore network failure
        }
      }

      if (!res) {
        return;
      }

      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (data && typeof data === 'object') {
          setHealth((prev) => ({
            ...prev,
            ...data,
            nodes: {
              ...prev.nodes,
              ...(data.nodes || {}),
            },
            activeBotProfile: data.activeBotProfile || prev.activeBotProfile,
          }));
        }
      }
    } catch {
      // Graceful degradation
    }
  };

  useEffect(() => {
    checkAuthStatus();
    fetchHealth();
    const timer = setInterval(fetchHealth, 3000);
    return () => clearInterval(timer);
  }, []);

  const handleLoginSuccess = (token: string, op: OperatorProfile) => {
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, token);
    } catch {
      // ignore storage error
    }
    setSessionToken(token);
    setOperator(op);
    setIsAuthenticated(true);
    fetchHealth();
  };

  const handleLogout = async () => {
    try {
      const headers: Record<string, string> = {};
      if (sessionToken) {
        headers['x-zima-session'] = sessionToken;
      }
      await fetch('/api/auth/logout', { method: 'POST', headers });
    } catch {
      // ignore
    }
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // ignore
    }
    setSessionToken(null);
    setIsAuthSettingsOpen(false);
    setIsAuthenticated(false);
    setRequireAuth(true);
  };

  const handleModeChange = async (newMode: ExecutionMode) => {
    try {
      const res = await fetch('/api/system/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ mode: newMode }),
      }).catch(() => null);
      if (res && res.ok) {
        fetchHealth();
      }
    } catch {
      // safe fallback
    }
  };

  const handleKillSwitchTrigger = async () => {
    try {
      const res = await fetch('/api/kill-switch/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ reason: 'Ручная аварийная активация из веб-терминала' }),
      }).catch(() => null);
      if (res && res.ok) {
        fetchHealth();
      }
    } catch {
      // safe fallback
    }
  };

  const handleKillSwitchReset = async () => {
    try {
      const res = await fetch('/api/kill-switch/reset', {
        method: 'POST',
        headers: { Accept: 'application/json' },
      }).catch(() => null);
      if (res && res.ok) {
        fetchHealth();
      }
    } catch {
      // safe fallback
    }
  };

  if (!authChecking && !isAuthenticated) {
    return (
      <AuthLoginScreen
        hasCustomPassword={hasCustomPassword}
        defaultUsername={operator?.username || 'admin'}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  return (
    <div className="min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-[#070A12] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      <Header
        health={health}
        onModeChange={handleModeChange}
        onKillSwitchTrigger={handleKillSwitchTrigger}
        onKillSwitchReset={handleKillSwitchReset}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        operatorUsername={operator?.username || 'admin'}
        onOpenAuthSettings={() => setIsAuthSettingsOpen(true)}
        unreadNotificationsCount={unreadNotifCount}
        onOpenNotifications={() => setIsNotificationCenterOpen(true)}
      />

      <main className="flex-1 w-full max-w-[100vw] overflow-x-hidden pb-12">
        {activeTab === 'terminal' && (
          <L2Terminal
            mode={health?.mode ?? 'SHADOW'}
            isKillSwitchActive={health?.isKillSwitchActive ?? false}
            onRefreshHealth={fetchHealth}
          />
        )}

        {activeTab === 'wallet' && (
          <WalletPortfolioView onRefreshHealth={fetchHealth} />
        )}

        {activeTab === 'firewall' && (
          <RiskFirewallView
            health={health}
            onKillSwitchTrigger={handleKillSwitchTrigger}
            onKillSwitchReset={handleKillSwitchReset}
          />
        )}

        {activeTab === 'intelligence' && <IntelligenceView />}

        {activeTab === 'arena' && <AiArenaView />}

        {activeTab === 'topology' && <TopologyView health={health} />}

        {activeTab === 'settings' && <SettingsConfigView />}

        {activeTab === 'updates' && <UpdatesManagerView />}
      </main>

      {/* Global Notification Center & Floating Toasts */}
      <NotificationCenter
        isOpen={isNotificationCenterOpen}
        onClose={() => setIsNotificationCenterOpen(false)}
        onUnreadCountChange={setUnreadNotifCount}
      />

      {/* Operator Security & Credentials Modal */}
      <AuthSettingsModal
        isOpen={isAuthSettingsOpen}
        onClose={() => setIsAuthSettingsOpen(false)}
        operator={operator}
        requireAuth={requireAuth}
        hasCustomPassword={hasCustomPassword}
        sessionToken={sessionToken}
        onUpdated={(newOp, newReq, newHasCustom) => {
          setOperator(newOp);
          setRequireAuth(newReq);
          setHasCustomPassword(newHasCustom);
        }}
        onLogout={handleLogout}
      />

      {/* Minimalist Footer */}
      <footer className="border-t border-white/[0.06] bg-[#070A12] px-4 py-3 text-slate-500 text-xs">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">ZimaTrade</span>
            <span aria-hidden="true">·</span>
            <span>Bybit V5 Orderbook Engine</span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span>{health?.mode === 'LIVE' ? 'Режим: LIVE' : 'Режим: Учебный ($10,000)'}</span>
            <span aria-hidden="true">·</span>
            <span className={health?.isKillSwitchActive ? 'text-rose-400' : 'text-emerald-400'}>
              {health?.isKillSwitchActive ? 'Kill-Switch Активен' : 'Риск-Контроль 1.5% / 5.0%'}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
