export interface UserPreferences {
    userId: string;
    walletAddress: string;
    targetSupplyApyDeviation: number;
    date: Date;
    vaultAddresses: string[];
    portfolioPercentages: Record<string, Record<string, number>>;
    riskToleranceRating: number;
}