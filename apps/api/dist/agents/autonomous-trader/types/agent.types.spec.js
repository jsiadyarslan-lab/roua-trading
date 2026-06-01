"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const agent_types_1 = require("./agent.types");
describe('StrategyType', () => {
    it('should contain all expected strategy values', () => {
        const expectedStrategies = [
            'AUTO',
            'SCALPING',
            'SWING',
            'GRID',
            'MEAN_REVERSION',
            'MOMENTUM_BREAKOUT',
            'DCA',
            'VWAP_RSI',
        ];
        expectedStrategies.forEach((strategy) => {
            expect(agent_types_1.StrategyType[strategy]).toBe(strategy);
        });
    });
    it('should have exactly 8 strategy types matching Prisma schema', () => {
        const strategyValues = Object.values(agent_types_1.StrategyType);
        expect(strategyValues).toHaveLength(8);
    });
    it('should match the values used in StartAgentDto @IsIn decorator', () => {
        const dtoAllowedValues = ['AUTO', 'SCALPING', 'SWING', 'GRID', 'MEAN_REVERSION', 'MOMENTUM_BREAKOUT', 'DCA', 'VWAP_RSI'];
        const enumValues = Object.values(agent_types_1.StrategyType);
        expect(enumValues.sort()).toEqual(dtoAllowedValues.sort());
    });
});
describe('AgentStatus', () => {
    it('should contain all expected agent status values', () => {
        const expectedStatuses = [
            'IDLE',
            'RUNNING',
            'PAUSED',
            'STOPPED',
            'EMERGENCY_STOP',
            'DAILY_LIMIT_REACHED',
        ];
        expectedStatuses.forEach((status) => {
            expect(agent_types_1.AgentStatus[status]).toBe(status);
        });
    });
    it('should have exactly 6 status values', () => {
        const statusValues = Object.values(agent_types_1.AgentStatus);
        expect(statusValues).toHaveLength(6);
    });
    it('IDLE should be the default/initial status', () => {
        expect(agent_types_1.AgentStatus.IDLE).toBe('IDLE');
    });
    it('EMERGENCY_STOP should be distinct from STOPPED', () => {
        expect(agent_types_1.AgentStatus.EMERGENCY_STOP).not.toBe(agent_types_1.AgentStatus.STOPPED);
    });
});
describe('MarketRegime', () => {
    it('should contain all expected market regime values', () => {
        const expectedRegimes = [
            'TRENDING_UP',
            'TRENDING_DOWN',
            'RANGING',
            'VOLATILE',
            'TRANSITIONAL',
        ];
        expectedRegimes.forEach((regime) => {
            expect(agent_types_1.MarketRegime[regime]).toBe(regime);
        });
    });
});
describe('StrategySignal', () => {
    it('should contain all expected signal values', () => {
        const expectedSignals = [
            'STRONG_BUY',
            'BUY',
            'NEUTRAL',
            'SELL',
            'STRONG_SELL',
        ];
        expectedSignals.forEach((signal) => {
            expect(agent_types_1.StrategySignal[signal]).toBe(signal);
        });
    });
});
describe('StartAgentDto', () => {
    it('should validate a valid DTO with all fields', async () => {
        const dto = (0, class_transformer_1.plainToInstance)(agent_types_1.StartAgentDto, {
            strategy: 'AUTO',
            credentialId: 'cred-123',
            symbols: ['BTC/USDT', 'ETH/USDT'],
            maxPositionSizePercent: 2,
            maxDailyLossPercent: 5,
            maxOpenPositions: 5,
            riskPerTradePercent: 1.5,
            strategyParams: {},
        });
        const errors = await (0, class_validator_1.validate)(dto);
        expect(errors.length).toBe(0);
    });
    it('should validate a valid DTO with only required fields', async () => {
        const dto = (0, class_transformer_1.plainToInstance)(agent_types_1.StartAgentDto, {
            strategy: 'SCALPING',
        });
        const errors = await (0, class_validator_1.validate)(dto);
        expect(errors.length).toBe(0);
    });
    it('should reject an invalid strategy', async () => {
        const dto = (0, class_transformer_1.plainToInstance)(agent_types_1.StartAgentDto, {
            strategy: 'INVALID_STRATEGY',
        });
        const errors = await (0, class_validator_1.validate)(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('strategy');
    });
    it('should reject when strategy is missing', async () => {
        const dto = (0, class_transformer_1.plainToInstance)(agent_types_1.StartAgentDto, {});
        const errors = await (0, class_validator_1.validate)(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('strategy');
    });
    it('should reject maxPositionSizePercent below minimum (0.1)', async () => {
        const dto = (0, class_transformer_1.plainToInstance)(agent_types_1.StartAgentDto, {
            strategy: 'AUTO',
            maxPositionSizePercent: 0.05,
        });
        const errors = await (0, class_validator_1.validate)(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('maxPositionSizePercent');
    });
    it('should reject maxPositionSizePercent above maximum (100)', async () => {
        const dto = (0, class_transformer_1.plainToInstance)(agent_types_1.StartAgentDto, {
            strategy: 'AUTO',
            maxPositionSizePercent: 101,
        });
        const errors = await (0, class_validator_1.validate)(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('maxPositionSizePercent');
    });
    it('should reject maxDailyLossPercent below minimum (0.1)', async () => {
        const dto = (0, class_transformer_1.plainToInstance)(agent_types_1.StartAgentDto, {
            strategy: 'AUTO',
            maxDailyLossPercent: 0.01,
        });
        const errors = await (0, class_validator_1.validate)(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('maxDailyLossPercent');
    });
    it('should reject maxDailyLossPercent above maximum (100)', async () => {
        const dto = (0, class_transformer_1.plainToInstance)(agent_types_1.StartAgentDto, {
            strategy: 'AUTO',
            maxDailyLossPercent: 200,
        });
        const errors = await (0, class_validator_1.validate)(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('maxDailyLossPercent');
    });
    it('should reject maxOpenPositions below minimum (1)', async () => {
        const dto = (0, class_transformer_1.plainToInstance)(agent_types_1.StartAgentDto, {
            strategy: 'AUTO',
            maxOpenPositions: 0,
        });
        const errors = await (0, class_validator_1.validate)(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('maxOpenPositions');
    });
    it('should reject maxOpenPositions above maximum (50)', async () => {
        const dto = (0, class_transformer_1.plainToInstance)(agent_types_1.StartAgentDto, {
            strategy: 'AUTO',
            maxOpenPositions: 51,
        });
        const errors = await (0, class_validator_1.validate)(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('maxOpenPositions');
    });
    it('should reject riskPerTradePercent below minimum (0.1)', async () => {
        const dto = (0, class_transformer_1.plainToInstance)(agent_types_1.StartAgentDto, {
            strategy: 'AUTO',
            riskPerTradePercent: 0.01,
        });
        const errors = await (0, class_validator_1.validate)(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('riskPerTradePercent');
    });
    it('should reject riskPerTradePercent above maximum (10)', async () => {
        const dto = (0, class_transformer_1.plainToInstance)(agent_types_1.StartAgentDto, {
            strategy: 'AUTO',
            riskPerTradePercent: 15,
        });
        const errors = await (0, class_validator_1.validate)(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('riskPerTradePercent');
    });
    it('should accept all valid strategy types', async () => {
        const strategies = Object.values(agent_types_1.StrategyType);
        for (const strategy of strategies) {
            const dto = (0, class_transformer_1.plainToInstance)(agent_types_1.StartAgentDto, { strategy });
            const errors = await (0, class_validator_1.validate)(dto);
            expect(errors.length).toBe(0);
        }
    });
    it('should reject non-string symbols array items', async () => {
        const dto = (0, class_transformer_1.plainToInstance)(agent_types_1.StartAgentDto, {
            strategy: 'AUTO',
            symbols: [123, 456],
        });
        const errors = await (0, class_validator_1.validate)(dto);
        expect(errors.length).toBeGreaterThan(0);
    });
});
describe('ChangeStrategyDto', () => {
    it('should validate a valid DTO', async () => {
        const dto = (0, class_transformer_1.plainToInstance)(agent_types_1.ChangeStrategyDto, {
            strategy: 'SWING',
        });
        const errors = await (0, class_validator_1.validate)(dto);
        expect(errors.length).toBe(0);
    });
    it('should validate a valid DTO with strategyParams', async () => {
        const dto = (0, class_transformer_1.plainToInstance)(agent_types_1.ChangeStrategyDto, {
            strategy: 'SCALPING',
            strategyParams: {
                scalpingTimeframe: '1m',
                scalpingTakeProfitPips: 10,
            },
        });
        const errors = await (0, class_validator_1.validate)(dto);
        expect(errors.length).toBe(0);
    });
    it('should reject an invalid strategy', async () => {
        const dto = (0, class_transformer_1.plainToInstance)(agent_types_1.ChangeStrategyDto, {
            strategy: 'NONEXISTENT',
        });
        const errors = await (0, class_validator_1.validate)(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('strategy');
    });
    it('should reject when strategy is missing', async () => {
        const dto = (0, class_transformer_1.plainToInstance)(agent_types_1.ChangeStrategyDto, {});
        const errors = await (0, class_validator_1.validate)(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('strategy');
    });
    it('should accept all valid strategy types', async () => {
        const strategies = Object.values(agent_types_1.StrategyType);
        for (const strategy of strategies) {
            const dto = (0, class_transformer_1.plainToInstance)(agent_types_1.ChangeStrategyDto, { strategy });
            const errors = await (0, class_validator_1.validate)(dto);
            expect(errors.length).toBe(0);
        }
    });
});
describe('StrategyParamsDto', () => {
    it('should validate an empty DTO (all fields optional)', async () => {
        const dto = (0, class_transformer_1.plainToInstance)(agent_types_1.StrategyParamsDto, {});
        const errors = await (0, class_validator_1.validate)(dto);
        expect(errors.length).toBe(0);
    });
    it('should validate scalping params', async () => {
        const dto = (0, class_transformer_1.plainToInstance)(agent_types_1.StrategyParamsDto, {
            scalpingTimeframe: '1m',
            scalpingTakeProfitPips: 10,
            scalpingStopLossPips: 5,
            scalpingMaxSpread: 3,
        });
        const errors = await (0, class_validator_1.validate)(dto);
        expect(errors.length).toBe(0);
    });
    it('should validate grid params', async () => {
        const dto = (0, class_transformer_1.plainToInstance)(agent_types_1.StrategyParamsDto, {
            gridLevels: 5,
            gridSpacingPercent: 0.5,
            gridQuantityPerLevel: 100,
        });
        const errors = await (0, class_validator_1.validate)(dto);
        expect(errors.length).toBe(0);
    });
});
describe('UpdateRiskParamsDto', () => {
    it('should validate an empty DTO (all fields optional)', async () => {
        const dto = (0, class_transformer_1.plainToInstance)(agent_types_1.UpdateRiskParamsDto, {});
        const errors = await (0, class_validator_1.validate)(dto);
        expect(errors.length).toBe(0);
    });
    it('should validate valid risk parameters', async () => {
        const dto = (0, class_transformer_1.plainToInstance)(agent_types_1.UpdateRiskParamsDto, {
            maxPositionSizePercent: 1.5,
            maxDailyLossPercent: 3,
            maxOpenPositions: 3,
            riskPerTradePercent: 1,
        });
        const errors = await (0, class_validator_1.validate)(dto);
        expect(errors.length).toBe(0);
    });
    it('should reject maxPositionSizePercent above 100', async () => {
        const dto = (0, class_transformer_1.plainToInstance)(agent_types_1.UpdateRiskParamsDto, {
            maxPositionSizePercent: 150,
        });
        const errors = await (0, class_validator_1.validate)(dto);
        expect(errors.length).toBeGreaterThan(0);
    });
    it('should reject maxOpenPositions above 50', async () => {
        const dto = (0, class_transformer_1.plainToInstance)(agent_types_1.UpdateRiskParamsDto, {
            maxOpenPositions: 100,
        });
        const errors = await (0, class_validator_1.validate)(dto);
        expect(errors.length).toBeGreaterThan(0);
    });
});
//# sourceMappingURL=agent.types.spec.js.map