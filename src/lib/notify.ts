import * as Notifications from 'expo-notifications';

/**
 * Local notifications.
 *
 * Deliberately local rather than push: Expo Go on iOS can't receive remote push
 * notifications (that needs a development build with its own APNs credentials), and
 * the alert we want is one the app can already decide on its own — no server needs to
 * wake the device. Same native notification centre either way.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let permissionChecked = false;
let permissionGranted = false;

async function ensurePermission(): Promise<boolean> {
  if (permissionChecked) return permissionGranted;
  permissionChecked = true;

  const existing = await Notifications.getPermissionsAsync();
  permissionGranted = existing.granted;

  if (!permissionGranted && existing.canAskAgain) {
    const asked = await Notifications.requestPermissionsAsync();
    permissionGranted = asked.granted;
  }
  return permissionGranted;
}

/**
 * Fires when a nearby merchant earns an unusually good rate, so the user notices
 * without having to read the whole list.
 */
export async function notifyGoodMatch(
  merchantName: string,
  multiplier: number,
  cardName: string,
): Promise<void> {
  if (!(await ensurePermission())) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${multiplier}x nearby at ${merchantName}`,
      body: `Use your ${cardName}.`,
    },
    trigger: null, // deliver immediately
  });
}
