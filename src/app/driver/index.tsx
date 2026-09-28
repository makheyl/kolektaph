import { useTranslation } from 'react-i18next';

import { ComingSoon } from '@/components/ComingSoon';

export default function DriverHome() {
  const { t } = useTranslation();
  return <ComingSoon title={t('roles.driver')} sprint="Sprint S4" />;
}
