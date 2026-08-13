import { registerFont } from 'canvas';
import path from 'path';
import fs from 'fs';
import { logger } from './logger';

let registeredFontFamily: string | null = null;

export function getCanvasFontFamily(): string {
  if (registeredFontFamily) {
    return registeredFontFamily;
  }

  const fontPaths = [
    path.join(__dirname, '../assets/fonts/segoeui.ttf'),
    path.join(__dirname, '../../assets/fonts/segoeui.ttf'),
    path.join(process.cwd(), 'assets/fonts/segoeui.ttf'),
    path.join(process.cwd(), 'src/assets/fonts/segoeui.ttf'),
    path.join(__dirname, '../assets/fonts/arial.ttf'),
    path.join(__dirname, '../../assets/fonts/arial.ttf'),
    path.join(process.cwd(), 'assets/fonts/arial.ttf'),
    path.join(process.cwd(), 'src/assets/fonts/arial.ttf'),
    'C:/Windows/Fonts/segoeui.ttf',
    'C:/Windows/Fonts/arial.ttf',
  ];

  for (const fontPath of fontPaths) {
    if (fs.existsSync(fontPath)) {
      try {
        registerFont(fontPath, { family: 'PegasusFont' });
        registeredFontFamily = 'PegasusFont';
        logger.info(`Successfully registered canvas font 'PegasusFont' from ${fontPath}`);
        return registeredFontFamily;
      } catch (err) {
        logger.warn(`Could not register font at ${fontPath}:`, err);
      }
    }
  }

  registeredFontFamily = 'sans-serif';
  return registeredFontFamily;
}
