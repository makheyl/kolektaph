import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { colors } from '@/theme/tokens';

interface ComingSoonProps {
  title: string;
  sprint: string;
  /** Tab screens don't need a back button; stand-alone role placeholders do. */
  showBack?: boolean;
}

/** Placeholder for areas that later sprints fill in. */
export function ComingSoon({ title, sprint, showBack = true }: ComingSoonProps) {
  const { t } = useTranslation();
  return (
    <Screen>
      <AppText variant="title" accessibilityRole="header">
        {title}
      </AppText>
      <Card>
        <AppText color={colors.textMuted}>{t('common.comingSoon', { sprint })}</AppText>
      </Card>
      {showBack ? (
        <Button
          label={t('common.back')}
          icon="arrow-left"
          variant="secondary"
          onPress={() => router.replace('/demo')}
        />
      ) : null}
    </Screen>
  );
}
