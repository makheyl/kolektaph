import { useTranslation } from 'react-i18next';

import { ComingSoon } from '@/components/ComingSoon';

export default function EnroHome() {
  const { t } = useTranslation();
  return <ComingSoon title={t('roles.enro')} sprint="Sprint S3" />;
}
