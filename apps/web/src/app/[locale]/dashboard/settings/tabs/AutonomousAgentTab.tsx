"use client";

import { useTranslations } from "next-intl";
import { Bot, Clock, Globe, Target, Shield, Layers, Cpu, Zap } from "lucide-react";
import { COLORS } from "@/lib/council/types";
import { hexToRgba } from "@/lib/council/format";
import { SectionCard, SettingRow, Toggle, SelectBox, NumberInput } from "../_components/SettingsPrimitives";

/**
 * V312: Autonomous Agent Settings Tab
 * 
 * Controls the Autonomous Agent (M30/H1/H4/D1/W1 long-term trader):
 * - Enable/disable
 * - Analysis interval
 * - Pairs to analyze
 * - Max holding time
 * - Risk per trade
 * - Min confidence
 */

interface AutonomousAgentTabProps {
  settings: Record<string, any>;
  update: (key: string, value: any) => void;
}

export function AutonomousAgentTab({ settings, update }: AutonomousAgentTabProps) {
  const t = useTranslations("dashboard.settings");

  const isEnabled = settings.agentEnabled ?? false;
  const interval = settings.agentInterval ?? "60";
  const pairs = settings.agentPairs ?? "BTC/USDT,ETH/USDT,SOL/USDT";
  const maxHoldingHours = settings.agentMaxHoldingHours ?? "48";
  const riskPerTrade = settings.agentRiskPerTrade ?? "1";
  const minConfidence = settings.agentMinConfidence ?? "70";
  const contractSize = settings.agentContractSize ?? "0.01";

  return (
    <>
      {/* Enable/Disable */}
      <SectionCard
        icon={<Bot size={18} color={COLORS.council} />}
        iconColor={COLORS.council}
        iconBg={hexToRgba(COLORS.council, 0.12)}
        title={t("autonomousAgent") ?? "Autonomous Agent"}
        subtitle={t("autonomousAgentDesc") ?? "M30/H1/H4/D1/W1 long-term trader"}
      >
        <SettingRow
          icon={<Bot size={13} color={COLORS.textMuted} />}
          label={t("enableAgent") ?? "Enable agent"}
          description={t("enableAgentDesc") ?? "Analyze and trade on longer timeframes"}
        >
          <Toggle
            checked={isEnabled}
            onChange={() => update("agentEnabled", !isEnabled)}
            color={COLORS.council}
          />
        </SettingRow>
      </SectionCard>

      {/* Analysis Settings */}
      <SectionCard
        icon={<Clock size={18} color={COLORS.info} />}
        iconColor={COLORS.info}
        iconBg={hexToRgba(COLORS.info, 0.12)}
        title={t("analysisSettings") ?? "Analysis Settings"}
        subtitle={t("analysisSettingsDesc") ?? "When and what to analyze"}
      >
        <SettingRow
          icon={<Clock size={13} color={COLORS.textMuted} />}
          label={t("analysisInterval") ?? "Analysis interval"}
          description={t("analysisIntervalDesc") ?? "Minutes between agent runs"}
        >
          <NumberInput
            value={interval}
            onChange={v => update("agentInterval", v)}
            min={5} max={1440} step={5}
            suffix="min"
          />
        </SettingRow>
        <SettingRow
          icon={<Globe size={13} color={COLORS.textMuted} />}
          label={t("agentPairs") ?? "Pairs to analyze"}
          description={t("agentPairsDesc") ?? "Comma-separated trading pairs"}
        >
          <input
            type="text"
            value={pairs}
            onChange={e => update("agentPairs", e.target.value)}
            placeholder="BTC/USDT,ETH/USDT"
            style={{
              width: 200, padding: "4px 8px", borderRadius: 'var(--radius-md)',
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${COLORS.border}`,
              color: COLORS.textPrimary, fontSize: 'var(--text-xs)',
              fontFamily: "var(--font-mono)",
              outline: "none",
            }}
            dir="ltr"
          />
        </SettingRow>
      </SectionCard>

      {/* Risk & Limits */}
      <SectionCard
        icon={<Shield size={18} color={COLORS.buy} />}
        iconColor={COLORS.buy}
        iconBg={hexToRgba(COLORS.buy, 0.12)}
        title={t("agentRiskLimits") ?? "Risk & Limits"}
        subtitle={t("agentRiskLimitsDesc") ?? "Position management rules"}
      >
        <SettingRow
          icon={<Clock size={13} color={COLORS.hold} />}
          label={t("maxHoldingTime") ?? "Max holding time"}
          description={t("maxHoldingTimeDesc") ?? "Hours before force-close"}
        >
          <NumberInput
            value={maxHoldingHours}
            onChange={v => update("agentMaxHoldingHours", v)}
            min={1} max={168} step={1}
            suffix="h"
          />
        </SettingRow>
        <SettingRow
          icon={<Target size={13} color={COLORS.sell} />}
          label={t("riskPerTrade") ?? "Risk per trade"}
          description={t("riskPerTradeDesc") ?? "Max % of portfolio per trade"}
        >
          <NumberInput
            value={riskPerTrade}
            onChange={v => update("agentRiskPerTrade", v)}
            min={0.1} max={10} step={0.1}
            suffix="%"
          />
        </SettingRow>
        <SettingRow
          icon={<Target size={13} color={COLORS.council} />}
          label={t("minConfidence") ?? "Min confidence"}
          description={t("minConfidenceDesc") ?? "Skip below this threshold"}
        >
          <NumberInput
            value={minConfidence}
            onChange={v => update("agentMinConfidence", v)}
            min={10} max={90} step={1}
            suffix="%"
          />
        </SettingRow>
        {/* V319: Contract size for agent */}
        <SettingRow
          icon={<Target size={13} color={COLORS.info} />}
          label={t("contractSize") ?? "Contract size"}
          description={t("contractSizeDesc") ?? "Contract size per trade"}
        >
          <NumberInput
            value={contractSize}
            onChange={v => update("agentContractSize", v)}
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
          label={t("agentMaxNewOpensPerCycle") ?? "Max new opens per cycle"}
          description={t("agentMaxNewOpensPerCycleDesc") ?? "Cap new positions per 1-min cron cycle (1-20, default 3). Prevents batch opening 11 positions in one second."}
        >
          <NumberInput
            value={String(settings.agentMaxNewOpensPerCycle ?? "3")}
            onChange={v => update("agentMaxNewOpensPerCycle", parseInt(v, 10) || 3)}
            min={1} max={20} step={1}
          />
        </SettingRow>
      </SectionCard>
    </>
  );
}
