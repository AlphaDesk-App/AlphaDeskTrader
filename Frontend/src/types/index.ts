export interface Quote {
  symbol: string;
  lastPrice: number;
  bidPrice: number;
  askPrice: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  closePrice: number;
  totalVolume: number;
  netChange: number;
  netPercentChange: number;
  tradeTime: number;
}

export interface Position {
  symbol: string;
  description: string;
  longQuantity: number;
  shortQuantity: number;
  averagePrice: number;
  currentDayProfitLoss: number;
  currentDayProfitLossPercentage: number;
  marketValue: number;
  instrument: {
    assetType: string;
    symbol: string;
  };
}

export interface Account {
  accountNumber: string;
  type: string;
  roundTrips: number;
  isDayTrader: boolean;
  currentBalances: {
    liquidationValue: number;
    buyingPower: number;
    cashBalance: number;
    dayTradingBuyingPower: number;
  };
  positions?: Position[];
}

export interface Order {
  orderId: number;
  status: string;
  orderType: string;
  session: string;
  duration: string;
  enteredTime: string;
  price?: number;
  quantity: number;
  filledQuantity: number;
  orderLegCollection: {
    instruction: string;
    quantity: number;
    instrument: {
      symbol: string;
      assetType: string;
    };
  }[];
}

export interface WatchlistItem {
  symbol: string;
  name: string;
}

export type Theme = 'dark' | 'light';

export type AssetType = 'EQUITY' | 'OPTION';

export interface PlaceOrderPayload {
  orderType: string;
  session: string;
  duration: string;
  orderStrategyType: string;
  price?: number;
  orderLegCollection: {
    instruction: string;
    quantity: number;
    instrument: {
      symbol: string;
      assetType: string;
    };
  }[];
}
