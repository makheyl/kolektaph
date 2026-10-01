import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { DEFAULT_CHIPS } from '@/features/kolek/answer';
import { KolekBubble, ResidentBubble } from '@/features/kolek/components/Bubbles';
import type { RenderContext } from '@/features/kolek/render';
import { useBarangays, useSimNow } from '@/features/tracking/hooks';
import { services } from '@/services';
import type { KolekMessage } from '@/services/types';
import { getSimTime } from '@/stores/demo';
import { useKolekChat } from '@/stores/kolekChat';
import { useMyReports } from '@/stores/myReports';
import { useSettings } from '@/stores/settings';
import { colors, fonts, LARGE_TEXT_SCALE, radius, spacing, touch } from '@/theme/tokens';

const MAX_LENGTH = 300;
/** Unique within the conversation (it only grows until cleared). */
const nextId = () => `m${useKolekChat.getState().messages.length + 1}`;

/**
 * Tanong kay Kolek (plan §7): ask in Filipino, English or Taglish. Kolek answers from the same
 * data as the other screens, with buttons that open the right screen, and says so when it
 * doesn't know.
 */
export default function KolekTab() {
  const { t, i18n } = useTranslation();
  const messages = useKolekChat((s) => s.messages);
  const add = useKolekChat((s) => s.add);
  const clear = useKolekChat((s) => s.clear);
  const barangayId = useSettings((s) => s.barangayId);
  const smsOn = useSettings((s) => s.sms != null);
  const myTicketIds = useMyReports((s) => s.ticketIds);
  const largeText = useSettings((s) => s.largeText);
  const { data: barangays } = useBarangays();
  const now = useSimNow(30_000);
  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);
  const [failed, setFailed] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const box = useRef<View>(null);
  const [keyboardPad, setKeyboardPad] = useState(0);

  // Keep the question box above the phone keyboard: pad by exactly how much the keyboard
  // covers this screen (edge-to-edge Android no longer resizes the window for it).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      box.current?.measureInWindow((_x, y, _w, h) =>
        setKeyboardPad(Math.max(0, y + h - e.endCoordinates.screenY)),
      );
    });
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setKeyboardPad(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const ctx: RenderContext = {
    t,
    now,
    language: i18n.language === 'en' ? 'en' : 'fil',
    nameOf: (id) => barangays?.features.find((f) => f.properties.id === id)?.properties.name ?? '',
  };

  const ask = async (question: string) => {
    const q = question.trim().slice(0, MAX_LENGTH);
    if (!q || thinking) return;
    const mine: KolekMessage = { id: nextId(), from: 'resident', at: getSimTime(), text: q };
    add(mine);
    setText('');
    setThinking(true);
    setFailed(false);
    try {
      const reply = await services.kolek.reply([...useKolekChat.getState().messages], {
        barangayId,
        smsOn,
        myTicketIds,
      });
      add({ id: nextId(), from: 'kolek', at: getSimTime(), reply });
    } catch {
      setFailed(true);
    } finally {
      setThinking(false);
    }
  };

  const lastKolek = [...messages].reverse().find((m) => m.reply)?.reply;
  const chips = lastKolek?.suggestions ?? DEFAULT_CHIPS;

  return (
    <Screen scroll={false}>
      <AppHeader
        title={t('kolek.title')}
        actions={
          messages.length ? (
            <IconButton icon="delete-outline" label={t('kolek.clear')} onPress={clear} />
          ) : null
        }
      />
      <View ref={box} style={[styles.fill, { paddingBottom: keyboardPad }]}>
        <ScrollView
          ref={scroll}
          style={styles.fill}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        >
          <AppText variant="label" color={colors.textMuted}>
            {t('kolek.intro')}
          </AppText>
          <KolekBubble lines={[{ key: 'kolek.a.greeting' }]} ctx={ctx} />
          {messages.map((m) =>
            m.from === 'resident' ? (
              <ResidentBubble key={m.id} text={m.text ?? ''} />
            ) : m.reply ? (
              <KolekBubble
                key={m.id}
                lines={m.reply.lines}
                actions={m.reply.actions}
                ctx={ctx}
                latest={m.reply === lastKolek}
              />
            ) : null,
          )}
          {thinking ? (
            <View style={styles.thinking} accessibilityLiveRegion="polite">
              <Icon name="dots-horizontal" size={22} color={colors.textMuted} />
              <AppText color={colors.textMuted}>{t('kolek.thinking')}</AppText>
            </View>
          ) : null}
          {failed ? (
            <AppText color={colors.red} accessibilityLiveRegion="polite">
              {t('kolek.error')}
            </AppText>
          ) : null}
          <View style={styles.chipsBox}>
            <AppText variant="label" color={colors.textMuted}>
              {t('kolek.chipsLabel')}
            </AppText>
            <View style={styles.chips}>
              {chips.map((id) => (
                <Chip
                  key={id}
                  label={t(`kolek.chips.${id}`)}
                  onPress={() => void ask(t(`kolek.chips.${id}`))}
                />
              ))}
            </View>
          </View>
        </ScrollView>

        <View style={styles.inputBar}>
          <View style={styles.inputBox}>
            <TextInput
              value={text}
              onChangeText={setText}
              onSubmitEditing={() => void ask(text)}
              placeholder={t('kolek.placeholder')}
              placeholderTextColor={colors.textMuted}
              accessibilityLabel={t('kolek.placeholder')}
              accessibilityHint={t('kolek.privacy')}
              returnKeyType="send"
              maxLength={MAX_LENGTH}
              style={[styles.input, { fontSize: 18 * (largeText ? LARGE_TEXT_SCALE : 1) }]}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('kolek.send')}
            accessibilityState={{ disabled: !text.trim() || thinking }}
            disabled={!text.trim() || thinking}
            onPress={() => void ask(text)}
            style={({ pressed }) => [
              styles.send,
              (!text.trim() || thinking) && styles.sendDisabled,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Icon name="send" size={24} color={colors.textOnDark} />
          </Pressable>
        </View>
        <AppText variant="caption" color={colors.textMuted}>
          {t('kolek.privacy')}
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { gap: spacing.md, paddingBottom: spacing.md },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: 44 },
  chipsBox: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  inputBar: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', paddingTop: spacing.sm },
  inputBox: {
    flex: 1,
    minHeight: touch.min,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    minWidth: 0,
    fontFamily: fonts.regular,
    color: colors.text,
    paddingVertical: spacing.sm,
  },
  send: {
    width: touch.min,
    height: touch.min,
    borderRadius: radius.md,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { backgroundColor: colors.grey },
});
