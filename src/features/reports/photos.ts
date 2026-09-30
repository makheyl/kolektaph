/**
 * Photo compression before upload (HAKOT SNAP-01: about 300 KB on the phone). On the web the
 * result is a data URI (smaller, since the prototype keeps it in the browser's storage).
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

const WIDTH = Platform.OS === 'web' ? 960 : 1280;
const QUALITY = Platform.OS === 'web' ? 0.55 : 0.6;

/** Scales down to WIDTH pixels wide (never up) and saves as JPEG. */
export async function compressPhoto(uri: string): Promise<string> {
  const original = await ImageManipulator.manipulate(uri).renderAsync();
  const image =
    original.width > WIDTH
      ? await ImageManipulator.manipulate(original).resize({ width: WIDTH }).renderAsync()
      : original;
  const web = Platform.OS === 'web';
  const saved = await image.saveAsync({ compress: QUALITY, format: SaveFormat.JPEG, base64: web });
  return web && saved.base64 ? `data:image/jpeg;base64,${saved.base64}` : saved.uri;
}
