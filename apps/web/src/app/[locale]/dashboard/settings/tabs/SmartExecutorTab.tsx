"use client";

import { useTranslations } from "next-intl";
import { Shield, Zap, Activity, Target, Clock, Cpu } from "lucide-react";
import { COLORS } from "@/lib/council/types";
import { hexToRgba } from "@/lib/council/format";
import { SectionCard, SettingRow, Toggle, SelectBox, NumberInput } from "../_components/SettingsPrimitives";

/**
 * V312: Smart Executor Settings Tab
 * 
 * Controls the Smart Executor (M1/M5/M15 auto-trader):
 * - Enable/disable per user
 * - Risk per trade
 * - Max open positions
 * - Min confidence threshold
 * - SL/TP defaults
 * - Allowed timeframes
 * - Max daily loss
 */

interface SmartExecutorTabProps {
  settings: Record<string, any>;
  update: (key: string, value: any) => void;
}

export function SmartExecutorTab({ settings, update }: SmartExecutorTabProps) {
  const t = useTranslations("dashboard.settings");

  const isEnabled = settings.smartExecutorEnabled ?? false;
  const riskPerTrade = settings.userRiskPerTrade ?? "1";
  const maxPositions = settings.userMaxOpenPositions ?? "15";
  const minConfidence = settings.minConfidence ?? "65";
  const stopLoss = settings.userStopLoss ?? "2";
  const takeProfit = settings.userTakeProfit ?? "4";
  const maxDailyLoss = settings.userMaxDailyLoss ?? "5";
  const allowedTimeframes = settings.executorTimeframes ?? "M1,M5,M15";
  const contractSize = settings.contractSize ?? "0.01";

  return (
    <>
      {/* Enable/Disable */}
      <SectionCard
        icon={<Zap size={18} color={COLORS.council} />}
        iconColor={COLORS.council}
        iconBg={hexToRgba(COLORS.council, 0.12)}
        title={t("smartExecutor") ?? "Smart Executor"}
        subtitle={t("smartExecutorDesc") ?? "M1/M5/M15 auto-trader"}
      >
        <SettingRow
          icon={<Activity size={13} color={COLORS.textMuted} />}
          label={t("enableAutoTrading") ?? "Enable auto trading"}
          description={t("enableAutoTradingDesc") ?? "Execute council briefs automatically"}
        >
          <Toggle
            checked={isEnabled}
            onChange={() => update("smartExecutorEnabled", !isEnabled)}
            color={COLORS.buy}
          />
        </SettingRow>
      </SectionCard>

      {/* Risk Management */}
      <SectionCard
        icon={<Shield size={18} color={COLORS.buy} />}
        iconColor={COLORS.buy}
        iconBg={hexToRgba(COLORS.buy, 0.12)}
        title={t("riskManagement") ?? "Risk Management"}
        subtitle={t("riskManagementSubtitle") ?? "Per-trade limits"}
      >
        <SettingRow
          icon={<Target size={13} color={COLORS.sell} />}
          label={t("defaultStopLoss") ?? "Stop Loss"}
          description={t("defaultStopLossDesc") ?? "Auto SL distance from entry"}
        >
          <NumberInput
            value={stopLoss}
            onChange={v => update("userStopLoss", v)}
            min={0.1} max={50} step={0.1}
            suffix="%"
          />
        </SettingRow>
        <SettingRow
          icon={<Target size={13} color={COLORS.buy} />}
          label={t("defaultTakeProfit") ?? "Take Profit"}
          description={t("defaultTakeProfitDesc") ?? "Auto TP distance from entry"}
        >
          <NumberInput
            value={takeProfit}
            onChange={v => update("userTakeProfit", v)}
            min={0.1} max={100} step={0.1}
            suffix="%"
          />
        </SettingRow>
        <SettingRow
          icon={<Shield size={13} color={COLORS.hold} />}
          label={t("riskPerTrade") ?? "Risk per trade"}
          description={t("riskPerTradeDesc") ?? "Max % of portfolio per trade"}
        >
          <NumberInput
            value={riskPerTrade}
            onChange={v => update("userRiskPerTrade", v)}
            min={0.1} max={10} step={0.1}
            suffix="%"
          />
        </SettingRow>
        <SettingRow
          icon={<Shield size={13} color={COLORS.sell} />}
          label={t("maxDailyLoss") ?? "Max daily loss"}
          description={t("maxDailyLossDesc") ?? "Stops trading when reached"}
        >
          <NumberInput
            value={maxDailyLoss}
            onChange={v => update("userMaxDailyLoss", v)}
            min={1} max={50} step={1}
            suffix="%"
          />
        </SettingRow>
      </SectionCard>

      {/* Execution Settings */}
      <SectionCard
        icon={<Cpu size={18} color={COLORS.info} />}
        iconColor={COLORS.info}
        iconBg={hexToRgba(COLORS.info, 0.12)}
        title={t("executionSettings") ?? "Execution Settings"}
        subtitle={t("executionSettingsDesc") ?? "Position limits and thresholds"}
      >
        <SettingRow
          icon={<Activity size={13} color={COLORS.textMuted} />}
          label={t("maxOpenPositions") ?? "Max open positions"}
          description={t("maxOpenPositionsDesc") ?? "Concurrent positions limit"}
        >
          <NumberInput
            value={maxPositions}
            onChange={v => update("userMaxOpenPositions", v)}
            min={1} max={50} step={1}
          />
        </SettingRow>
        <SettingRow
          icon={<Target size={13} color={COLORS.council} />}
          label={t("minConfidence") ?? "Min confidence"}
          description={t("minConfidenceDesc") ?? "Skip briefs below this threshold"}
        >
          <NumberInput
            value={minConfidence}
            onChange={v => update("minConfidence", v)}
            min={10} max={90} step={1}
            suffix="%"
          />
        </SettingRow>
        <SettingRow
          icon={<Clock size={13} color={COLORS.textMuted} />}
          label={t("executorTimeframes") ?? "Allowed timeframes"}
          description={t("executorTimeframesDesc") ?? "Comma-separated: M1,M5,M15"}
        >
          <input
            type="text"
            value={allowedTimeframes}
            onChange={e => update("executorTimeframes", e.target.value)}
            style={{
              width: 120, padding: "4px 8px", borderRadius: 8,
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${COLORS.border}`,
              color: COLORS.textPrimary, fontSize: 11,
              fontFamily: "var(--font-mono)",
              textAlign: "center", outline: "none",
            }}
            dir="ltr"
          />
        </SettingRow>
        {/* V318: Contract size */}
        <SettingRow
          icon={<Target size={13} color={COLORS.info} />}
          label={t("contractSize") ?? "Contract size"}
          description={t("contractSizeDesc") ?? "Contract size per trade"}
        >
          <NumberInput
            value={contractSize}
            onChange={v => update("contractSize", v)}
            min={0.01} max={100} step={0.01}
          />
        </SettingRow>
      </SectionCard>

      {/* V410: Lifecycle Controls (per-user) */}
      <SectionCard
        icon={<Cpu size={18} color={COLORS.info} />}
        iconColor={COLORS.info}
        iconBg={hexToRgba(COLORS.info, 0.12)}
        title={t("lifecycleControls") ?? "Lifecycle Controls"}
        subtitle={t("lifecycleControlsDesc") ?? "Trade execution limits (V410)"}
      >
        <SettingRow
          icon={<Zap size={13} color={COLORS.council} />}
          label={t("executorMaxNewOpensPerTick") ?? "Max new opens per tick"}
          description={t("executorMaxNewOpensPerTickDesc") ?? "Cap new positions per 10s executor tick (1-20, default 2)"}
        >
          <NumberInput
            value={String(settings.executorMaxNewOpensPerTick ?? "2")}
            onChange={v => update("executorMaxNewOpensPerTick", parseInt(v, 10) || 2)}
            min={1} max={20} step={1}
          />
        </SettingRow>
        <SettingRow
          icon={<Activity size={13} color={COLORS.textMuted} />}
          label={t("v407AutoStaleEnabled") ?? "Enable AUTO_STALE eviction"}
          description={t("v407AutoStaleEnabledDesc") ?? "Auto-close paper positions older than 1h when at max capacity. OFF by default (V407) — leave OFF to let TP/SL work."}
        >
          <Toggle
            checked={settings.v407AutoStaleEnabled === true || settings.v407AutoStaleEnabled === "true"}
            onChange={() => update("v407AutoStaleEnabled", !(settings.v407AutoStaleEnabled === true || settings.v407AutoStaleEnabled === "true"))}
            color={COLORS.sell}
          />
        </SettingRow>
      </SectionCard>
    </>
  );
}
