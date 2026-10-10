import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/ui/AppHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { ListRow } from '@/components/ui/ListRow';
import { Screen } from '@/components/ui/Screen';
import { taskState, truckTasks } from '@/features/driver/tasks';
import { CATEGORY_META } from '@/features/reports/categories';
import { useTickets } from '@/features/reports/hooks';
import { useBarangays } from '@/features/tracking/hooks';
import { goBack } from '@/lib/navigation';
import { useDriver } from '@/stores/driver';
import { colors, spacing } from '@/theme/tokens';

/**
 * The reports of uncollected waste that City ENRO gave this truck. Each opens the task, where
 * the crew starts it and finishes it with photos.
 */
export default function DriverTasks() {
  const { t } = useTranslation();
  const shift = useDriver((s) => s.shift);
  const outbox = useDriver((s) => s.outbox);
  const tickets = useTickets();
  const { data: barangays } = useBarangays();

  if (!shift || shift.endedAt != null) return <Redirect href="/driver" />;

  const events = outbox.map((o) => o.event);
  const tasks = truckTasks(tickets, shift.truckId, events);
  const nameOf = (id: string | null) =>
    barangays?.features.find((f) => f.properties.id === id)?.properties.name ?? '';

  return (
    <Screen
      header={
        <AppHeader
          title={t('driver.tasks.title')}
          leading={
            <IconButton
              icon="arrow-left"
              label={t('common.back')}
              onPress={() => goBack('/driver/shift')}
            />
          }
        />
      }
    >
      {tasks.length === 0 ? (
        <EmptyState icon="trash-can-outline" title={t('driver.tasks.none')} />
      ) : (
        <View style={styles.list}>
          {tasks.map((tk) => {
            const done = taskState(tk, events) === 'done';
            return (
              <ListRow
                key={tk.id}
                variant="card"
                icon={CATEGORY_META[tk.category].icon}
                iconColor={done ? colors.primary : colors.red}
                title={`${t(`reports.category.${tk.category}`)} · ${nameOf(tk.barangayId)}`}
                subtitle={done ? t('driver.tasks.doneState') : tk.landmark || tk.id}
                trailing="chevron"
                onPress={() =>
                  router.push({ pathname: '/driver/task/[id]', params: { id: tk.id } })
                }
              />
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
});
