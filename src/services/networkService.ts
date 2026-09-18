import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

type NetworkListener = (isOnline: boolean) => void;

class NetworkService {
  private onlineStatus: boolean = true;
  private listeners: Set<NetworkListener> = new Set();
  private unsubscribeNetInfo: (() => void) | null = null;

  constructor() {
    this.init();
  }

  private init() {
    this.unsubscribeNetInfo = NetInfo.addEventListener((state: NetInfoState) => {
      // Considered online if connected and internet is not explicitly unreachable
      const currentOnline = Boolean(state.isConnected && state.isInternetReachable !== false);
      const prevOnline = this.onlineStatus;
      this.onlineStatus = currentOnline;

      if (prevOnline !== currentOnline) {
        this.notifyListeners(currentOnline);
      }
    });

    // Initial check
    NetInfo.fetch().then((state) => {
      this.onlineStatus = Boolean(state.isConnected && state.isInternetReachable !== false);
    }).catch(() => {
      this.onlineStatus = false;
    });
  }

  public isOnline(): boolean {
    return this.onlineStatus;
  }

  public subscribe(listener: NetworkListener): () => void {
    this.listeners.add(listener);
    // Immediately notify listener of current state
    listener(this.onlineStatus);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(isOnline: boolean) {
    this.listeners.forEach((listener) => {
      try {
        listener(isOnline);
      } catch {
        // Safe listener invocation
      }
    });
  }

  public cleanup() {
    if (this.unsubscribeNetInfo) {
      this.unsubscribeNetInfo();
      this.unsubscribeNetInfo = null;
    }
    this.listeners.clear();
  }
}

export const networkService = new NetworkService();
