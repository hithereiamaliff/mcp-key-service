'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useCurrency } from '@/context/CurrencyContext';

const CurrencySelector: React.FC = () => {
  const {
    selectedCurrency,
    setSelectedCurrency,
    currencies,
    isLoading,
    lastUpdated,
    error,
  } = useCurrency();

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedCurrencyData = currencies.find(c => c.code === selectedCurrency);

  const filteredCurrencies = currencies.filter(currency =>
    currency.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    currency.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (currencyCode: string) => {
    setSelectedCurrency(currencyCode);
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 border border-[var(--border)] rounded-lg hover:border-[var(--primary)] transition-colors text-sm bg-[var(--card)]"
      >
        <span className="font-medium">{selectedCurrencyData?.symbol}</span>
        <span className="text-[var(--text-secondary)]">{selectedCurrency}</span>
        {isLoading ? (
          <svg className="w-3 h-3 text-[var(--text-secondary)] animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        ) : (
          <svg className={`w-3 h-3 text-[var(--text-secondary)] transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="p-2 border-b border-[var(--border)]">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search currency..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text)] placeholder-[var(--text-secondary)] text-base sm:text-sm focus:outline-none focus:border-[var(--primary)]"
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {filteredCurrencies.length === 0 ? (
              <div className="p-3 text-center text-[var(--text-secondary)] text-sm">
                No currencies found
              </div>
            ) : (
              <>
                {filteredCurrencies.map((currency, index) => {
                  const isFirstOtherCurrency = index === 22 && !searchQuery;

                  return (
                    <div key={currency.code}>
                      {isFirstOtherCurrency && (
                        <div className="px-3 py-2 bg-[var(--bg-secondary)] border-y border-[var(--border)]">
                          <span className="text-xs text-[var(--text-secondary)] uppercase tracking-wide">All Currencies</span>
                        </div>
                      )}
                      <button
                        onClick={() => handleSelect(currency.code)}
                        className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg-secondary)] transition-colors text-left text-sm ${
                          selectedCurrency === currency.code ? 'bg-[var(--bg-secondary)] border-l-2 border-[var(--primary)]' : ''
                        }`}
                      >
                        <span className="w-6 text-center font-medium text-xs">
                          {currency.symbol}
                        </span>
                        <div className="flex-1">
                          <span>{currency.code}</span>
                          <span className="text-[var(--text-secondary)] ml-1 text-xs">{currency.name}</span>
                        </div>
                        {selectedCurrency === currency.code && (
                          <span className="text-[var(--primary)] text-xs">&#10003;</span>
                        )}
                      </button>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          <div className="p-2 border-t border-[var(--border)] bg-[var(--bg-secondary)]">
            <p className="text-xs text-[var(--text-secondary)]">
              Rates by{' '}
              <a
                href="https://www.exchangerate-api.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-[var(--primary)]"
              >
                ExchangeRate-API
              </a>
            </p>
            {error ? (
              <p className="text-xs" style={{ color: 'var(--warning)' }}>{error}</p>
            ) : lastUpdated ? (
              <p className="text-xs text-[var(--text-secondary)]">
                Updated: {lastUpdated.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

export default CurrencySelector;
