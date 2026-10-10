import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { SampleDataBadge } from '@/components/ui/SampleDataBadge';
import { Screen } from '@/components/ui/Screen';
import { SmsBubble } from '@/components/ui/SmsBubble';
import { TextField } from '@/components/ui/TextField';
import { useCityConfig, useStaff, useStaffRights } from '@/features/admin/hooks';
import { sms } from '@/features/alerts/templates';
import { Panel } from '@/features/enro/components/Panel';
import { formatPesos } from '@/features/hauling/pricing';
import { useHaulingRates } from '@/features/hauling/hooks';
import { formatPoints } from '@/features/rewards/format';
import { usePoints } from '@/features/rewards/hooks';
import { useBarangays } from '@/features/tracking/hooks';
import { Notice } from '@/components/ui/Notice';
import { ServerError, services } from '@/services';
import type {
  ContactInfo,
  ContactTarget,
  PointsEarnKind,
  StaffRole,
  StaffUser,
} from '@/services/types';
import { colors, spacing } from '@/theme/tokens';

const LEAD_CHOICES = [10, 15, 20, 30];
const ROLES: StaffRole[] = ['admin', 'dispatcher', 'viewer', 'barangay'];
const TWO_COLUMNS = 1200;
/** Digits, spaces, ( ) + - only, with at least 7 digits (landline or mobile). */
const isPhone = (v: string) => /^[0-9+()\-\s]+$/.test(v) && v.replace(/\D/g, '').length >= 7;
/** A login's id as the Supabase dashboard shows it. */
const isLoginId = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/**
 * City ENRO settings (plan §6.3): SMS lead time, the contact numbers Kolek gives residents,
 * and dashboard users and roles (sample accounts until real sign-in exists).
 */
export default function EnroSettings() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const wide = width >= TWO_COLUMNS;
  const config = useCityConfig();
  const staff = useStaff();
  const rights = useStaffRights();
  /** On the server, accounts are real City ENRO logins, each made in the Supabase dashboard. */
  const realAccounts = services.auth.required;
  const { data: barangays } = useBarangays();
  // The City's fees and Eco Points, shown as sample figures until the City sets them.
  const rates = useHaulingRates();
  const points = usePoints();
  const [feeNote, setFeeNote] = useState<'fees' | 'points' | null>(null);

  // SMS lead time
  const [lead, setLead] = useState<number | null>(null);
  const [leadSaved, setLeadSaved] = useState(false);
  // Contacts: the row being edited
  const [editing, setEditing] = useState<{ key: string; target: ContactTarget } | null>(null);
  const [phone, setPhone] = useState('');
  const [hours, setHours] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  // New user
  const [name, setName] = useState('');
  const [role, setRole] = useState<StaffRole>('dispatcher');
  const [userBarangay, setUserBarangay] = useState<string | null>(null);
  const [userError, setUserError] = useState<string | null>(null);
  const [loginId, setLoginId] = useState('');
  const [failed, setFailed] = useState<string | null>(null);

  /** Runs a change and says so when the server refuses it or cannot be reached. */
  const attempt = async (where: string, change: () => Promise<unknown>) => {
    setFailed(null);
    try {
      await change();
      return true;
    } catch (e) {
      const code = e instanceof ServerError ? e.code : '';
      setFailed(
        `${where}|${t(`enro.settings.refused.${code}`, { defaultValue: t('enro.notSaved') })}`,
      );
      return false;
    }
  };
  const failure = (where: string) =>
    failed?.startsWith(`${where}|`) ? (
      <AppText variant="label" color={colors.red} accessibilityLiveRegion="polite">
        {failed.slice(where.length + 1)}
      </AppText>
    ) : null;

  if (!config || !barangays) {
    return (
      <Screen width="dashboard" safeTop={false}>
        {null}
      </Screen>
    );
  }

  const nameOf = (id: string) =>
    barangays.features.find((f) => f.properties.id === id)?.properties.name ?? id;
  const chosenLead = lead ?? config.smsLeadMinutes;
  const pointsKinds = points ? (Object.keys(points.rules.earn) as PointsEarnKind[]) : [];

  // ---------- SMS lead time ----------
  const leadPanel = (
    <Panel title={t('enro.settings.leadTitle')}>
      <AppText>{t('enro.settings.leadBody')}</AppText>
      <AppText variant="bodyStrong">
        {t('enro.settings.leadCurrent', { minutes: config.smsLeadMinutes })}
      </AppText>
      <View style={styles.chips}>
        {LEAD_CHOICES.map((m) => (
          <Chip
            key={m}
            label={t('enro.settings.leadOption', { minutes: m })}
            selected={chosenLead === m}
            onPress={() => {
              setLead(m);
              setLeadSaved(false);
            }}
          />
        ))}
      </View>
      <AppText variant="label">{t('enro.settings.leadPreview')}</AppText>
      <SmsBubble
        text={sms.vicinity({ barangay: 'Milagrosa', minutes: chosenLead, eta: '7:40 AM' })}
      />
      {rights.admin ? (
        <Button
          icon="content-save-outline"
          label={t('enro.settings.leadSave', { minutes: chosenLead })}
          disabled={chosenLead === config.smsLeadMinutes}
          onPress={async () => {
            if (!(await attempt('lead', () => services.admin.setSmsLeadMinutes(chosenLead))))
              return;
            setLead(null);
            setLeadSaved(true);
          }}
        />
      ) : (
        <AppText color={colors.textMuted}>{t('enro.adminOnly')}</AppText>
      )}
      {failure('lead')}
      {leadSaved ? (
        <AppText color={colors.green} accessibilityLiveRegion="polite">
          {t('enro.settings.leadSaved')}
        </AppText>
      ) : null}
    </Panel>
  );

  // ---------- Contacts ----------
  const contactRows: { key: string; title: string; target: ContactTarget; info: ContactInfo }[] = [
    {
      key: 'enro',
      title: t('enro.settings.enroOffice'),
      target: { kind: 'enro' },
      info: config.contacts.enro,
    },
    ...barangays.features.map(({ properties: b }) => ({
      key: b.id,
      title: t('enro.settings.barangayHall', { barangay: b.name }),
      target: { kind: 'barangay', barangayId: b.id } as ContactTarget,
      info: config.contacts.barangays[b.id] ?? { phone: null, hours: null },
    })),
  ];

  const saveContact = async () => {
    if (!editing) return;
    if (phone.trim() && !isPhone(phone.trim())) {
      setPhoneError(t('enro.settings.phoneInvalid'));
      return;
    }
    if (
      await attempt('contact', () => services.admin.setContact(editing.target, { phone, hours }))
    ) {
      setEditing(null);
    }
  };

  const contactsPanel = (
    <Panel title={t('enro.settings.contactsTitle')}>
      <AppText color={colors.textMuted}>{t('enro.settings.contactsBody')}</AppText>
      {contactRows.map((row) =>
        editing?.key === row.key ? (
          <Card key={row.key}>
            <AppText variant="heading">{row.title}</AppText>
            <TextField
              label={t('enro.settings.phone')}
              hint={t('enro.settings.phoneHint')}
              value={phone}
              onChangeText={(v) => {
                setPhone(v);
                setPhoneError(null);
              }}
              keyboardType="phone-pad"
              error={phoneError}
            />
            <TextField
              label={t('enro.settings.hours')}
              hint={t('enro.settings.hoursHint')}
              value={hours}
              onChangeText={setHours}
            />
            <View style={styles.actions}>
              <Button
                icon="content-save-outline"
                label={t('enro.settings.saveContact')}
                onPress={() => void saveContact()}
              />
              <Button
                variant="secondary"
                label={t('enro.schedules.cancel')}
                onPress={() => setEditing(null)}
              />
            </View>
            {failure('contact')}
          </Card>
        ) : (
          <View key={row.key} style={styles.contactRow}>
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{row.title}</AppText>
              <AppText color={row.info.phone ? colors.text : colors.textMuted}>
                {row.info.phone ?? t('enro.settings.noPhone')}
                {row.info.hours ? ` · ${row.info.hours}` : ''}
              </AppText>
            </View>
            {rights.admin ? (
              <Button
                variant="secondary"
                icon="pencil-outline"
                label={t('enro.settings.editContact')}
                onPress={() => {
                  setEditing({ key: row.key, target: row.target });
                  setPhone(row.info.phone ?? '');
                  setHours(row.info.hours ?? '');
                  setPhoneError(null);
                  setFailed(null);
                }}
              />
            ) : null}
          </View>
        ),
      )}
    </Panel>
  );

  // ---------- Users and roles ----------
  const addUser = async () => {
    if (!name.trim()) return setUserError(t('enro.settings.nameRequired'));
    if (role === 'barangay' && !userBarangay) return setUserError(t('enro.settings.pickBarangay'));
    if (realAccounts && !isLoginId(loginId.trim())) {
      return setUserError(t('enro.settings.loginIdInvalid'));
    }
    const saved = await attempt('add', () =>
      services.admin.saveStaff({
        id: realAccounts ? loginId.trim().toLowerCase() : `u-${Date.now().toString(36)}`,
        name,
        role,
        barangayId: role === 'barangay' ? userBarangay : null,
        active: true,
      }),
    );
    if (!saved) return;
    setName('');
    setLoginId('');
    setUserError(null);
  };
  const changeUser = (u: StaffUser, change: Partial<StaffUser>) =>
    void attempt(`user:${u.id}`, () => services.admin.saveStaff({ ...u, ...change }));

  const barangayChips = (selected: string | null, onSelect: (id: string) => void) => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipsRow}
    >
      {barangays.features.map(({ properties: b }) => (
        <Chip
          key={b.id}
          label={b.name}
          selected={selected === b.id}
          onPress={() => onSelect(b.id)}
        />
      ))}
    </ScrollView>
  );

  const usersPanel = (
    <Panel title={t(realAccounts ? 'enro.settings.accountsTitle' : 'enro.settings.usersTitle')}>
      {realAccounts ? null : <SampleDataBadge />}
      <AppText color={colors.textMuted}>
        {t(realAccounts ? 'enro.settings.accountsBody' : 'enro.settings.usersBody')}
      </AppText>
      {rights.admin ? null : <AppText color={colors.textMuted}>{t('enro.adminOnly')}</AppText>}
      {ROLES.map((r) => (
        <AppText key={r}>
          <AppText variant="bodyStrong">{t(`enro.settings.roles.${r}`)}: </AppText>
          {t(`enro.settings.roleDesc.${r}`)}
        </AppText>
      ))}
      {staff.map((u) => (
        <Card key={u.id} style={!u.active && styles.inactive}>
          <View style={styles.contactRow}>
            <View style={styles.flex}>
              <AppText variant="heading">{u.name}</AppText>
              <AppText color={colors.textMuted}>
                {t(`enro.settings.roles.${u.role}`)}
                {u.barangayId ? ` · ${nameOf(u.barangayId)}` : ''} ·{' '}
                {u.active ? t('enro.settings.active') : t('enro.settings.inactive')}
              </AppText>
            </View>
            {rights.admin ? (
              <Button
                variant="secondary"
                icon={u.active ? 'account-off-outline' : 'account-check-outline'}
                label={u.active ? t('enro.settings.deactivate') : t('enro.settings.activate')}
                onPress={() => changeUser(u, { active: !u.active })}
              />
            ) : null}
          </View>
          {rights.admin ? (
            <>
              <AppText variant="label">{t('enro.settings.role')}</AppText>
              <View style={styles.chips}>
                {ROLES.filter((r) => r !== 'barangay' || u.barangayId).map((r) => (
                  <Chip
                    key={r}
                    label={t(`enro.settings.roles.${r}`)}
                    selected={u.role === r}
                    onPress={() =>
                      changeUser(u, { role: r, barangayId: r === 'barangay' ? u.barangayId : null })
                    }
                  />
                ))}
              </View>
            </>
          ) : null}
          {failure(`user:${u.id}`)}
        </Card>
      ))}
      {rights.admin ? (
        <Card>
          <AppText variant="heading">{t('enro.settings.addUser')}</AppText>
          <TextField
            label={t('enro.settings.name')}
            hint={t('enro.settings.nameHint')}
            value={name}
            onChangeText={(v) => {
              setName(v);
              setUserError(null);
            }}
            error={userError}
          />
          <AppText variant="label">{t('enro.settings.role')}</AppText>
          <View style={styles.chips}>
            {ROLES.map((r) => (
              <Chip
                key={r}
                label={t(`enro.settings.roles.${r}`)}
                selected={role === r}
                onPress={() => setRole(r)}
              />
            ))}
          </View>
          {role === 'barangay' ? (
            <>
              <AppText variant="label">{t('enro.settings.barangayFor')}</AppText>
              {barangayChips(userBarangay, setUserBarangay)}
            </>
          ) : null}
          {realAccounts ? (
            <TextField
              label={t('enro.settings.loginId')}
              hint={t('enro.settings.loginIdHint')}
              value={loginId}
              onChangeText={(v) => {
                setLoginId(v);
                setUserError(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
            />
          ) : null}
          <Button
            icon="account-plus"
            label={t('enro.settings.add')}
            onPress={() => void addUser()}
          />
          {failure('add')}
        </Card>
      ) : null}
    </Panel>
  );

  // ---------- Hauling fees (sample until the City sets them) ----------
  const feesPanel = services.features.hauling ? (
    <Panel title={t('enro.settings.fees.title')}>
      <AppText>{t('enro.settings.fees.body')}</AppText>
      {rates ? (
        <>
          {(['small', 'medium', 'large'] as const).map((v) => (
            <Fact
              key={v}
              label={t('enro.settings.fees.base', { volume: t(`hauling.volume.${v}`) })}
              value={t('hauling.pesos', { amount: formatPesos(rates.base[v]) })}
            />
          ))}
          <Fact
            label={t('enro.settings.fees.distance')}
            value={t('hauling.pesos', { amount: formatPesos(rates.distanceFee) })}
          />
          <Fact
            label={t('enro.settings.fees.disposal')}
            value={t('hauling.pesos', { amount: formatPesos(rates.disposalFee) })}
          />
        </>
      ) : (
        <AppText color={colors.textMuted}>{t('enro.settings.fees.unset')}</AppText>
      )}
      {rights.act ? (
        <Button
          variant="secondary"
          icon="cog-outline"
          label={t('enro.settings.fees.change')}
          onPress={() => setFeeNote('fees')}
        />
      ) : null}
      {feeNote === 'fees' ? (
        <Notice tone="warning" live="polite" text={t('enro.sampleAction')} />
      ) : null}
    </Panel>
  ) : null;

  // ---------- Eco Points rules (sample until the City sets them) ----------
  const pointsPanel =
    services.features.rewards && points ? (
      <Panel title={t('enro.settings.points.title')}>
        <AppText>{t('enro.settings.points.body')}</AppText>
        {pointsKinds.map((k) => (
          <Fact
            key={k}
            label={t(`rewards.earn.${k}`)}
            value={t('rewards.cost', { points: formatPoints(points.rules.earn[k]) })}
          />
        ))}
        {points.rules.tiers.map((tier) => (
          <Fact
            key={tier.id}
            label={t(`rewards.tier.${tier.id}`)}
            value={t('enro.settings.points.from', { points: formatPoints(tier.from) })}
          />
        ))}
        <Fact
          label={t('enro.settings.points.discount')}
          value={t('enro.settings.points.discountValue', { pesos: points.rules.pesosPer100 })}
        />
        {rights.act ? (
          <Button
            variant="secondary"
            icon="cog-outline"
            label={t('enro.settings.points.change')}
            onPress={() => setFeeNote('points')}
          />
        ) : null}
        {feeNote === 'points' ? (
          <Notice tone="warning" live="polite" text={t('enro.sampleAction')} />
        ) : null}
      </Panel>
    ) : null;

  return (
    <Screen width="dashboard" safeTop={false}>
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header">
          {t('enro.settings.title')}
        </AppText>
        <AppText color={colors.textMuted}>{t('enro.settings.subtitle')}</AppText>
      </View>
      {wide ? (
        <View style={styles.columns}>
          <View style={styles.col}>
            {leadPanel}
            {feesPanel}
            {usersPanel}
          </View>
          <View style={styles.col}>
            {contactsPanel}
            {pointsPanel}
          </View>
        </View>
      ) : (
        <>
          {leadPanel}
          {contactsPanel}
          {feesPanel}
          {pointsPanel}
          {usersPanel}
        </>
      )}
    </Screen>
  );
}

/** One fact of the City's settings: its name, and its value in bold beside it. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <AppText style={styles.factLabel}>{label}</AppText>
      <AppText variant="bodyStrong" style={styles.factValue}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs },
  columns: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
  col: { flex: 1, minWidth: 0, gap: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chipsRow: { gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  flex: { flex: 1, minWidth: 200 },
  inactive: { opacity: 0.7 },
  fact: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md },
  factLabel: { flexGrow: 1, flexShrink: 1, flexBasis: 160, minWidth: 0 },
  factValue: { marginLeft: 'auto', textAlign: 'right' },
});
