import { useTranslation } from 'react-i18next';

import { ComingSoon } from '@/components/ComingSoon';

export default function KolekTab() {
  const { t } = useTranslation();
  return (
    <ComingSoon title={t('resident.home.actions.kolek')} sprint="Sprint S6" showBack={false} />
  );
}
