// Server-only React PDF template for Pitch Deck
import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { brand, pickSectionAccent } from '@/lib/docs/brand'
import { bulletsFromList, splitParagraphs, safeTruncate } from '@/lib/docs/formatters'

export type PitchPdfProps = {
  title: string
  creator?: string
  logline?: string
  synopsis?: string
  characters?: { name: string; summary?: string }[]
  market?: string[]
  visuals?: { prompt: string; style?: string }[]
  creatorBio?: string
  contact?: { email?: string; phone?: string }
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 40,
    backgroundColor: brand.colors.white,
  },
  coverTitle: {
    fontSize: brand.typography.display,
    color: brand.colors.royalBlue,
    marginBottom: brand.spacing.md,
  },
  coverSub: {
    fontSize: brand.typography.h2,
    color: brand.colors.slate700,
    marginBottom: brand.spacing.lg,
  },
  sectionHeader: {
    fontSize: brand.typography.h1,
    marginTop: brand.spacing.lg,
    marginBottom: brand.spacing.sm,
    color: brand.colors.slate900,
  },
  rule: {
    height: 2,
    marginBottom: brand.spacing.sm,
  },
  body: { fontSize: brand.typography.body, color: brand.colors.slate900, lineHeight: 1.4 },
  bullet: { fontSize: brand.typography.body, marginBottom: 4 },
})

function Section({ title, index, children }: { title: string; index: number; children: React.ReactNode }) {
  const accent = pickSectionAccent(index)
  return (
    <View style={{ marginBottom: brand.spacing.lg }}>
      <Text style={styles.sectionHeader}>{title}</Text>
      <View style={{ ...styles.rule, backgroundColor: accent }} />
      {children}
    </View>
  )
}

export function PitchPdfDoc(props: PitchPdfProps) {
  const synParas = splitParagraphs(props.synopsis)
  const market = bulletsFromList(props.market, 12)
  const visuals = (props.visuals || []).map((v) => `• ${v.prompt}${v.style ? ` — ${v.style}` : ''}`)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.coverTitle}>{safeTruncate(props.title, 120)}</Text>
        {props.creator && <Text style={styles.coverSub}>Created by {props.creator}</Text>}

        <Section title="Logline" index={0}>
          <Text style={styles.body}>{safeTruncate(props.logline, 900)}</Text>
        </Section>

        {synParas.length > 0 && (
          <Section title="Synopsis" index={1}>
            {synParas.map((p, i) => (
              <Text key={i} style={{ ...styles.body, marginBottom: 6 }}>
                {p}
              </Text>
            ))}
          </Section>
        )}

        {(props.characters?.length || 0) > 0 && (
          <Section title="Characters" index={2}>
            {(props.characters || []).slice(0, 10).map((c, i) => (
              <Text key={i} style={styles.bullet}>{`${i + 1}. ${c.name}${c.summary ? ` — ${c.summary}` : ''}`}</Text>
            ))}
          </Section>
        )}

        {market.length > 0 && (
          <Section title="Market / Platform" index={3}>
            {market.map((m, i) => (
              <Text key={i} style={styles.bullet}>{`• ${m}`}</Text>
            ))}
          </Section>
        )}

        {visuals.length > 0 && (
          <Section title="Visual Concepts" index={4}>
            {visuals.slice(0, 12).map((v, i) => (
              <Text key={i} style={styles.bullet}>{v}</Text>
            ))}
          </Section>
        )}

        {(props.creatorBio || props.contact) && (
          <Section title="About the Creator" index={5}>
            {props.creatorBio && <Text style={styles.body}>{safeTruncate(props.creatorBio, 900)}</Text>}
            {props.contact && (
              <Text style={{ ...styles.body, marginTop: 6 }}>
                {props.contact.email ? `Email: ${props.contact.email}` : ''}
                {props.contact.phone ? `  |  Phone: ${props.contact.phone}` : ''}
              </Text>
            )}
          </Section>
        )}
      </Page>
    </Document>
  )
}

