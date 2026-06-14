// ═══════════════════════════════════════════════════════════
// Panel State Management Hook for RouaChart
// PERF (3.2): Consolidates 20+ useState calls + ref mirrors into
// a single reducer-based hook with O(1) ref access for ChartControlAPI.
// ═══════════════════════════════════════════════════════════

import { useReducer, useRef, useCallback } from 'react';

// ── Panel keys ─────────────────────────────────────────
export type PanelKey =
  | 'drawing'
  | 'indicator'
  | 'settings'
  | 'volumeProfile'
  | 'aiPanel'
  | 'chartTrading'
  | 'templateManager'
  | 'watchlist'
  | 'chartSettings'
  | 'compare'
  | 'smartGrid'
  | 'share'
  | 'layoutSelector'
  | 'footprint'
  | 'alerts'
  | 'patternProgress'
  | 'replay'
  | 'heatmap'
  | 'aiStream'
  | 'quickTrade';

const ALL_PANELS: PanelKey[] = [
  'drawing', 'indicator', 'settings', 'volumeProfile', 'aiPanel',
  'chartTrading', 'templateManager', 'watchlist', 'chartSettings',
  'compare', 'smartGrid', 'share', 'layoutSelector', 'footprint',
  'alerts', 'patternProgress', 'replay', 'heatmap', 'aiStream', 'quickTrade',
];

// ── State shape ────────────────────────────────────────
export interface PanelState {
  panels: Record<PanelKey, boolean>;
  // Extra state that was previously separate useState calls
  settingsIndicator: any | null;  // ActiveIndicator | null
  compareSymbol: string;
  tradePanelCollapsed: boolean;
  lotSize: number;
}

type PanelAction =
  | { type: 'TOGGLE'; key: PanelKey }
  | { type: 'SHOW'; key: PanelKey }
  | { type: 'HIDE'; key: PanelKey }
  | { type: 'SET'; key: PanelKey; value: boolean }
  | { type: 'HIDE_ALL' }
  | { type: 'SET_SETTINGS_INDICATOR'; value: any | null }
  | { type: 'SET_COMPARE_SYMBOL'; value: string }
  | { type: 'SET_TRADE_COLLAPSED'; value: boolean }
  | { type: 'SET_LOT_SIZE'; value: number };

function createInitialPanelState(): Record<PanelKey, boolean> {
  const state = {} as Record<PanelKey, boolean>;
  for (const key of ALL_PANELS) {
    state[key] = false;
  }
  return state;
}

const initialState: PanelState = {
  panels: createInitialPanelState(),
  settingsIndicator: null,
  compareSymbol: '',
  tradePanelCollapsed: false,
  lotSize: 0.01,
};

function panelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case 'TOGGLE':
      return { ...state, panels: { ...state.panels, [action.key]: !state.panels[action.key] } };
    case 'SHOW':
      return { ...state, panels: { ...state.panels, [action.key]: true } };
    case 'HIDE':
      return { ...state, panels: { ...state.panels, [action.key]: false } };
    case 'SET':
      return { ...state, panels: { ...state.panels, [action.key]: action.value } };
    case 'HIDE_ALL': {
      const newPanels = createInitialPanelState();
      return { ...state, panels: newPanels };
    }
    case 'SET_SETTINGS_INDICATOR':
      return { ...state, settingsIndicator: action.value };
    case 'SET_COMPARE_SYMBOL':
      return { ...state, compareSymbol: action.value };
    case 'SET_TRADE_COLLAPSED':
      return { ...state, tradePanelCollapsed: action.value };
    case 'SET_LOT_SIZE':
      return { ...state, lotSize: action.value };
    default:
      return state;
  }
}

// ── Hook ───────────────────────────────────────────────
export function usePanelState() {
  const [state, dispatch] = useReducer(panelReducer, initialState);

  // PERF: Ref mirror for O(1) synchronous access in ChartControlAPI getters.
  // Previously, 20+ separate useRef+assignment lines were needed.
  // Now we mirror the entire panels map in a single ref.
  const panelsRef = useRef(state.panels);
  panelsRef.current = state.panels;

  // Convenience dispatchers
  const toggle = useCallback((key: PanelKey) => dispatch({ type: 'TOGGLE', key }), []);
  const show = useCallback((key: PanelKey) => dispatch({ type: 'SHOW', key }), []);
  const hide = useCallback((key: PanelKey) => dispatch({ type: 'HIDE', key }), []);
  const set = useCallback((key: PanelKey, value: boolean) => dispatch({ type: 'SET', key, value }), []);
  const hideAll = useCallback(() => dispatch({ type: 'HIDE_ALL' }), []);
  const setSettingsIndicator = useCallback((value: any | null) => dispatch({ type: 'SET_SETTINGS_INDICATOR', value }), []);
  const setCompareSymbol = useCallback((value: string) => dispatch({ type: 'SET_COMPARE_SYMBOL', value }), []);
  const setTradePanelCollapsed = useCallback((value: boolean) => dispatch({ type: 'SET_TRADE_COLLAPSED', value }), []);
  const setLotSize = useCallback((value: number) => dispatch({ type: 'SET_LOT_SIZE', value }), []);

  return {
    state,
    panelsRef,  // O(1) synchronous read for ChartControlAPI
    toggle,
    show,
    hide,
    set,
    hideAll,
    setSettingsIndicator,
    setCompareSymbol,
    setTradePanelCollapsed,
    setLotSize,
  };
}

export type PanelStateAPI = ReturnType<typeof usePanelState>;
