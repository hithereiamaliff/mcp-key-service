'use client';

import React from 'react';
import { useCurrency } from '@/context/CurrencyContext';

const RatesAttribution: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { lastUpdated, error, selectedCurrency } = useCurrency();

  if (selectedCurrency === 'MYR') return null;

  return (
    <p className={`text-xs text-[var(--text-secondary)] italic ${className}`}>
      Rates by{' '}
      <a
        href="https://www.exchangerate-api.com"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-[var(--primary)]"
      >
        ExchangeRate-API
      </a>
      {error ? (
        <span style={{ color: 'var(--warning)' }}> · {error}</span>
      ) : lastUpdated ? (
        <span> · Updated: {lastUpdated.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
      ) : null}
    </p>
  );
};

export default RatesAttribution;
