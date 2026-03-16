'use client';

import React from 'react';
import { useCurrency } from '@/context/CurrencyContext';

interface PriceDisplayProps {
  amountMYR: number;
  suffix?: string;
  showOriginal?: boolean;
  className?: string;
}

const PriceDisplay: React.FC<PriceDisplayProps> = ({
  amountMYR,
  suffix = '/month',
  showOriginal = true,
  className = '',
}) => {
  const { selectedCurrency, convertFromMYR, currencies, exchangeRates } = useCurrency();
  const currency = currencies.find(c => c.code === selectedCurrency);
  const symbol = currency?.symbol || selectedCurrency;
  const { converted } = convertFromMYR(amountMYR);
  const isMYR = selectedCurrency === 'MYR';
  const hasRate = isMYR || typeof exchangeRates[selectedCurrency] === 'number';

  const formatAmount = (amount: number): string => {
    if (['JPY', 'KRW', 'VND', 'IDR'].includes(selectedCurrency)) {
      return Math.round(amount).toLocaleString();
    }
    return amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  return (
    <span className={className}>
      <span className="font-medium">
        {!hasRate || isMYR ? `RM${amountMYR.toLocaleString()}` : `${symbol}${formatAmount(converted)}`}
      </span>
      <span className="text-[var(--text-secondary)]">{suffix}</span>
      {!isMYR && hasRate && showOriginal && (
        <span className="text-[var(--text-secondary)] text-xs ml-1">
          (RM{amountMYR.toLocaleString()})
        </span>
      )}
    </span>
  );
};

export default PriceDisplay;
