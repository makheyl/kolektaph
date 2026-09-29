import { useTranslation } from 'react-i18next';

import { AppHeader } from '@/components/ui/AppHeader';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { BarangayPicker } from '@/features/resident/components/BarangayPicker';
import { goBack } from '@/lib/navigation';
import { useSettings } from '@/stores/settings';

/** Change the resident's barangay (from Settings, or from Home when none is set). */
export default function ChangeBarangayScreen() {
  const { t } = useTranslation();
  const { barangayId, setBarangayId } = useSettings();
  return (
    <Screen>
      <AppHeader
        title={t('resident.settings.changeBarangay')}
        leading={
          <IconButton
            icon="arrow-left"
            label={t('common.back')}
            onPress={() => goBack('/resident')}
          />
        }
      />
      <BarangayPicker
        selectedId={barangayId}
        onSelect={(id) => {
          setBarangayId(id);
          goBack('/resident');
        }}
      />
    </Screen>
  );
}
