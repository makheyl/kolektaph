import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AuthShell } from '@/components/layout/AuthShell';
import { Button } from '@/components/ui/Button';
import { BarangayPicker } from '@/features/resident/components/BarangayPicker';
import { useSettings } from '@/stores/settings';

/** Step 2 of 3. Picking a barangay is optional: residents can look around first. */
export default function BarangayStep() {
  const { t } = useTranslation();
  const { barangayId, setBarangayId } = useSettings();

  const choose = (id: string) => {
    setBarangayId(id);
    router.push('/onboarding/sms');
  };

  return (
    <AuthShell
      back="/onboarding/language"
      step={{ current: 2, total: 3 }}
      title={t('onboarding.barangay.title')}
      subtitle={t('onboarding.barangay.subtitle')}
      footer={
        <Button
          variant="ghost"
          label={t('onboarding.barangay.skip')}
          onPress={() => router.push('/onboarding/sms')}
        />
      }
    >
      <BarangayPicker selectedId={barangayId} onSelect={choose} />
    </AuthShell>
  );
}
