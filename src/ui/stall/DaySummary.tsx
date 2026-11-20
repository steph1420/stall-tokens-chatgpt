// F-66 Day summary (FEATURES §21): takings by way of payment, refunds, tips, waived, write-offs, still unpaid, top sellers,
// the cash check and skipped steps. Hold to share sends plain text (Q-RECEIPT-SYNC C: drawn from data, no images).
import { CONFIG } from '../../config';
import { formatInr } from '../../contract';
import { closing, liveOrders, useApp } from '../../store';
import { HoldButton } from '../kit/HoldButton';
import { Money } from '../kit/Money';
import { shareText } from '../kit/share';
import { Section } from './StallPage';
import s from './Stall.module.css';

export function DaySummary({ dayId }: { dayId: string }) {
  const f = useApp((x) => x.folded);
  const toast = useApp((x) => x.money.toast);
  const day = f.days.find((d) => d.id === dayId);
  const rec = closing.closeRecord(f.records.day_note?.[dayId]);
  const sum = closing.daySummary(liveOrders(f), f.entries, dayId, Number(f.settings[`float:${dayId}`] ?? 0));
  const cash = closing.cashCheck(rec.counted, sum.book);
  const share = () => {
    const text = closing.summaryText(f.settings.stallName ?? '', day ?? { label: dayId }, sum, rec.counted, rec);
    void shareText('Day summary', text).then((r) => { toast(r === 'copied' ? 'Summary copied · paste it in a chat' : r === 'failed' ? 'Could not share on this phone' : 'Summary shared'); });
  };
  const tile = (label: string, p: number, tone = '', sign?: '−') => <div className={s.tile}><span className={s.tileL}>{label}</span><Money p={p} sign={p ? sign : undefined} className={[s.tileV, tone].join(' ')} /></div>;
  return (
    <Section label="Day summary">
      <div className={s.sumBody}>
        <p className={s.sumHead}>{`${String(sum.orders)} ${sum.orders === 1 ? 'order' : 'orders'}${sum.cancelled ? ` · ${String(sum.cancelled)} cancelled` : ''}`}</p>
        <div className={s.tiles}>
          {tile('Takings', sum.takings)}
          {tile('Cash', sum.cash)}
          {tile('UPI', sum.upi)}
          {tile('Refunds', sum.refunds, sum.refunds ? s.neg : '', '−')}
          {tile('Tips (own pot)', sum.tips)}
          {tile('Waived', sum.waived)}
          {tile(`Written off${sum.writtenOff.n ? ` · ${String(sum.writtenOff.n)}` : ''}`, sum.writtenOff.amount)}
          {tile(`Still unpaid${sum.unpaid.n ? ` · ${String(sum.unpaid.n)}` : ''}`, sum.unpaid.amount, sum.unpaid.n ? s.warn : '')}
        </div>
        <p className={s.sumLine}>{`Cash in the box: ${rec.counted === null ? 'not counted' : `${formatInr(rec.counted)} · ${cash.text}`}`}</p>
        {sum.top.length ? (
          <ol className={s.topList} aria-label="Top sellers">
            {sum.top.map((t) => <li key={t.name}><span>{t.name}</span><b>{`×${String(t.qty)}`}</b><Money p={t.amount} className={s.topAmt} /></li>)}
          </ol>
        ) : null}
        {rec.skipped.length ? <p className={[s.sumLine, s.warn].join(' ')}>{`Left for later: ${rec.skipped.map((k) => STEP_WORD[k]).join(', ')}`}</p> : null}
        <HoldButton label="Hold to share the summary" className={s.shareBtn} onConfirm={share}>Hold to share</HoldButton>
        <p className={s.sumHint}>{`Top ${String(CONFIG.close.topItems)} by number sold. Tips stay out of the partner split.`}</p>
      </div>
    </Section>
  );
}
const STEP_WORD = { unpaid: 'unpaid orders', refunds: 'refunds due', cash: 'cash count' } as const;
