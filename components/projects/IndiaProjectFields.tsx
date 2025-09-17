"use client";

import { useMemo, useState } from 'react'
import {
  INDIA_GENRES,
  INDIA_PLATFORMS,
  INDIA_LANGUAGES,
  INDIA_BUDGET_RANGES,
  INDIA_TARGET_AUDIENCE,
} from '@/data/constants/indiaMedia'

type Props = {
  defaultGenres?: string[]
  defaultPlatforms?: string[]
  defaultBudget?: string | null
  defaultLanguages?: string[]
  defaultAudience?: string[]
}

export default function IndiaProjectFields({
  defaultGenres = [],
  defaultPlatforms = [],
  defaultBudget = null,
  defaultLanguages = [],
  defaultAudience = [],
}: Props) {
  const [genres, setGenres] = useState<string[]>(defaultGenres)
  const [platforms, setPlatforms] = useState<string[]>(defaultPlatforms)
  const [budget, setBudget] = useState<string | null>(defaultBudget)
  const [languages, setLanguages] = useState<string[]>(defaultLanguages)
  const [audience, setAudience] = useState<string[]>(defaultAudience)

  const toggle = (value: string, list: string[], setter: (v: string[]) => void) => {
    if (list.includes(value)) setter(list.filter((v) => v !== value))
    else setter([...list, value])
  }

  // Hidden inputs to submit arrays as multiple fields
  const HiddenFields = useMemo(
    () => (
      <div className="hidden">
        {genres.map((g, i) => (
          <input key={`g-${g}-${i}`} name="genre" value={g} readOnly />
        ))}
        {platforms.map((p, i) => (
          <input key={`p-${p}-${i}`} name="target_platforms" value={p} readOnly />
        ))}
        {languages.map((l, i) => (
          <input key={`l-${l}-${i}`} name="languages" value={l} readOnly />
        ))}
        {audience.map((a, i) => (
          <input key={`a-${a}-${i}`} name="target_audience" value={a} readOnly />
        ))}
        {budget ? <input name="budget_range" value={budget} readOnly /> : null}
      </div>
    ),
    [genres, platforms, budget, languages, audience],
  )

  return (
    <div className="space-y-8">
      {HiddenFields}

      {/* Genres */}
      <div>
        <label className="block text-white mb-2 font-medium">Genre(s)</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {INDIA_GENRES.map((g) => (
            <button
              type="button"
              key={g}
              onClick={() => toggle(g, genres, setGenres)}
              className={`px-3 py-2 rounded-xl border transition-all text-sm ${
                genres.includes(g)
                  ? 'bg-manthan-saffron-500/20 border-manthan-saffron-400 text-white'
                  : 'bg-white/5 border-white/20 text-purple-200 hover:bg-white/10'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Platforms */}
      <div>
        <label className="block text-white mb-2 font-medium">Target Platforms</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {INDIA_PLATFORMS.map((p) => (
            <button
              type="button"
              key={p}
              onClick={() => toggle(p, platforms, setPlatforms)}
              className={`px-3 py-2 rounded-xl border transition-all text-sm ${
                platforms.includes(p)
                  ? 'bg-manthan-royal-500/20 border-manthan-royal-400 text-white'
                  : 'bg-white/5 border-white/20 text-purple-200 hover:bg-white/10'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Budget Range */}
      <div>
        <label className="block text-white mb-2 font-medium">Estimated Budget Range</label>
        <div className="flex flex-wrap gap-2">
          {INDIA_BUDGET_RANGES.map((b) => (
            <button
              type="button"
              key={b}
              onClick={() => setBudget(b === budget ? null : b)}
              className={`px-3 py-2 rounded-xl border transition-all text-sm ${
                budget === b
                  ? 'bg-manthan-gold-500/20 border-manthan-gold-400 text-white'
                  : 'bg-white/5 border-white/20 text-purple-200 hover:bg-white/10'
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* Languages */}
      <div>
        <label className="block text-white mb-2 font-medium">Languages</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {INDIA_LANGUAGES.map((l) => (
            <button
              type="button"
              key={l}
              onClick={() => toggle(l, languages, setLanguages)}
              className={`px-3 py-2 rounded-xl border transition-all text-sm ${
                languages.includes(l)
                  ? 'bg-manthan-mint-500/20 border-manthan-mint-400 text-white'
                  : 'bg-white/5 border-white/20 text-purple-200 hover:bg-white/10'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Target Audience */}
      <div>
        <label className="block text-white mb-2 font-medium">Target Audience</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {INDIA_TARGET_AUDIENCE.map((a) => (
            <button
              type="button"
              key={a}
              onClick={() => toggle(a, audience, setAudience)}
              className={`px-3 py-2 rounded-xl border transition-all text-sm ${
                audience.includes(a)
                  ? 'bg-manthan-coral-500/20 border-manthan-coral-400 text-white'
                  : 'bg-white/5 border-white/20 text-purple-200 hover:bg-white/10'
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

