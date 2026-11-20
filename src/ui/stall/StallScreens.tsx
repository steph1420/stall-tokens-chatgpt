// D-NAV: which Stall screen to show. D-ACCESS: Money, Settle up and Settings sit behind the device passcode (F-34).
import type { StallScreen } from '../../store';
import { useApp } from '../../store';
import { MoneyScreen } from '../money/MoneyScreen';
import { SettleScreen } from '../settle/SettleScreen';
import { StockScreen } from '../stock/StockScreen';
import { CloseDayScreen } from './CloseDayScreen';
import { DeveloperScreen } from './DeveloperScreen';
import { FloatScreen } from './FloatScreen';
import { HistoryScreen } from './HistoryScreen';
import { PasscodeGate } from './PasscodeGate';
import { SettingsScreen } from './SettingsScreen';

// F-66 Close the day shows money, so it sits behind the same passcode as Money.
const GATED: readonly StallScreen[] = ['money', 'settle', 'settings', 'developer', 'close'];

export function StallScreens({ screen }: { screen: StallScreen }) {
  const open = useApp((x) => x.prefs.passcodeOff || x.ui.unlocked);
  if (GATED.includes(screen) && !open) return <PasscodeGate />;
  switch (screen) {
    case 'money': return <MoneyScreen />;
    case 'settle': return <SettleScreen />;
    case 'stock': return <StockScreen />;
    case 'history': return <HistoryScreen />;
    case 'settings': return <SettingsScreen />;
    case 'float': return <FloatScreen />;
    case 'developer': return <DeveloperScreen />;
    case 'close': return <CloseDayScreen />;
    default: return <MoneyScreen />;
  }
}
