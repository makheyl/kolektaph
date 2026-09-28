import { useTranslation } from 'react-i18next';

import { ComingSoon } from '@/components/ComingSoon';

export default function ResidentHome() {
  const { t } = useTranslation();
  return <ComingSoon title={t('roles.resident')} sprint="Sprint S2" />;
}
