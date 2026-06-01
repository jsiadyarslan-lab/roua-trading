export declare enum AssetClass {
    FOREX = "FOREX",
    CRYPTO = "CRYPTO",
    COMMODITY = "COMMODITY",
    STOCK = "STOCK",
    INDEX = "INDEX"
}
export interface SymbolMetadata {
    assetClass: AssetClass;
    contractSize: number;
    lotStep: number;
    minLot: number;
    maxLot: number;
    defaultLeverage: number;
    pipSize: number;
    priceDecimals: number;
}
export declare function getSymbolMetadata(symbol: string): SymbolMetadata;
export declare function lotsToUnits(lots: number, symbol: string): number;
export declare function unitsToLots(units: number, symbol: string): number;
export declare function roundLotSize(lots: number, symbol: string): number;
export declare function calculateNotionalValue(quantity: number, price: number): number;
export declare function calculateMargin(quantity: number, price: number, symbol: string, customLeverage?: number): number;
export declare function calculatePipValue(quantity: number, symbol: string): number;
export declare function calculateRisk(entryPrice: number, stopLoss: number, quantity: number): number;
export declare function calculatePositionSizeFromRisk(riskBudget: number, entryPrice: number, stopLoss: number, symbol: string): {
    quantityUnits: number;
    quantityLots: number;
    margin: number;
    risk: number;
    notional: number;
};
