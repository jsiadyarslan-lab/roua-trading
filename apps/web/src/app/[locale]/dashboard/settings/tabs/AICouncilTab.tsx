"use client";

import { useTranslations } from "next-intl";
import { Brain, Zap, Target, Globe, Layers, Activity, Cpu, Clock } from "lucide-react";
import { COLORS } from "@/lib/council/types";
import { hexToRgba } from "@/lib/council/format";
import { SectionCard, SettingRow, Toggle, SelectBox, NumberInput } from "../_components/SettingsPrimitives";

/**
 * V312: AI Council Settings Tab
 * 
 * Controls the Strategic Council (8 AI agents + Polymarket):
 * - Council session interval
 * - Min consensus score
 * - Min brief confidence
 * - Language for AI output
 * - Regime-aware filtering
 * - Prediction market weight
 * - Model priority
 */

interface AICouncilTabProps {
  settings: Record<string, any>;
  update: (key: string, value: any) => void;
}

export function AICouncilTab({ settings, update }: AICouncilTabProps) {
  const t = useTranslations("dashboard.settings");

  const sessionInterval = settings.councilInterval ?? "15";
  const minConsensus = settings.councilMinConsensus ?? "60";
  const minBriefConfidence = settings.councilMinBriefConfidence ?? "65";
  const aiLanguage = settings.councilLanguage ?? "ar";
  const regimeFilter = settings.councilRegimeFilter ?? true;
  const pmWeight = settings.councilPredictionMarketWeight ?? "1.0";
  const modelPriority = settings.councilModelPriority ?? "nvidia,glm,bedrock";

  return (
    <>
      {/* Council Configuration */}
      <SectionCard
        icon={<Brain size={18} color={COLORS.council} />}
        iconColor={COLORS.council}
        iconBg={hexToRgba(COLORS.council, 0.12)}
        title={t("councilConfig") ?? "AI Council Configuration"}
        subtitle={t("councilConfigDesc") ?? "8 AI agents + Polymarket consensus"}
      >
        <SettingRow
          icon={<Clock size={13} color={COLORS.textMuted} />}
          label={t("sessionInterval") ?? "Session interval"}
          description={t("sessionIntervalDesc") ?? "Minutes between council sessions"}
        >
          <NumberInput
            value={sessionInterval}
            onChange={v => update("councilInterval", v)}
            min={5} max={120} step={5}
            suffix="min"
          />
        </SettingRow>
        <SettingRow
          icon={<Target size={13} color={COLORS.council} />}
          label={t("minConsensusScore") ?? "Min consensus score"}
          description={t("minConsensusScoreDesc") ?? "Skip briefs below this consensus"}
        >
          <NumberInput
            value={minConsensus}
            onChange={v => update("councilMinConsensus", v)}
            min={30} max={90} step={1}
            suffix="%"
          />
        </SettingRow>
        <SettingRow
          icon={<Target size={13} color={COLORS.info} />}
          label={t("minBriefConfidence") ?? "Min brief confidence"}
          description={t("minBriefConfidenceDesc") ?? "Minimum confidence for brief issuance"}
        >
          <NumberInput
            value={minBriefConfidence}
            onChange={v => update("councilMinBriefConfidence", v)}
            min={20} max={90} step={1}
            suffix="%"
          />
        </SettingRow>
      </SectionCard>

      {/* AI Language */}
      <SectionCard
        icon={<Globe size={18} color={COLORS.info} />}
        iconColor={COLORS.info}
        iconBg={hexToRgba(COLORS.info, 0.12)}
        title={t("aiLanguage") ?? "AI Output Language"}
        subtitle={t("aiLanguageDesc") ?? "Language for council analysis and briefs"}
      >
        <SettingRow
          icon={<Globe size={13} color={COLORS.textMuted} />}
          label={t("councilLanguage") ?? "Analysis language"}
          description={t("councilLanguageDesc") ?? "Briefs are generated in this language"}
        >
          <SelectBox
            value={aiLanguage}
            onChange={v => update("councilLanguage", v)}
            options={[
              { value: "ar", label: "العربية" },
              { value: "en", label: "English" },
              { value: "fr", label: "Français" },
              { value: "tr", label: "Türkçe" },
              { value: "es", label: "Español" },
              { value: "zh", label: "中文" },
              { value: "ru", label: "Русский" },
              { value: "de", label: "Deutsch" },
              { value: "ja", label: "日本語" },
            ]}
            small
          />
        </SettingRow>
      </SectionCard>

      {/* Advanced Features */}
      <SectionCard
        icon={<Zap size={18} color={COLORS.hold} />}
        iconColor={COLORS.hold}
        iconBg={hexToRgba(COLORS.hold, 0.12)}
        title={t("advancedFeatures") ?? "Advanced Features"}
        subtitle={t("advancedFeaturesDesc") ?? "Regime filter and prediction market"}
      >
        <SettingRow
          icon={<Activity size={13} color={COLORS.textMuted} />}
          label={t("regimeFilter") ?? "Regime filter"}
          description={t("regimeFilterDesc") ?? "Block BUY in BEAR, SELL in BULL"}
        >
          <Toggle
            checked={regimeFilter}
            onChange={() => update("councilRegimeFilter", !regimeFilter)}
            color={COLORS.buy}
          />
        </SettingRow>
        <SettingRow
          icon={<Target size={13} color={COLORS.council} />}
          label={t("predictionMarketWeight") ?? "Polymarket weight"}
          description={t("predictionMarketWeightDesc") ?? "Weight multiplier for PM vote"}
        >
          <NumberInput
            value={pmWeight}
            onChange={v => update("councilPredictionMarketWeight", v)}
            min={0.1} max={5} step={0.1}
            suffix="x"
          />
        </SettingRow>
        <SettingRow
          icon={<Layers size={13} color={COLORS.textMuted} />}
          label={t("modelPriority") ?? "Model priority"}
          description={t("modelPriorityDesc") ?? "Comma-separated model fallback order"}
        >
          <input
            type="text"
            value={modelPriority}
            onChange={e => update("councilModelPriority", e.target.value)}
            style={{
              width: 200, padding: "4px 8px", borderRadius: 'var(--radius-md)',
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${COLORS.border}`,
              color: COLORS.textPrimary, fontSize: 11,
              fontFamily: "var(--font-mono)",
              outline: "none",
            }}
            dir="ltr"
          />
        </SettingRow>
      </SectionCard>

      {/* V410: Lifecycle Controls (per-user) */}
      <SectionCard
        icon={<Cpu size={18} color={COLORS.info} />}
        iconColor={COLORS.info}
        iconBg={hexToRgba(COLORS.info, 0.12)}
        title={t("lifecycleControls") ?? "Lifecycle Controls"}
        subtitle={t("lifecycleControlsDesc") ?? "Monitoring tuning (V410)"}
      >
        <SettingRow
          icon={<Clock size={13} color={COLORS.textMuted} />}
          label={t("monitorTickLogIntervalMs") ?? "MONITOR_TICK interval (ms)"}
          description={t("monitorTickLogIntervalMsDesc") ?? "Log position ticks every N ms. Default 60000 (60s). Range 5000-600000. Lower = more DB writes but finer audit trail."}
        >
          <NumberInput
            value={String(settings.monitorTickLogIntervalMs ?? "60000")}
            onChange={v => update("monitorTickLogIntervalMs", parseInt(v, 10) || 60000)}
            min={5000} max={600000} step={5000}
          />
        </SettingRow>
      </SectionCard>
    </>
  );
}
