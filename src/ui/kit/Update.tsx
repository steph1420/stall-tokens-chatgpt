// Calm update (F-36): a new version waits until the user taps Reload. Never reloads by itself mid-order.
import { useRegisterSW } from 'virtual:pwa-register/react';
import s from './kit.module.css';

export function UpdateBanner() {
  const { needRefresh: [need], updateServiceWorker } = useRegisterSW();
  if (!need) return null;
  return (
    <div className={s.banner} role="status">
      <span>Update ready</span>
      <button type="button" className={s.bannerBtn} onClick={() => { void updateServiceWorker(true); }}>Reload</button>
    </div>
  );
}
