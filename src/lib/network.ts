import NetInfo from '@react-native-community/netinfo';
import { create } from 'zustand';

interface NetworkState {
  /** What the phone reports (airplane mode, no signal). */
  connected: boolean;
  /** Demo switch: behave as if there were no signal, to show the offline queue. */
  simulateOffline: boolean;
  setSimulateOffline: (value: boolean) => void;
}

export const useNetwork = create<NetworkState>()((set) => ({
  connected: true,
  simulateOffline: false,
  setSimulateOffline: (simulateOffline) => set({ simulateOffline }),
}));

let listening = false;

/** Starts following the phone's connectivity (idempotent). */
export function watchNetwork(): void {
  if (listening) return;
  listening = true;
  NetInfo.addEventListener((s) => {
    // isInternetReachable is null while unknown: treat unknown as online and let uploads decide.
    useNetwork.setState({ connected: s.isConnected !== false && s.isInternetReachable !== false });
  });
}

/** True when uploads may reach the server. */
export function isOnline(): boolean {
  const { connected, simulateOffline } = useNetwork.getState();
  return connected && !simulateOffline;
}

export function useIsOnline(): boolean {
  return useNetwork((s) => s.connected && !s.simulateOffline);
}
