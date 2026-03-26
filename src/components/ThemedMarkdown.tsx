import React, { useMemo } from 'react';
import Markdown from 'react-native-markdown-display';
import { useTheme } from '../contexts/ThemeContext';

interface ThemedMarkdownProps {
  children: string;
  fontSize?: number;
  lineHeight?: number;
}

export default function ThemedMarkdown({
  children,
  fontSize = 15,
  lineHeight = 21,
}: ThemedMarkdownProps): React.JSX.Element {
  const { colors } = useTheme();

  const mdStyles = useMemo(() => ({
    body: { color: colors.text, fontSize, lineHeight },
    paragraph: { marginTop: 0, marginBottom: 6 },
    strong: { fontWeight: '700' as const },
    em: { fontStyle: 'italic' as const },
    bullet_list: { marginVertical: 4 },
    ordered_list: { marginVertical: 4 },
    list_item: { marginVertical: 1 },
    heading1: { fontSize: 20, fontWeight: '700' as const, color: colors.text, marginVertical: 6 },
    heading2: { fontSize: 18, fontWeight: '700' as const, color: colors.text, marginVertical: 5 },
    heading3: { fontSize: 16, fontWeight: '600' as const, color: colors.text, marginVertical: 4 },
    code_inline: {
      backgroundColor: colors.card,
      color: colors.text,
      fontSize: fontSize - 2,
      paddingHorizontal: 4,
      borderRadius: 3,
    },
    fence: {
      backgroundColor: colors.card,
      color: colors.text,
      fontSize: fontSize - 2,
      padding: 8,
      borderRadius: 6,
      marginVertical: 6,
    },
    blockquote: {
      borderLeftWidth: 3,
      borderLeftColor: colors.accent,
      paddingLeft: 10,
      marginVertical: 6,
      opacity: 0.85,
    },
    table: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 6,
      marginVertical: 6,
    },
    thead: {
      backgroundColor: 'transparent',
    },
    th: {
      padding: 8,
      borderBottomWidth: 1,
      borderColor: colors.border,
      flex: 1,
    },
    td: {
      padding: 8,
      borderBottomWidth: 1,
      borderColor: colors.border,
      flex: 1,
    },
    tr: {
      borderBottomWidth: 1,
      borderColor: colors.border,
      flexDirection: 'row' as const,
    },
    hr: {
      backgroundColor: colors.border,
      height: 1,
      marginVertical: 8,
    },
    link: {
      color: colors.accent,
    },
  }), [colors, fontSize, lineHeight]);

  return <Markdown style={mdStyles}>{children}</Markdown>;
}
