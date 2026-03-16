'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface ExchangeRates {
  [key: string]: number;
}

interface Currency {
  code: string;
  name: string;
  symbol: string;
}

interface CurrencyContextType {
  selectedCurrency: string;
  setSelectedCurrency: (currency: string) => void;
  exchangeRates: ExchangeRates;
  isLoading: boolean;
  error: string | null;
  convertFromMYR: (amountMYR: number) => { converted: number; original: number };
  formatPrice: (amountMYR: number, showOriginal?: boolean) => string;
  currencies: Currency[];
  lastUpdated: Date | null;
}

const STORAGE_KEYS = {
  selectedCurrency: 'mks_selectedCurrency',
  exchangeRates: 'mks_exchangeRates',
  ratesUpdatedAt: 'mks_ratesUpdatedAt',
} as const;

const FALLBACK_RATES: ExchangeRates = {
  MYR: 1,
  USD: 0.21,
  EUR: 0.2,
  GBP: 0.17,
  SGD: 0.28,
  AUD: 0.32,
  JPY: 32.5,
  CNY: 1.53,
  INR: 17.8,
  THB: 7.4,
  IDR: 3350,
  PHP: 11.8,
  VND: 5300,
  KRW: 290,
  HKD: 1.65,
  TWD: 6.8,
  NZD: 0.35,
  CAD: 0.29,
  CHF: 0.19,
  AED: 0.78,
  SAR: 0.79,
  BND: 0.28,
};

const majorCurrencies: Currency[] = [
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'THB', name: 'Thai Baht', symbol: '฿' },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp' },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱' },
  { code: 'VND', name: 'Vietnamese Dong', symbol: '₫' },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$' },
  { code: 'TWD', name: 'Taiwan Dollar', symbol: 'NT$' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼' },
  { code: 'BND', name: 'Brunei Dollar', symbol: 'B$' },
];

const allCurrencies: Currency[] = [
  { code: 'AFN', name: 'Afghan Afghani', symbol: '؋' },
  { code: 'ALL', name: 'Albanian Lek', symbol: 'L' },
  { code: 'AMD', name: 'Armenian Dram', symbol: '֏' },
  { code: 'ANG', name: 'Netherlands Antillean Guilder', symbol: 'ƒ' },
  { code: 'AOA', name: 'Angolan Kwanza', symbol: 'Kz' },
  { code: 'ARS', name: 'Argentine Peso', symbol: '$' },
  { code: 'AWG', name: 'Aruban Florin', symbol: 'ƒ' },
  { code: 'AZN', name: 'Azerbaijani Manat', symbol: '₼' },
  { code: 'BAM', name: 'Bosnia-Herzegovina Convertible Mark', symbol: 'KM' },
  { code: 'BBD', name: 'Barbadian Dollar', symbol: '$' },
  { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳' },
  { code: 'BGN', name: 'Bulgarian Lev', symbol: 'лв' },
  { code: 'BHD', name: 'Bahraini Dinar', symbol: '.د.ب' },
  { code: 'BIF', name: 'Burundian Franc', symbol: 'FBu' },
  { code: 'BMD', name: 'Bermudan Dollar', symbol: '$' },
  { code: 'BOB', name: 'Bolivian Boliviano', symbol: 'Bs.' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
  { code: 'BSD', name: 'Bahamian Dollar', symbol: '$' },
  { code: 'BTN', name: 'Bhutanese Ngultrum', symbol: 'Nu.' },
  { code: 'BWP', name: 'Botswanan Pula', symbol: 'P' },
  { code: 'BYN', name: 'Belarusian Ruble', symbol: 'Br' },
  { code: 'BZD', name: 'Belize Dollar', symbol: 'BZ$' },
  { code: 'CDF', name: 'Congolese Franc', symbol: 'FC' },
  { code: 'CLP', name: 'Chilean Peso', symbol: '$' },
  { code: 'COP', name: 'Colombian Peso', symbol: '$' },
  { code: 'CRC', name: 'Costa Rican Colón', symbol: '₡' },
  { code: 'CUP', name: 'Cuban Peso', symbol: '₱' },
  { code: 'CVE', name: 'Cape Verdean Escudo', symbol: '$' },
  { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč' },
  { code: 'DJF', name: 'Djiboutian Franc', symbol: 'Fdj' },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr' },
  { code: 'DOP', name: 'Dominican Peso', symbol: 'RD$' },
  { code: 'DZD', name: 'Algerian Dinar', symbol: 'د.ج' },
  { code: 'EGP', name: 'Egyptian Pound', symbol: '£' },
  { code: 'ERN', name: 'Eritrean Nakfa', symbol: 'Nfk' },
  { code: 'ETB', name: 'Ethiopian Birr', symbol: 'Br' },
  { code: 'FJD', name: 'Fijian Dollar', symbol: '$' },
  { code: 'FKP', name: 'Falkland Islands Pound', symbol: '£' },
  { code: 'GEL', name: 'Georgian Lari', symbol: '₾' },
  { code: 'GHS', name: 'Ghanaian Cedi', symbol: '₵' },
  { code: 'GIP', name: 'Gibraltar Pound', symbol: '£' },
  { code: 'GMD', name: 'Gambian Dalasi', symbol: 'D' },
  { code: 'GNF', name: 'Guinean Franc', symbol: 'FG' },
  { code: 'GTQ', name: 'Guatemalan Quetzal', symbol: 'Q' },
  { code: 'GYD', name: 'Guyanaese Dollar', symbol: '$' },
  { code: 'HNL', name: 'Honduran Lempira', symbol: 'L' },
  { code: 'HRK', name: 'Croatian Kuna', symbol: 'kn' },
  { code: 'HTG', name: 'Haitian Gourde', symbol: 'G' },
  { code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft' },
  { code: 'ILS', name: 'Israeli New Shekel', symbol: '₪' },
  { code: 'IQD', name: 'Iraqi Dinar', symbol: 'ع.د' },
  { code: 'IRR', name: 'Iranian Rial', symbol: '﷼' },
  { code: 'ISK', name: 'Icelandic Króna', symbol: 'kr' },
  { code: 'JMD', name: 'Jamaican Dollar', symbol: 'J$' },
  { code: 'JOD', name: 'Jordanian Dinar', symbol: 'د.ا' },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh' },
  { code: 'KGS', name: 'Kyrgystani Som', symbol: 'лв' },
  { code: 'KHR', name: 'Cambodian Riel', symbol: '៛' },
  { code: 'KMF', name: 'Comorian Franc', symbol: 'CF' },
  { code: 'KPW', name: 'North Korean Won', symbol: '₩' },
  { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'د.ك' },
  { code: 'KYD', name: 'Cayman Islands Dollar', symbol: '$' },
  { code: 'KZT', name: 'Kazakhstani Tenge', symbol: '₸' },
  { code: 'LAK', name: 'Laotian Kip', symbol: '₭' },
  { code: 'LBP', name: 'Lebanese Pound', symbol: 'ل.ل' },
  { code: 'LKR', name: 'Sri Lankan Rupee', symbol: 'Rs' },
  { code: 'LRD', name: 'Liberian Dollar', symbol: '$' },
  { code: 'LSL', name: 'Lesotho Loti', symbol: 'L' },
  { code: 'LYD', name: 'Libyan Dinar', symbol: 'ل.د' },
  { code: 'MAD', name: 'Moroccan Dirham', symbol: 'د.م.' },
  { code: 'MDL', name: 'Moldovan Leu', symbol: 'L' },
  { code: 'MGA', name: 'Malagasy Ariary', symbol: 'Ar' },
  { code: 'MKD', name: 'Macedonian Denar', symbol: 'ден' },
  { code: 'MMK', name: 'Myanmar Kyat', symbol: 'K' },
  { code: 'MNT', name: 'Mongolian Tugrik', symbol: '₮' },
  { code: 'MOP', name: 'Macanese Pataca', symbol: 'MOP$' },
  { code: 'MRU', name: 'Mauritanian Ouguiya', symbol: 'UM' },
  { code: 'MUR', name: 'Mauritian Rupee', symbol: '₨' },
  { code: 'MVR', name: 'Maldivian Rufiyaa', symbol: 'Rf' },
  { code: 'MWK', name: 'Malawian Kwacha', symbol: 'MK' },
  { code: 'MXN', name: 'Mexican Peso', symbol: '$' },
  { code: 'MZN', name: 'Mozambican Metical', symbol: 'MT' },
  { code: 'NAD', name: 'Namibian Dollar', symbol: '$' },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦' },
  { code: 'NIO', name: 'Nicaraguan Córdoba', symbol: 'C$' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr' },
  { code: 'NPR', name: 'Nepalese Rupee', symbol: '₨' },
  { code: 'OMR', name: 'Omani Rial', symbol: 'ر.ع.' },
  { code: 'PAB', name: 'Panamanian Balboa', symbol: 'B/.' },
  { code: 'PEN', name: 'Peruvian Sol', symbol: 'S/' },
  { code: 'PGK', name: 'Papua New Guinean Kina', symbol: 'K' },
  { code: 'PKR', name: 'Pakistani Rupee', symbol: '₨' },
  { code: 'PLN', name: 'Polish Zloty', symbol: 'zł' },
  { code: 'PYG', name: 'Paraguayan Guarani', symbol: '₲' },
  { code: 'QAR', name: 'Qatari Rial', symbol: 'ر.ق' },
  { code: 'RON', name: 'Romanian Leu', symbol: 'lei' },
  { code: 'RSD', name: 'Serbian Dinar', symbol: 'дин.' },
  { code: 'RUB', name: 'Russian Ruble', symbol: '₽' },
  { code: 'RWF', name: 'Rwandan Franc', symbol: 'FRw' },
  { code: 'SBD', name: 'Solomon Islands Dollar', symbol: '$' },
  { code: 'SCR', name: 'Seychellois Rupee', symbol: '₨' },
  { code: 'SDG', name: 'Sudanese Pound', symbol: 'ج.س.' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' },
  { code: 'SHP', name: 'Saint Helena Pound', symbol: '£' },
  { code: 'SLL', name: 'Sierra Leonean Leone', symbol: 'Le' },
  { code: 'SOS', name: 'Somali Shilling', symbol: 'S' },
  { code: 'SRD', name: 'Surinamese Dollar', symbol: '$' },
  { code: 'SSP', name: 'South Sudanese Pound', symbol: '£' },
  { code: 'STN', name: 'São Tomé and Príncipe Dobra', symbol: 'Db' },
  { code: 'SYP', name: 'Syrian Pound', symbol: '£' },
  { code: 'SZL', name: 'Swazi Lilangeni', symbol: 'L' },
  { code: 'TJS', name: 'Tajikistani Somoni', symbol: 'SM' },
  { code: 'TMT', name: 'Turkmenistani Manat', symbol: 'T' },
  { code: 'TND', name: 'Tunisian Dinar', symbol: 'د.ت' },
  { code: 'TOP', name: 'Tongan Paʻanga', symbol: 'T$' },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺' },
  { code: 'TTD', name: 'Trinidad and Tobago Dollar', symbol: 'TT$' },
  { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh' },
  { code: 'UAH', name: 'Ukrainian Hryvnia', symbol: '₴' },
  { code: 'UGX', name: 'Ugandan Shilling', symbol: 'USh' },
  { code: 'UYU', name: 'Uruguayan Peso', symbol: '$U' },
  { code: 'UZS', name: 'Uzbekistan Som', symbol: 'лв' },
  { code: 'VES', name: 'Venezuelan Bolívar', symbol: 'Bs.S' },
  { code: 'VUV', name: 'Vanuatu Vatu', symbol: 'VT' },
  { code: 'WST', name: 'Samoan Tala', symbol: 'WS$' },
  { code: 'XAF', name: 'Central African CFA Franc', symbol: 'FCFA' },
  { code: 'XOF', name: 'West African CFA Franc', symbol: 'CFA' },
  { code: 'YER', name: 'Yemeni Rial', symbol: '﷼' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
  { code: 'ZMW', name: 'Zambian Kwacha', symbol: 'ZK' },
  { code: 'ZWL', name: 'Zimbabwean Dollar', symbol: 'Z$' },
];

const currencies: Currency[] = [...majorCurrencies, ...allCurrencies];

const countryToCurrency: { [key: string]: string } = {
  MY: 'MYR', SG: 'SGD', TH: 'THB', ID: 'IDR', PH: 'PHP', VN: 'VND',
  BN: 'BND', KH: 'KHR', LA: 'LAK', MM: 'MMK',
  JP: 'JPY', CN: 'CNY', KR: 'KRW', HK: 'HKD', TW: 'TWD', MO: 'MOP', MN: 'MNT',
  IN: 'INR', PK: 'PKR', BD: 'BDT', LK: 'LKR', NP: 'NPR', BT: 'BTN', MV: 'MVR',
  KZ: 'KZT', UZ: 'UZS', TJ: 'TJS', KG: 'KGS', TM: 'TMT', AF: 'AFN',
  AE: 'AED', SA: 'SAR', QA: 'QAR', KW: 'KWD', BH: 'BHD', OM: 'OMR',
  JO: 'JOD', LB: 'LBP', SY: 'SYP', IQ: 'IQD', IR: 'IRR', YE: 'YER',
  IL: 'ILS', PS: 'ILS', TR: 'TRY',
  AU: 'AUD', NZ: 'NZD', FJ: 'FJD', PG: 'PGK', SB: 'SBD', VU: 'VUV', WS: 'WST', TO: 'TOP',
  US: 'USD', CA: 'CAD', MX: 'MXN', GT: 'GTQ', BZ: 'BZD', SV: 'USD', HN: 'HNL', NI: 'NIO', CR: 'CRC', PA: 'PAB',
  JM: 'JMD', HT: 'HTG', DO: 'DOP', CU: 'CUP', BS: 'BSD', BB: 'BBD', TT: 'TTD', GY: 'GYD', SR: 'SRD', AW: 'AWG', KY: 'KYD', BM: 'BMD',
  BR: 'BRL', AR: 'ARS', CL: 'CLP', CO: 'COP', PE: 'PEN', VE: 'VES', EC: 'USD', BO: 'BOB', PY: 'PYG', UY: 'UYU',
  DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', NL: 'EUR', BE: 'EUR',
  AT: 'EUR', IE: 'EUR', PT: 'EUR', FI: 'EUR', GR: 'EUR', SK: 'EUR', SI: 'EUR',
  EE: 'EUR', LV: 'EUR', LT: 'EUR', CY: 'EUR', MT: 'EUR', LU: 'EUR',
  MC: 'EUR', AD: 'EUR', SM: 'EUR', VA: 'EUR', ME: 'EUR', XK: 'EUR', HR: 'EUR',
  GB: 'GBP', CH: 'CHF', LI: 'CHF', NO: 'NOK', SE: 'SEK', DK: 'DKK',
  PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', BG: 'BGN',
  RS: 'RSD', BA: 'BAM', MK: 'MKD', AL: 'ALL',
  UA: 'UAH', MD: 'MDL', BY: 'BYN', RU: 'RUB', GE: 'GEL', AM: 'AMD', AZ: 'AZN', IS: 'ISK',
  ZA: 'ZAR', NG: 'NGN', EG: 'EGP', KE: 'KES', GH: 'GHS', TZ: 'TZS', UG: 'UGX', ET: 'ETB',
  MA: 'MAD', DZ: 'DZD', TN: 'TND', LY: 'LYD', SD: 'SDG', AO: 'AOA', MZ: 'MZN', ZM: 'ZMW', ZW: 'ZWL',
  BW: 'BWP', NA: 'NAD', MU: 'MUR', SC: 'SCR', MG: 'MGA', RW: 'RWF',
  SN: 'XOF', CI: 'XOF', CM: 'XAF', GA: 'XAF', CG: 'XAF', CD: 'CDF',
  ML: 'XOF', BF: 'XOF', NE: 'XOF', TG: 'XOF', BJ: 'XOF', GN: 'GNF',
  SL: 'SLL', LR: 'LRD', GM: 'GMD', CV: 'CVE', GW: 'XOF', MR: 'MRU',
  DJ: 'DJF', ER: 'ERN', SO: 'SOS', SS: 'SSP', BI: 'BIF', MW: 'MWK', LS: 'LSL', SZ: 'SZL', KM: 'KMF', ST: 'STN',
};

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

function getCachedRates(): { rates: ExchangeRates; lastUpdated: Date | null } | null {
  try {
    const storedRates = localStorage.getItem(STORAGE_KEYS.exchangeRates);
    if (!storedRates) {
      return null;
    }

    const parsedRates = JSON.parse(storedRates) as ExchangeRates;
    if (!parsedRates || typeof parsedRates !== 'object') {
      return null;
    }

    const storedUpdatedAt = localStorage.getItem(STORAGE_KEYS.ratesUpdatedAt);
    return {
      rates: parsedRates,
      lastUpdated: storedUpdatedAt ? new Date(storedUpdatedAt) : null,
    };
  } catch {
    return null;
  }
}

function persistRates(rates: ExchangeRates, updatedAt: Date | null) {
  try {
    localStorage.setItem(STORAGE_KEYS.exchangeRates, JSON.stringify(rates));
    if (updatedAt) {
      localStorage.setItem(STORAGE_KEYS.ratesUpdatedAt, updatedAt.toISOString());
    } else {
      localStorage.removeItem(STORAGE_KEYS.ratesUpdatedAt);
    }
  } catch {
    // Ignore storage failures and keep in-memory state.
  }
}

function getCurrencyFromBrowserLocale(): string | null {
  if (typeof navigator === 'undefined') {
    return null;
  }

  const locales = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const locale of locales) {
    const match = locale.match(/[-_]([A-Z]{2})(?:[-_]|$)/i);
    const countryCode = match?.[1]?.toUpperCase();
    if (!countryCode) {
      continue;
    }

    const detectedCurrency = countryToCurrency[countryCode];
    if (detectedCurrency) {
      return detectedCurrency;
    }
  }

  return null;
}

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedCurrency, setSelectedCurrencyState] = useState('MYR');
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates>({ MYR: 1 });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchExchangeRates = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('https://api.exchangerate-api.com/v4/latest/MYR');

      if (!response.ok) {
        throw new Error('Failed to fetch exchange rates');
      }

      const data = await response.json();
      const nextRates = { MYR: 1, ...data.rates };
      const updatedAt = new Date();

      setExchangeRates(nextRates);
      setLastUpdated(updatedAt);
      persistRates(nextRates, updatedAt);
    } catch (err) {
      console.error('Error fetching exchange rates:', err);

      const cachedRates = getCachedRates();
      if (cachedRates) {
        setExchangeRates(cachedRates.rates);
        setLastUpdated(cachedRates.lastUpdated);
        setError('Unable to fetch live rates. Using cached rates.');
      } else {
        setExchangeRates(FALLBACK_RATES);
        setLastUpdated(null);
        setError('Unable to fetch live rates. Showing MYR when no cached estimate is available.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const detectUserCurrency = useCallback(async () => {
    const applyCurrency = (code: string) => {
      setSelectedCurrencyState(code);
      localStorage.setItem(STORAGE_KEYS.selectedCurrency, code);
    };

    try {
      const savedCurrency = localStorage.getItem(STORAGE_KEYS.selectedCurrency);
      if (savedCurrency && currencies.some(c => c.code === savedCurrency)) {
        setSelectedCurrencyState(savedCurrency);
        return;
      }

      // Prefer geolocation (IP-based) over browser locale, because browser
      // locale often reports "en-US" regardless of the user's actual country.
      try {
        const response = await fetch('https://ipapi.co/json/');
        if (response.ok) {
          const data = await response.json();
          const detectedCurrency = countryToCurrency[data.country_code];
          if (detectedCurrency && currencies.some(c => c.code === detectedCurrency)) {
            applyCurrency(detectedCurrency);
            return;
          }
        }
      } catch {
        // Geolocation failed; default to MYR (prices are in MYR).
      }
    } catch {
      // Default to MYR
    }
  }, []);

  const setSelectedCurrency = useCallback((currency: string) => {
    if (!currencies.some(option => option.code === currency)) {
      return;
    }

    setSelectedCurrencyState(currency);
    localStorage.setItem(STORAGE_KEYS.selectedCurrency, currency);
  }, []);

  useEffect(() => {
    const cachedRates = getCachedRates();
    if (cachedRates) {
      setExchangeRates(cachedRates.rates);
      setLastUpdated(cachedRates.lastUpdated);
    }

    void fetchExchangeRates();
    void detectUserCurrency();

    const interval = setInterval(fetchExchangeRates, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchExchangeRates, detectUserCurrency]);

  const convertFromMYR = useCallback((amountMYR: number) => {
    const rate = selectedCurrency === 'MYR' ? 1 : exchangeRates[selectedCurrency];
    if (typeof rate !== 'number') {
      return { converted: amountMYR, original: amountMYR };
    }

    return { converted: amountMYR * rate, original: amountMYR };
  }, [selectedCurrency, exchangeRates]);

  const formatPrice = useCallback((amountMYR: number, showOriginal = true) => {
    const hasRate = selectedCurrency === 'MYR' || typeof exchangeRates[selectedCurrency] === 'number';
    const currency = currencies.find(c => c.code === selectedCurrency);
    const symbol = currency?.symbol || selectedCurrency;
    const { converted } = convertFromMYR(amountMYR);

    if (!hasRate) {
      return `RM${amountMYR.toLocaleString()}`;
    }

    let formattedConverted: string;
    if (['JPY', 'KRW', 'VND', 'IDR'].includes(selectedCurrency)) {
      formattedConverted = `${symbol}${Math.round(converted).toLocaleString()}`;
    } else {
      formattedConverted = `${symbol}${converted.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    }

    if (selectedCurrency === 'MYR') {
      return `RM${amountMYR.toLocaleString()}`;
    }

    if (!showOriginal) {
      return formattedConverted;
    }

    return `${formattedConverted} (RM${amountMYR.toLocaleString()})`;
  }, [selectedCurrency, exchangeRates, convertFromMYR]);

  return (
    <CurrencyContext.Provider
      value={{
        selectedCurrency, setSelectedCurrency, exchangeRates,
        isLoading, error, convertFromMYR, formatPrice,
        currencies, lastUpdated,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
};

export { currencies };
