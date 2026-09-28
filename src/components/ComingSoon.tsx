import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { colors } from '@/theme/tokens';

/** Placeholder for role areas that later sprints fill in. */
export function ComingSoon({ title, sprint }: { title: string; sprint: string }) {
  const { t } = useTranslation();
  return (
    <Screen>
      <AppText variant="title" accessibilityRole="header">
        {title}
      </AppText>
      <Card>
        <AppText color={colors.textMuted}>{t('common.comingSoon', { sprint })}</AppText>
      </Card>
      <Button
        label={t('common.back')}
        icon="arrow-left"
        variant="secondary"
        onPress={() => router.replace('/demo')}
      />
    </Screen>
  );
}
