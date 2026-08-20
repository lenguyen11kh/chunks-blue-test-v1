import React from 'react';
import { SevenColor } from '../../types/blue-test';
import { SEVEN_COLORS_ORDERED, getSevenColorDefinition } from '../../domain/blue-test/color-engine';
import { Frown, Meh, Smile, Sparkles } from 'lucide-react';

interface BlueTestFaceIndicatorProps {
  completionRatio: number; // 0 to 1
  activeColor: SevenColor;
  maxTimeDisplay?: string;
  isStopped?: boolean;
  reducedMotion?: boolean;
  isReversedScale?: boolean;
}

export const BlueTestFaceIndicator: React.FC<BlueTestFaceIndicatorProps> = ({
  completionRatio,
  activeColor,
  maxTimeDisplay = 'Max',
  isStopped = false,
  reducedMotion = false,
  isReversedScale = false,
}) => {
  const colorDef = getSevenColorDefinition(activeColor);
  const clampedRatio = Math.max(0, Math.min(1, completionRatio));
  const percentStr = `${Math.round(clampedRatio * 100)}%`;

  const reversedColorsOrdered: SevenColor[] = ['purple', 'indigo', 'blue', 'green', 'yellow', 'orange', 'red'];
  const colorsToRender = isReversedScale
    ? reversedColorsOrdered.map((c) => getSevenColorDefinition(c))
    : SEVEN_COLORS_ORDERED;

  // Determine face icon & label based on 7 colors
  const getFaceInfo = (color: SevenColor) => {
    switch (color) {
      case 'red':
        return {
          icon: <Frown className="w-4 h-4 text-red-600 stroke-[2.5]" />,
          labelEn: 'Very Sad',
          labelVi: 'Rất buồn',
          bg: 'bg-red-100 border-red-300 text-red-900',
        };
      case 'orange':
        return {
          icon: <Frown className="w-4 h-4 text-orange-600 stroke-[2.2]" />,
          labelEn: 'Sad',
          labelVi: 'Buồn',
          bg: 'bg-orange-100 border-orange-300 text-orange-900',
        };
      case 'yellow':
        return {
          icon: <Meh className="w-4 h-4 text-amber-600 stroke-[2.2]" />,
          labelEn: 'Concerned',
          labelVi: 'Lo lắng',
          bg: 'bg-amber-100 border-amber-300 text-amber-900',
        };
      case 'green':
        return {
          icon: <Meh className="w-4 h-4 text-emerald-600 stroke-[2.2]" />,
          labelEn: 'Neutral',
          labelVi: 'Bình thường',
          bg: 'bg-emerald-100 border-emerald-300 text-emerald-900',
        };
      case 'blue':
        return {
          icon: <Smile className="w-4 h-4 text-blue-600 stroke-[2.2]" />,
          labelEn: 'Slight Smile',
          labelVi: 'Cười nhẹ',
          bg: 'bg-blue-100 border-blue-300 text-blue-900',
        };
      case 'indigo':
        return {
          icon: <Smile className="w-4 h-4 text-indigo-600 stroke-[2.5]" />,
          labelEn: 'Happy',
          labelVi: 'Vui vẻ',
          bg: 'bg-indigo-100 border-indigo-300 text-indigo-900',
        };
      case 'purple':
        return {
          icon: <Sparkles className="w-4 h-4 text-purple-600 stroke-[2.5]" />,
          labelEn: 'Very Happy',
          labelVi: 'Rất vui',
          bg: 'bg-purple-100 border-purple-300 text-purple-900',
        };
    }
  };

  const faceInfo = getFaceInfo(activeColor);

  return (
    <div
      className="space-y-2 py-2"
      role="region"
      aria-label={`Current timer band: ${colorDef.labelEn}, ${percentStr}`}
    >
      {/* Header labels */}
      <div className="flex items-center justify-between text-xs font-semibold text-slate-400 px-1">
        <span>0s ({isReversedScale ? 'Purple' : 'Red'})</span>
        <span>{maxTimeDisplay} ({isReversedScale ? 'Red' : 'Purple'})</span>
      </div>

      {/* 7-Segment Color Progress Bar Container with Traveling Face Indicator */}
      <div className="relative pt-7 pb-2 min-h-[72px]">
        {/* The 7-segment colored background bar */}
        <div className="relative h-9 sm:h-10 w-full bg-slate-950 rounded-xl sm:rounded-2xl p-1 border border-slate-800 flex gap-0.5 sm:gap-1 overflow-hidden shadow-inner">
          {colorsToRender.map((def) => {
            const isCurrentActive = activeColor === def.color;
            return (
              <div
                key={def.color}
                className={`flex-1 h-full rounded-lg sm:rounded-xl transition-all relative flex items-center justify-center text-[8px] sm:text-[10px] font-bold text-white shadow-xs ${
                  isCurrentActive ? 'ring-2 ring-white scale-102 z-10' : 'opacity-65'
                }`}
                style={{ backgroundColor: def.hex }}
              >
                <span className="truncate px-0.5 hidden xs:inline">{def.labelEn}</span>
                <span className="truncate px-0.5 xs:hidden">{def.labelEn.substring(0, 1)}</span>
              </div>
            );
          })}
        </div>

        {/* Traveling Face Pin along the top/center of the bar */}
        <div
          className={`absolute top-0 -translate-x-1/2 transition-all z-20 ${
            reducedMotion || isStopped ? 'duration-0' : 'duration-75'
          }`}
          style={{
            left: `${Math.min(96, Math.max(4, clampedRatio * 100))}%`,
          }}
        >
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full border shadow-xl font-extrabold text-xs whitespace-nowrap backdrop-blur-md ${
              faceInfo.bg
            } ${!isStopped && !reducedMotion ? 'ring-2 ring-white/60' : ''}`}
          >
            {faceInfo.icon}
            <span className="font-mono text-slate-950">{percentStr}</span>
            <span className="hidden sm:inline text-[11px] font-bold text-slate-800">
              • {colorDef.labelEn}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
