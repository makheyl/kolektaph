import { Share } from 'react-native';

/**
 * Saves a text file for the user. On phones there is no Downloads folder to write to, so the
 * text goes to the share sheet (email, Drive, messaging). The web version downloads a file.
 */
export async function saveTextFile(filename: string, text: string): Promise<void> {
  await Share.share({ title: filename, message: text });
}
