import React from 'react';

/** Decorative macOS-style window dots */
export const TrafficLights: React.FC = () => {
  return (
    <div className="flex items-center gap-[7px]" aria-hidden="true">
      <span
        className="block w-[12px] h-[12px] rounded-full"
        style={{ background: '#ff5f57' }}
      />
      <span
        className="block w-[12px] h-[12px] rounded-full"
        style={{ background: '#febc2e' }}
      />
      <span
        className="block w-[12px] h-[12px] rounded-full"
        style={{ background: '#28c840' }}
      />
    </div>
  );
};
