import React from 'react';

export const OnboardingContext = React.createContext<{
  onResetProfile: () => Promise<void>;
}>({ onResetProfile: async () => {} });
