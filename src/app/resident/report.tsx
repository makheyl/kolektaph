import { useTranslation } from 'react-i18next';

import { ComingSoon } from '@/components/ComingSoon';

export default function ReportTab() {
  const { t } = useTranslation();
  return (
    <ComingSoon title={t('resident.home.actions.report')} sprint="Sprint S5" showBack={false} />
  );
}
