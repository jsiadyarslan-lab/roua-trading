'use client';

import BrainIcon from './BrainIcon';

interface ThinkingIndicatorProps {
  isRtl: boolean;
  text: {
    thinkingPhases: string[];
    deepSearchProgress: string;
  };
  thinkingPhase: string | null;
  isDeepSearch: boolean;
  deepSearchStep: number;
}

export default function ThinkingIndicator({
  isRtl,
  text,
  thinkingPhase,
  isDeepSearch,
  deepSearchStep,
}: ThinkingIndicatorProps) {
  return (
    <div className="flex justify-start msg-fade">
      <div
        className="px-4 py-2.5 rounded-xl thinking-bubble"
        style={{
          borderRadius: isRtl ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
          direction: isRtl ? 'rtl' : 'ltr',
        }}
      >
        <div className="flex items-center gap-3" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
          {/* Neural Orbiting Orbs — animated thinking indicator */}
          <div className="neural-orbs-container">
            {/* Core center orb */}
            <div className="neural-orb neural-orb-core" />
            {/* Orbiting orbs */}
            <div className="neural-orb neural-orb-1" />
            <div className="neural-orb neural-orb-2" />
            <div className="neural-orb neural-orb-3" />
            {/* Brain icon on top for brand identity */}
            <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 2 }}>
              <BrainIcon size={18} color="#00E5FF" pulse={true} />
            </div>
          </div>

          {/* Phase label — beside icon */}
          <span className="text-[11px] font-medium thinking-text" style={{
            animation: 'fade-in 0.5s ease-out',
            whiteSpace: 'nowrap',
          }}>
            {thinkingPhase || text.thinkingPhases[0]}
          </span>
        </div>

        {/* Deep search progress steps */}
        {isDeepSearch && deepSearchStep > 0 && (
          <div className="mt-2 px-2">
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4].map(step => (
                <div
                  key={step}
                  className={`h-1 rounded-full flex-1 transition-all duration-500 ${
                    step <= deepSearchStep ? 'deep-search-bar-active' : 'deep-search-bar-inactive'
                  }`}
                />
              ))}
            </div>
            <span className="text-[9px] mt-1 block" style={{ color: 'var(--text3)' }}>
              {text.deepSearchProgress} {deepSearchStep}/4
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
