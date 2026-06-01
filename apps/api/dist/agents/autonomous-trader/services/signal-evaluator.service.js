"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var SignalEvaluatorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SignalEvaluatorService = void 0;
const common_1 = require("@nestjs/common");
const agent_types_1 = require("../types/agent.types");
const swing_strategy_1 = require("../strategies/swing.strategy");
const grid_strategy_1 = require("../strategies/grid.strategy");
const mean_reversion_strategy_1 = require("../strategies/mean-reversion.strategy");
const momentum_breakout_strategy_1 = require("../strategies/momentum-breakout.strategy");
const dca_strategy_1 = require("../strategies/dca.strategy");
const vwap_rsi_strategy_1 = require("../strategies/vwap-rsi.strategy");
const adaptive_strategy_selector_service_1 = require("./adaptive-strategy-selector.service");
let SignalEvaluatorService = SignalEvaluatorService_1 = class SignalEvaluatorService {
    constructor(adaptiveSelector) {
        this.adaptiveSelector = adaptiveSelector;
        this.logger = new common_1.Logger(SignalEvaluatorService_1.name);
        this.strategies = new Map();
        this.lastAutoSelection = new Map();
        this.logger.log('📊 Signal Evaluator initialized (with AUTO adaptive selection)');
    }
    async evaluate(market, strategyType, strategyParams, userId) {
        try {
            let effectiveStrategy = strategyType;
            let autoScores = null;
            if (strategyType === agent_types_1.StrategyType.AUTO) {
                const selection = await this.adaptiveSelector.selectBestStrategy(userId, market);
                effectiveStrategy = selection.strategy;
                autoScores = selection.scores;
                const lastStrategy = this.lastAutoSelection.get(userId);
                if (lastStrategy && lastStrategy !== effectiveStrategy) {
                    this.logger.log(`📊 AUTO strategy switched for ${userId}: ${lastStrategy} → ${effectiveStrategy} ` +
                        `(regime: ${selection.regime.regime}, score: ${selection.scores[0]?.score})`);
                }
                this.lastAutoSelection.set(userId, effectiveStrategy);
            }
            const strategy = this._getOrCreateStrategy(effectiveStrategy, strategyParams, userId);
            if (!strategy) {
                this.logger.warn(`Unknown strategy type: ${effectiveStrategy}`);
                return null;
            }
            let signal = await strategy.evaluate(market);
            if (!signal && strategyType === agent_types_1.StrategyType.AUTO && autoScores && autoScores.length > 1) {
                const fallbackStrategies = autoScores
                    .filter(s => s.strategy !== effectiveStrategy)
                    .slice(0, 3);
                for (const fallback of fallbackStrategies) {
                    const fallbackStrategy = this._getOrCreateStrategy(fallback.strategy, strategyParams, userId);
                    if (!fallbackStrategy)
                        continue;
                    try {
                        const fallbackSignal = await fallbackStrategy.evaluate(market);
                        if (fallbackSignal) {
                            signal = fallbackSignal;
                            effectiveStrategy = fallback.strategy;
                            this.logger.log(`📊 AUTO fallback: ${fallback.strategy} generated signal for ${market.symbol} ` +
                                `(best strategy had no signal, fallback score: ${fallback.score})`);
                            break;
                        }
                    }
                    catch {
                    }
                }
            }
            if (!signal) {
                this.logger.debug(`📊 No signal for ${market.symbol} using ${effectiveStrategy} strategy`);
                return null;
            }
            if (strategyType === agent_types_1.StrategyType.AUTO) {
                signal.metadata = {
                    ...signal.metadata,
                    autoSelected: true,
                    originalStrategy: agent_types_1.StrategyType.AUTO,
                    effectiveStrategy,
                };
            }
            this.logger.log(`📊 Signal generated: ${signal.action} ${signal.symbol} ` +
                `(strategy: ${effectiveStrategy}${strategyType === agent_types_1.StrategyType.AUTO ? ' [AUTO]' : ''}, ` +
                `confidence: ${signal.confidence}%, R:R ${signal.riskRewardRatio.toFixed(2)}) ` +
                `— ${signal.reasoning.substring(0, 80)}`);
            return signal;
        }
        catch (error) {
            this.logger.error(`Signal evaluation failed for ${market.symbol}: ${error.message}`);
            return null;
        }
    }
    async evaluateAll(market, strategyParams, userId) {
        const strategies = [
            agent_types_1.StrategyType.SWING,
            agent_types_1.StrategyType.GRID,
            agent_types_1.StrategyType.MEAN_REVERSION,
            agent_types_1.StrategyType.MOMENTUM_BREAKOUT,
            agent_types_1.StrategyType.DCA,
            agent_types_1.StrategyType.VWAP_RSI,
        ];
        const signals = [];
        for (const strategyType of strategies) {
            try {
                const signal = await this.evaluate(market, strategyType, strategyParams, userId);
                if (signal) {
                    signals.push(signal);
                }
            }
            catch {
            }
        }
        if (signals.length === 0)
            return null;
        signals.sort((a, b) => b.confidence - a.confidence);
        return signals[0];
    }
    async getAutoRegimeInfo(userId, market) {
        if (!market)
            return null;
        const regime = this.adaptiveSelector.detectRegime(market);
        const scores = await this.adaptiveSelector.scoreStrategies(userId, regime);
        return {
            regime: regime.regime,
            confidence: regime.confidence,
            indicators: regime.indicators,
            recommendedStrategies: regime.recommendedStrategies,
            currentStrategy: this.lastAutoSelection.get(userId) || null,
            strategyScores: scores.map(s => ({
                strategy: s.strategy,
                score: s.score,
                reason: s.reason,
            })),
        };
    }
    updateStrategy(userId, strategyType, params) {
        const key = `${userId}:${strategyType}`;
        this.strategies.delete(key);
        this.logger.log(`📊 Strategy updated for user ${userId}: ${strategyType}`);
    }
    clearUserStrategies(userId) {
        for (const key of this.strategies.keys()) {
            if (key.startsWith(`${userId}:`)) {
                this.strategies.delete(key);
            }
        }
        this.lastAutoSelection.delete(userId);
    }
    _getOrCreateStrategy(strategyType, params, userId) {
        if (strategyType === agent_types_1.StrategyType.AUTO) {
            this.logger.warn('AUTO strategy should be resolved before _getOrCreateStrategy');
            return null;
        }
        const key = `${userId}:${strategyType}`;
        let strategy = this.strategies.get(key);
        if (strategy)
            return strategy;
        switch (strategyType) {
            case agent_types_1.StrategyType.SWING:
                strategy = new swing_strategy_1.SwingStrategy(params);
                break;
            case agent_types_1.StrategyType.GRID:
                strategy = new grid_strategy_1.GridStrategy(params);
                break;
            case agent_types_1.StrategyType.MEAN_REVERSION:
                strategy = new mean_reversion_strategy_1.MeanReversionStrategy(params);
                break;
            case agent_types_1.StrategyType.MOMENTUM_BREAKOUT:
                strategy = new momentum_breakout_strategy_1.MomentumBreakoutStrategy(params);
                break;
            case agent_types_1.StrategyType.DCA:
                strategy = new dca_strategy_1.DCAStrategy(params);
                break;
            case agent_types_1.StrategyType.VWAP_RSI:
                strategy = new vwap_rsi_strategy_1.VWAPRSIStrategy(params);
                break;
            default:
                return null;
        }
        this.strategies.set(key, strategy);
        return strategy;
    }
};
exports.SignalEvaluatorService = SignalEvaluatorService;
exports.SignalEvaluatorService = SignalEvaluatorService = SignalEvaluatorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [adaptive_strategy_selector_service_1.AdaptiveStrategySelectorService])
], SignalEvaluatorService);
//# sourceMappingURL=signal-evaluator.service.js.map