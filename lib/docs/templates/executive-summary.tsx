import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { brand } from '@/lib/docs/brand'
import { splitParagraphs, safeTruncate } from '@/lib/docs/formatters'

export type ExecSummaryProps = {
  title: string
  logline?: string
  problem?: string
  opportunity?: string
  marketFit?: string
  viability?: string
  timeline?: string
  budgetRange?: string
  contact?: { email?: string; phone?: string }
}

const styles = StyleSheet.create({
  page: { padding: 36, backgroundColor: '#FFFFFF' },
  header: { fontSize: brand.typography.title, color: brand.colors.royalBlue, marginBottom: 8 },
  sub: { fontSize: brand.typography.h2, color: brand.colors.saffron, marginBottom: 16 },
  section: { marginBottom: 10 },
  label: { fontSize: brand.typography.h2, color: brand.colors.slate700, marginBottom: 4 },
  text: { fontSize: brand.typography.body, color: brand.colors.slate900, lineHeight: 1.4 },
})

export function ExecutiveSummaryDoc(p: ExecSummaryProps) {
  const section = (label: string, text?: string) =>
    text ? (
      <View style={styles.section}>
        <Text style={styles.label}>{label}</Text>
        {splitParagraphs(text).map((t, i) => (
          <Text key={i} style={styles.text}>{t}</Text>
        ))}
      </View>
    ) : null

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.header}>{safeTruncate(p.title, 120)}</Text>
        {p.logline && <Text style={styles.sub}>{safeTruncate(p.logline, 180)}</Text>}
        {section('Problem / Opportunity', p.problem)}
        {section('Market Fit (India/Bharat)', p.marketFit || p.opportunity)}
        {section('Viability', p.viability)}
        {section('Timeline / Budget', [p.timeline, p.budgetRange].filter(Boolean).join('  |  '))}
        {p.contact && (
          <View style={{ marginTop: 8 }}>
            <Text style={styles.text}>{`Contact: ${[p.contact.email, p.contact.phone].filter(Boolean).join('  |  ')}`}</Text>
          </View>
        )}
      </Page>
    </Document>
  )
}

