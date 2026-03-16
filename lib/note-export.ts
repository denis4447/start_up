import { File, Paths } from 'expo-file-system/next';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { Note } from './storage';

function noteToMarkdown(note: Note): string {
  const lines: string[] = [];
  lines.push(`# ${note.title}`);
  lines.push('');
  if (note.tags.length > 0) {
    lines.push(note.tags.map((t) => `\`${t}\``).join(' '));
    lines.push('');
  }
  lines.push(note.content);
  lines.push('');
  lines.push(`---`);
  lines.push(`*${new Date(note.createdAt).toLocaleDateString('ru-RU')}*`);
  return lines.join('\n');
}

function sanitizeFilename(title: string): string {
  return title
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 60) || 'note';
}

export async function exportNoteAsMarkdown(note: Note): Promise<void> {
  const markdown = noteToMarkdown(note);
  const filename = `${sanitizeFilename(note.title)}.md`;

  if (Platform.OS === 'web') {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  const file = new File(Paths.cache, filename);
  await file.write(markdown);

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/markdown',
      UTI: 'net.daringfireball.markdown',
      dialogTitle: 'Поделиться заметкой',
    });
  }
}
