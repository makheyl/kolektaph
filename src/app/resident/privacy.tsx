import { useTranslation } from 'react-i18next';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { goBack } from '@/lib/navigation';
import { colors } from '@/theme/tokens';

const SECTIONS = ['collect', 'why', 'who', 'rights'] as const;

/** Plain-language privacy notice (Data Privacy Act, RA 10173). Draft pending DPO review. */
export default function PrivacyScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <AppHeader
        title={t('privacy.title')}
        leading={
          <IconButton
            icon="arrow-left"
            label={t('common.back')}
            onPress={() => goBack('/resident')}
          />
        }
      />
      <Card style={{ backgroundColor: colors.yellowSoft, borderColor: colors.yellow }}>
        <AppText variant="label">{t('privacy.draft')}</AppText>
      </Card>
      {SECTIONS.map((s) => (
        <Card key={s}>
          <AppText variant="heading" accessibilityRole="header">
            {t(`privacy.${s}Title`)}
          </AppText>
          <AppText>{t(`privacy.${s}Body`)}</AppText>
        </Card>
      ))}
    </Screen>
  );
}
