// Parses Schwab options symbol format
// e.g. QQQ_260401C00584000 or QQQ 260401C00584000
// → { underlying: 'QQQ', strike: 584, type: 'Call', expiry: '04/01/26' }

export interface ParsedOption {
  underlying: string;
  strike: number;
  type: 'Call' | 'Put';
  expiry: string;
  display: string;
}

export function parseOptionSymbol(symbol: string): ParsedOption | null {
  // Normalize: replace space with underscore
  const s = symbol.replace(' ', '_');
  // Match pattern: UNDERLYING_YYMMDD[C|P]STRIKE
  const match = s.match(/^([A-Z]+)[_ ]?(\d{2})(\d{2})(\d{2})([CP])(\d+)$/);
  if (!match) return null;

  const [, underlying, yy, mm, dd, cp, strikeRaw] = match;
  const strike = parseInt(strikeRaw) / 1000;
  const type = cp === 'C' ? 'Call' : 'Put';
  const expiry = `${mm}/${dd}/20${yy}`;

  return {
    underlying,
    strike,
    type,
    expiry,
    display: `${underlying} $${strike} ${type} ${mm}/${dd}/${yy}`,
  };
}

export function formatSymbol(symbol: string): string {
  const parsed = parseOptionSymbol(symbol);
  return parsed ? parsed.display : symbol;
}

export function isOptionSymbol(symbol: string): boolean {
  return parseOptionSymbol(symbol) !== null;
}

// Options P&L multiplier — 1 contract = 100 shares
export function getMultiplier(assetType: string): number {
  return assetType === 'OPTION' ? 100 : 1;
}
