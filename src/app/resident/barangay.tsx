import { colors } from '@/theme/tokens';
import { useTranslation } from 'react-i18next';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { BarangayPicker } from '@/features/resident/components/BarangayPicker';
import { MiniMap } from '@/features/resident/components/MiniMap';
import { useBarangays, useCityMeta } from '@/features/tracking/hooks';
import { goBack } from '@/lib/navigation';
import { useSettings } from '@/stores/settings';

/** Change the resident's barangay (from Settings, or from Home when none is set). */
export default function ChangeBarangayScreen() {
  const { t } = useTranslation();
  const { barangayId, setBarangayId } = useSettings();
  const { data: barangays } = useBarangays();
  const { data: meta } = useCityMeta();
  return (
    <Screen
      tone="mint"
      header={
        <AppHeader
          tone="green"
          title={t('resident.settings.changeBarangay')}
          leading={
            <IconButton
              icon="arrow-left"
              color={colors.textOnDark}
              label={t('common.back')}
              onPress={() => goBack('/resident')}
            />
          }
        />
      }
    >
      <AppText>{t('resident.account.addressHint')}</AppText>
      {barangays && meta && barangayId ? (
        <MiniMap barangays={barangays} meta={meta} highlightId={barangayId} height={200} />
      ) : null}
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
