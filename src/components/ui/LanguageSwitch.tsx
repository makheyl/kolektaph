import { useTranslation } from 'react-i18next';

import { type Language, useSettings } from '@/stores/settings';

import { SegmentedTabs } from './SegmentedTabs';

const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'fil', label: 'Filipino' },
  { id: 'en', label: 'English' },
];

/** Filipino or English, wherever a screen is read before the resident reaches Settings. */
export function LanguageSwitch() {
  const { t } = useTranslation();
  const language = useSettings((s) => s.language);
  const setLanguage = useSettings((s) => s.setLanguage);
  return (
    <SegmentedTabs
      kind="choice"
      variant="pill"
      label={t('common.language')}
      tabs={LANGUAGES}
      value={language}
      onChange={setLanguage}
    />
  );
}
