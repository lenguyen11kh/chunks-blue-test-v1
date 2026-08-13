import React, { useState, useEffect } from 'react';
import { TestType } from '../../types/common';
import { Sparkles } from 'lucide-react';
import { wsSyncManager, ConnectionStatus } from '../../persistence/websocket-sync';

interface HeaderProps {
  activeTest: TestType;
  onSelectTest: (test: TestType) => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTest, onSelectTest }) => {
  const [syncStatus, setSyncStatus] = useState<ConnectionStatus>(() => wsSyncManager.getStatus());

  useEffect(() => {
    const unsubscribe = wsSyncManager.subscribeStatus((status) => {
      setSyncStatus(status);
    });
    return unsubscribe;
  }, []);

  const isConnected = syncStatus === 'connected';
  const isReconnecting = syncStatus === 'reconnecting' || syncStatus === 'connecting';

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between py-2 sm:py-0 sm:h-16 gap-2 sm:gap-4">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
            <a
              href="#"
              className="flex items-center gap-2.5 sm:gap-3.5 focus:outline-none focus:ring-2 focus:ring-red-500 rounded-xl transition-opacity hover:opacity-95"
              aria-label="CHUNKS Home"
            >
              <div className="shrink-0 flex items-center justify-center bg-red-600/10 border border-red-500/30 px-3 py-1.5 rounded-xl shadow-xs">
                <span className="font-extrabold text-lg sm:text-xl tracking-wider text-red-500 uppercase font-mono drop-shadow-xs">
                  CHUNKS
                </span>
              </div>
              <div className="flex flex-col justify-center">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs sm:text-sm tracking-tight text-white">
                    Blue Test Platform
                  </span>
                  <span className="px-2 py-0.5 text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full">
                    1-1
                  </span>
                </div>
                <p className="text-[10px] sm:text-xs text-slate-400 font-medium hidden sm:block">
                  Precision Learner Observation Platform
                </p>
              </div>
            </a>
          </div>

          {/* Right Controls: Test Indicator & WebSocket Learner Sync Status */}
          <div className="flex items-center gap-3">
            {/* Test Type Indicator */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-semibold text-white">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span className="font-bold text-blue-200">Blue Test</span>
              <span className="px-1.5 py-0.5 text-[9px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full ml-0.5">
                7-Color
              </span>
            </div>

            {/* Visual Connection Status Indicator for Learner Data Sync */}
            <div
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-all duration-300 shadow-xs ${
                isConnected
                  ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300'
                  : isReconnecting
                  ? 'bg-amber-950/40 border-amber-800/50 text-amber-300'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400'
              }`}
              title={`Learner Data Sync Status: ${
                isConnected
                  ? 'WebSocket Connected (Real-Time Synchronized)'
                  : isReconnecting
                  ? 'Attempting to Reconnect WebSocket...'
                  : 'Disconnected'
              }`}
            >
              <div className="relative flex h-2.5 w-2.5 items-center justify-center">
                {isConnected && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                {isReconnecting && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 transition-colors duration-300 ${
                    isConnected
                      ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]'
                      : isReconnecting
                      ? 'bg-amber-400 shadow-[0_0_8px_#fbbf24]'
                      : 'bg-slate-500'
                  }`}
                />
              </div>
              <span className="hidden md:inline text-[11px] font-semibold tracking-tight">
                Learner Sync
              </span>
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
                  isConnected
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : isReconnecting
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {isConnected ? 'Live' : isReconnecting ? 'Reconnecting' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
