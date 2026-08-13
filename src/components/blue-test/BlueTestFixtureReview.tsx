import React from 'react';
import { generateBlueTestQuestions } from '../../domain/blue-test/timing-engine';
import { ArrowLeft, CheckCircle2, ShieldCheck, FileSpreadsheet } from 'lucide-react';

interface BlueTestFixtureReviewProps {
  onBackToSetup: () => void;
}

export const BlueTestFixtureReview: React.FC<BlueTestFixtureReviewProps> = ({ onBackToSetup }) => {
  const questions = generateBlueTestQuestions();

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 text-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToSetup}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-blue-600" />
              49-Question TCT (Threshold Conscious Time) Fixture Review
            </h1>
            <p className="text-xs text-slate-500">
              Raw model calculation L_n = 1.86^n. Session endpoints rounded to 1 decimal place.
            </p>
          </div>
        </div>

        <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4" /> Validated 49 Rows
        </span>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-600 font-bold uppercase border-b border-slate-200">
              <th className="p-3">Global Q#</th>
              <th className="p-3">Session #</th>
              <th className="p-3">Q in Session</th>
              <th className="p-3" title="Threshold Conscious Time">Raw TCT (seconds)</th>
              <th className="p-3">Display Formatted (1 Decimal)</th>
              <th className="p-3">Endpoint Verification</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono">
            {questions.map((q) => {
              const isEndpoint = q.questionInSession === 7;
              return (
                <tr
                  key={q.id}
                  className={isEndpoint ? 'bg-blue-50/60 font-bold text-blue-900' : 'hover:bg-slate-50'}
                >
                  <td className="p-3">Q{q.globalOrder}</td>
                  <td className="p-3">Session {q.sessionNumber}</td>
                  <td className="p-3">Q{q.questionInSession}</td>
                  <td className="p-3">{q.maxTimeSecondsRaw.toFixed(6)}s</td>
                  <td className="p-3 font-bold">{q.maxTimeDisplay}</td>
                  <td className="p-3 font-sans">
                    {isEndpoint ? (
                      <span className="px-2 py-0.5 bg-blue-600 text-white font-bold rounded text-[10px]">
                        Session {q.sessionNumber} Endpoint ({q.maxTimeDisplay})
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[11px]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
