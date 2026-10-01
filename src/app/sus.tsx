import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { Section } from '@/components/ui/Section';
import { TextField } from '@/components/ui/TextField';
import {
  SUS_ITEMS,
  SUS_TARGET,
  susAverage,
  susComplete,
  susCsv,
  susScore,
} from '@/features/usability/sus';
import { saveTextFile } from '@/lib/download';
import { getSimTime } from '@/stores/demo';
import { useSus } from '@/stores/sus';
import { colors, spacing } from '@/theme/tokens';

const SCALE = [1, 2, 3, 4, 5];
const MIN_PARTICIPANTS = 5;
const blank = () => Array<number | null>(SUS_ITEMS).fill(null);

/**
 * Facilitator's page for the usability test (plan §10): the ten System Usability Scale
 * statements per participant, the score, and the average against the target of 70. Answers stay
 * on this device, under a participant code instead of a name.
 */
export default function SusPage() {
  const { t } = useTranslation();
  const responses = useSus((s) => s.responses);
  const add = useSus((s) => s.add);
  const remove = useSus((s) => s.remove);
  const [participant, setParticipant] = useState('');
  const [answers, setAnswers] = useState<(number | null)[]>(blank);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const average = susAverage(responses);

  const save = () => {
    const code = participant.trim();
    if (!code || !susComplete(answers)) {
      setMessage({ ok: false, text: t('sus.incomplete') });
      return;
    }
    const at = getSimTime();
    add({ id: `${code}-${at}`, participant: code, answers, at });
    setMessage({ ok: true, text: t('sus.saved', { participant: code, score: susScore(answers) }) });
    setParticipant('');
    setAnswers(blank());
  };

  return (
    <Screen>
      <AppHeader
        title={t('sus.title')}
        leading={
          <IconButton
            icon="arrow-left"
            label={t('sus.back')}
            onPress={() => router.replace('/demo')}
          />
        }
      />
      <AppText color={colors.textMuted}>{t('sus.intro')}</AppText>

      <TextField
        label={t('sus.participant')}
        hint={t('sus.participantHint')}
        value={participant}
        onChangeText={setParticipant}
        autoCapitalize="characters"
        maxLength={12}
      />
      <AppText variant="label" color={colors.textMuted}>
        {t('sus.scale')}
      </AppText>

      {answers.map((answer, i) => (
        <Card key={i}>
          <AppText variant="bodyStrong">
            {i + 1}. {t(`sus.q.${i + 1}`)}
          </AppText>
          <View style={styles.scale}>
            {SCALE.map((v) => (
              <Chip
                key={v}
                label={String(v)}
                accessibilityLabel={t('sus.scaleLabel', { value: v })}
                selected={answer === v}
                onPress={() => setAnswers(answers.map((a, j) => (j === i ? v : a)))}
              />
            ))}
          </View>
        </Card>
      ))}

      <Button icon="content-save-outline" label={t('sus.save')} onPress={save} />
      {message ? (
        <AppText
          variant="bodyStrong"
          color={message.ok ? colors.green : colors.red}
          accessibilityLiveRegion="polite"
        >
          {message.text}
        </AppText>
      ) : null}

      <Section title={t('sus.results')}>
        {average == null ? (
          <AppText color={colors.textMuted}>{t('sus.none')}</AppText>
        ) : (
          <Card>
            <AppText variant="heading">
              {t('sus.average', { score: average, count: responses.length })}
            </AppText>
            <AppText>{t('sus.target', { target: SUS_TARGET })}</AppText>
            <AppText
              variant="bodyStrong"
              color={average >= SUS_TARGET ? colors.green : colors.amber}
            >
              {average >= SUS_TARGET ? `✓ ${t('sus.targetMet')}` : t('sus.targetNotMet')}
            </AppText>
            {responses.length < MIN_PARTICIPANTS ? (
              <AppText color={colors.textMuted}>{t('sus.few')}</AppText>
            ) : null}
          </Card>
        )}
        {responses.map((r) => (
          <View key={r.id} style={styles.row}>
            <AppText style={styles.flex}>
              {t('sus.row', { participant: r.participant, score: susScore(r.answers) })}
            </AppText>
            <Button variant="secondary" label={t('sus.remove')} onPress={() => remove(r.id)} />
          </View>
        ))}
        {responses.length ? (
          <Button
            variant="secondary"
            icon="download"
            label={t('sus.export')}
            onPress={() => void saveTextFile('kolektaph-sus.csv', susCsv(responses))}
          />
        ) : null}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scale: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
});
