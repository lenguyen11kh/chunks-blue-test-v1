import React, { useState, useRef } from 'react';
import { Upload, AlertTriangle, CheckCircle, X } from 'lucide-react';
import { NarrationLocationKey } from '../../types/blue-test';

export interface CsvChallengeRow {
  target_key: string;
  challenge_number: number;
  challenge_label: string;
  session_number: number;
  session_question_number: number;
  chunks_number: number;
  tct_seconds_raw: number;
  tct_seconds_display: string;
  display_script: string;
  spoken_script: string;
  filename: string;
  language: string;
  voice: string;
  model: string;
  spoken_chunks_number: number;
  special_marker: string;
  pronunciation_note: string;
}

interface Props {
  onImport: (rows: CsvChallengeRow[]) => void;
  onCancel: () => void;
}

export const BlueTestCsvImport: React.FC<Props> = ({ onImport, onCancel }) => {
  const [parsedRows, setParsedRows] = useState<CsvChallengeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length < 50) {
        throw new Error(`Expected at least 50 lines (header + 49 rows), got ${lines.length}`);
      }

      const headers = lines[0].split(',');
      
      const rows: CsvChallengeRow[] = [];
      // Manual simple CSV parse assuming no escaped commas in the middle for our specific data format, 
      // but wait! spoken_script has commas! We need a better parser.
      let currentLine = 1;
      
      while(currentLine < lines.length) {
         const rowText = lines[currentLine];
         let insideQuote = false;
         let currentVal = '';
         let values = [];
         for (let i = 0; i < rowText.length; i++) {
            const char = rowText[i];
            if (char === '"') {
               insideQuote = !insideQuote;
            } else if (char === ',' && !insideQuote) {
               values.push(currentVal);
               currentVal = '';
            } else {
               currentVal += char;
            }
         }
         values.push(currentVal);
         
         if (values.length < 17) {
            // handle multiline or just skip
         }
         
         rows.push({
            target_key: values[0],
            challenge_number: parseInt(values[1], 10),
            challenge_label: values[2],
            session_number: parseInt(values[3], 10),
            session_question_number: parseInt(values[4], 10),
            chunks_number: parseInt(values[5], 10),
            tct_seconds_raw: parseFloat(values[6]),
            tct_seconds_display: values[7],
            display_script: values[8],
            spoken_script: values[9],
            filename: values[10],
            language: values[11],
            voice: values[12],
            model: values[13],
            spoken_chunks_number: parseInt(values[14], 10),
            special_marker: values[15] || '',
            pronunciation_note: values[16] || '',
         });
         currentLine++;
      }
      
      // Validations
      if (rows.length !== 49) {
        throw new Error(`Expected exactly 49 data rows, got ${rows.length}`);
      }
      
      const usedKeys = new Set();
      const usedChallengeNumbers = new Set();
      let sessionCounts: Record<number, number> = {};

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        
        if (r.challenge_number < 1 || r.challenge_number > 49) {
           throw new Error(`Row ${i+1}: Invalid challenge number ${r.challenge_number}`);
        }
        if (usedChallengeNumbers.has(r.challenge_number)) {
           throw new Error(`Row ${i+1}: Duplicate challenge number ${r.challenge_number}`);
        }
        usedChallengeNumbers.add(r.challenge_number);
        
        const expectedKey = `blue_test_challenge_${r.challenge_number < 10 ? '0' + r.challenge_number : r.challenge_number}`;
        if (r.target_key !== expectedKey) {
           throw new Error(`Row ${i+1}: Expected target_key ${expectedKey}, got ${r.target_key}`);
        }
        if (usedKeys.has(r.target_key)) {
           throw new Error(`Row ${i+1}: Duplicate target_key ${r.target_key}`);
        }
        usedKeys.add(r.target_key);
        
        if (!r.display_script || !r.spoken_script) {
           throw new Error(`Row ${i+1}: display_script and spoken_script must not be empty`);
        }
        
        if (r.voice !== 'Kore') {
           throw new Error(`Row ${i+1}: Voice must be Kore`);
        }
        
        if (!r.model.startsWith('gemini')) {
           throw new Error(`Row ${i+1}: Approved model required`);
        }
        
        if (!r.spoken_script.includes('CHUNKS number...') && !r.spoken_script.includes('CHUNKS NUMBER:')) {
           throw new Error(`Row ${i+1}: Missing "CHUNKS NUMBER:" in spoken script`);
        }
        
        if (!r.spoken_script.includes('T C T')) {
           throw new Error(`Row ${i+1}: Missing "T C T" in spoken script`);
        }
        
        if (isNaN(r.tct_seconds_raw) || r.tct_seconds_raw < 0) {
           throw new Error(`Row ${i+1}: Invalid raw TCT seconds`);
        }
        
        if (r.spoken_chunks_number < 1 || r.spoken_chunks_number > 7) {
           throw new Error(`Row ${i+1}: spoken_chunks_number must be 1-7`);
        }
        
        sessionCounts[r.session_number] = (sessionCounts[r.session_number] || 0) + 1;
        
        // Normal mapping validation
        if (r.challenge_number <= 7) {
           if (r.session_number !== 1 || r.chunks_number !== 1 || r.spoken_chunks_number !== 1) {
              throw new Error(`Row ${i+1}: Challenge ${r.challenge_number} must have structural and spoken CHUNKS number 1`);
           }
        } else if (r.challenge_number <= 14) {
           if (r.chunks_number !== 2 || r.spoken_chunks_number !== 2) throw new Error(`Row ${i+1}: Challenge ${r.challenge_number} expected chunks 2`);
        } else if (r.challenge_number <= 21) {
           if (r.chunks_number !== 3 || r.spoken_chunks_number !== 3) throw new Error(`Row ${i+1}: Challenge ${r.challenge_number} expected chunks 3`);
        } else if (r.challenge_number <= 28) {
           if (r.chunks_number !== 4 || r.spoken_chunks_number !== 4) throw new Error(`Row ${i+1}: Challenge ${r.challenge_number} expected chunks 4`);
        } else if (r.challenge_number <= 35) {
           if (r.chunks_number !== 5 || r.spoken_chunks_number !== 5) throw new Error(`Row ${i+1}: Challenge ${r.challenge_number} expected chunks 5`);
        } else if (r.challenge_number <= 42) {
           if (r.chunks_number !== 6 || r.spoken_chunks_number !== 6) throw new Error(`Row ${i+1}: Challenge ${r.challenge_number} expected chunks 6`);
        } else if (r.challenge_number <= 48) {
           if (r.chunks_number !== 7 || r.spoken_chunks_number !== 7) throw new Error(`Row ${i+1}: Challenge ${r.challenge_number} expected chunks 7`);
        } else if (r.challenge_number === 49) {
           if (r.chunks_number !== 7 || r.spoken_chunks_number !== 1) throw new Error(`Row ${i+1}: Challenge ${r.challenge_number} expected structural chunks 7 and spoken chunks 1`);
        }
      }
      
      for (let s = 1; s <= 7; s++) {
         if (sessionCounts[s] !== 7) {
            throw new Error(`Expected exactly 7 challenges per session, but session ${s} has ${sessionCounts[s]}`);
         }
      }
      
      
      setParsedRows(rows);
      setError(null);
    } catch (err) {
      setError(String(err));
      setParsedRows(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4">
      <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800">
            <Upload className="w-6 h-6 text-blue-600" />
            Import 49-Challenge CSV
          </h2>
          <button onClick={onCancel} className="p-2 hover:bg-slate-100 rounded-full text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          {!parsedRows && (
            <div className="border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center hover:bg-slate-50 transition-colors">
              <input 
                type="file" 
                accept=".csv" 
                onChange={handleFileUpload}
                className="hidden" 
                id="csv-upload" 
              />
              <label htmlFor="csv-upload" className="cursor-pointer flex flex-col items-center">
                <Upload className="w-12 h-12 text-blue-500 mb-4" />
                <span className="font-bold text-slate-700 text-lg">Select CSV File</span>
                <span className="text-slate-500 text-sm mt-2">blue-test-49-question-audio-scripts-final.csv</span>
              </label>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 text-red-700 rounded-xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <div>
                <p className="font-bold">Import Error</p>
                <p className="text-sm mt-1">{error}</p>
              </div>
            </div>
          )}

          {parsedRows && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 p-4 rounded-xl">
                <CheckCircle className="w-5 h-5" />
                <span className="font-bold">Successfully parsed {parsedRows.length} rows.</span>
              </div>
              
              <div className="space-y-3">
                {parsedRows.filter(r => r.challenge_number === 7 || r.challenge_number === 49).map(r => (
                  <div key={r.challenge_number} className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <h3 className="font-bold text-amber-900 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      Special Rule Warning: Challenge {r.challenge_number}
                    </h3>
                    <p className="text-sm text-amber-800 mt-2"><strong>Spoken:</strong> {r.spoken_script}</p>
                    <p className="text-sm text-amber-800"><strong>Marker:</strong> {r.special_marker}</p>
                  </div>
                ))}
              </div>

              <div className="border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="p-3 font-bold text-slate-700">Target</th>
                      <th className="p-3 font-bold text-slate-700">Display Script</th>
                      <th className="p-3 font-bold text-slate-700">Spoken Script</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((r, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <td className="p-3 text-slate-600 font-mono">{r.target_key}</td>
                        <td className="p-3 text-slate-600 truncate max-w-[200px]">{r.display_script}</td>
                        <td className="p-3 text-slate-600 truncate max-w-[300px]">{r.spoken_script}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button 
            onClick={onCancel}
            className="px-6 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-200"
          >
            Cancel
          </button>
          <button 
            disabled={!parsedRows}
            onClick={() => parsedRows && onImport(parsedRows)}
            className="px-6 py-2.5 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Confirm Import
          </button>
        </div>
      </div>
    </div>
  );
};
