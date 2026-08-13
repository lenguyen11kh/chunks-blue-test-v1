/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { TestType } from './types/common';
import { Header } from './components/common/Header';
import { GreenTestPage } from './components/green-red/GreenTestPage';
import { RedTestPage } from './components/green-red/RedTestPage';
import { BlueTestApp } from './components/blue-test/BlueTestApp';

export default function App() {
  const [activeTest, setActiveTest] = useState<TestType>('blue');

  return (
    <div className="h-[100dvh] max-h-[100dvh] bg-slate-100 font-sans text-slate-900 antialiased selection:bg-blue-500 selection:text-white flex flex-col overflow-hidden">
      {/* Top Application Header */}
      <Header activeTest={activeTest} onSelectTest={(test) => setActiveTest(test)} />

      {/* Main Content View Switcher */}
      <main className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
        {activeTest === 'green' && <GreenTestPage />}
        {activeTest === 'red' && <RedTestPage />}
        {activeTest === 'blue' && <BlueTestApp />}
      </main>
    </div>
  );
}
